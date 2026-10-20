/**
 * 数据库初始化脚本
 *   1) 创建数据库（若不存在）
 *   2) 执行 db/schema.sql —— 建表
 *   3) 执行 db/seed.sql   —— 预置分类/供应商/商品/流水/销售数据
 *   4) 以 bcrypt 加密写入系统用户（密码不可用纯 SQL 预置）
 *
 * 用法：npm run db:init
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const config = require('../config');

/** 去掉 SQL 文件中的行注释，避免多语句执行时报错 */
function stripComments(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

/** 预置系统用户（密码统一为 config.defaultPassword） */
const USERS = [
  { username: 'admin',      realName: '系统管理员', position: '管理员', role: 'admin',    phone: '13900000001', gender: '男', salary: 15000, remark: '系统最高权限' },
  { username: 'cangku01',   realName: '王仓管',     position: '仓管',   role: 'operator', phone: '13900000002', gender: '男', salary: 6500,  remark: '负责出入库' },
  { username: 'shouyin01',  realName: '张敏',       position: '收银员', role: 'operator', phone: '13900000003', gender: '女', salary: 5500,  remark: '前台收银' },
  { username: 'houqin01',   realName: '李强',       position: '后勤',   role: 'operator', phone: '13900000004', gender: '男', salary: 5000,  remark: '后勤保障' },
  { username: 'caigou01',   realName: '赵采购',     position: '采购',   role: 'operator', phone: '13900000005', gender: '女', salary: 7000,  remark: '负责供应商对接' },
  { username: 'kuaiji01',   realName: '孙会计',     position: '会计',   role: 'operator', phone: '13900000006', gender: '女', salary: 8000,  remark: '财务核算' },
];

async function main() {
  const { host, port, user, password, database } = config.db;

  // ---------- 1. 建库 ----------
  const rootConn = await mysql.createConnection({
    host, port, user, password,
    multipleStatements: true,
    charset: 'utf8mb4',
  });
  await rootConn.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`
  );
  console.log(`[init] 数据库 ${database} 就绪`);

  // ---------- 2 & 3. 建表 + 预置数据 ----------
  await rootConn.query(`USE \`${database}\``);
  const schemaSql = stripComments(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  const seedSql = stripComments(fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8'));
  await rootConn.query(schemaSql);
  console.log('[init] 建表完成（7 张表）');
  await rootConn.query(seedSql);
  console.log('[init] 预置数据完成（5 分类 / 5 供应商 / 16 商品 / 流水 / 销售单）');

  // ---------- 4. 用户（bcrypt） ----------
  const hash = bcrypt.hashSync(config.defaultPassword, 10);
  await rootConn.query('DELETE FROM `sys_user`');
  for (const u of USERS) {
    await rootConn.query(
      `INSERT INTO sys_user
        (username, password, real_name, role, position, avatar, id_card, phone, address, gender, birthday, join_date, salary, remark, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        u.username, hash, u.realName, u.role, u.position,
        'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png',
        '', u.phone, '浙江省杭州市', u.gender,
        '1990-01-01', '2023-06-01', u.salary, u.remark,
      ]
    );
  }
  console.log(`[init] 系统用户完成（${USERS.length} 个，初始密码均为 ${config.defaultPassword}）`);

  await rootConn.end();
  console.log('\n[init] ✅ 初始化全部完成，执行 npm start 启动服务');
}

main().catch((err) => {
  console.error('[init] ❌ 初始化失败:', err.message);
  process.exit(1);
});
