/**
 * MySQL 连接池
 * - dateStrings: true  → DATETIME/DATE 直接返回 'YYYY-MM-DD HH:mm:ss' / 'YYYY-MM-DD' 字符串
 * - decimalNumbers: true → DECIMAL 返回 JS number，便于 JSON 输出
 */
const mysql = require('mysql2/promise');
const config = require('../config');

// 只接受 ±HH:MM，避免把任意字符串拼进 SET time_zone
const MYSQL_TIME_ZONE = config.db.timeZone;
if (!/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(MYSQL_TIME_ZONE)) {
  throw new Error(`DB_TIME_ZONE 格式不正确：${MYSQL_TIME_ZONE}（示例：+08:00）`);
}

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  dateStrings: true,
  decimalNumbers: true,
  supportBigNumbers: true,
});

// 新连接统一会话时区，保证 NOW() / CURRENT_TIMESTAMP 与 Node 计算的日期边界一致
pool.on('connection', (conn) => {
  conn.query(`SET time_zone = '${MYSQL_TIME_ZONE}'`, (err) => {
    if (err) console.error('[db] 设置会话时区失败：', err.message);
  });
});

/**
 * 执行 SQL（自动从连接池取连接并归还）
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<Array>} rows
 */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * 执行 SQL 并返回 result 元信息（含 insertId / affectedRows）
 */
async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

/**
 * 统一查询入口：传事务连接时走该连接，否则走连接池。
 * Model 内部的查询统一用它，避免每个 model 各写一份。
 */
async function run(conn, sql, params = []) {
  const [rows] = await (conn || pool).execute(sql, params);
  return rows;
}

/**
 * 事务封装：回调内抛错自动回滚，正常返回自动提交
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<any>} handler
 */
async function transaction(handler) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await handler(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (rollbackErr) {
      console.error('[transaction] 回滚失败:', rollbackErr);
    }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, execute, run, transaction };
