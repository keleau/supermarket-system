/**
 * 操作日志写入
 *
 * 关键单据动作（入库、销售、退货、盘点、审核）在业务事务内调用，
 * 保证「业务成功 = 日志存在」。查询页面仅管理员可访问。
 */
const { pool } = require('../db/pool');

async function writeLog(conn, req, entry) {
  const user = (req && req.user) || {};
  const sql = `INSERT INTO operation_log
    (user_id, username, role, position, module, action, biz_no,
     before_status, after_status, detail, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  const params = [
    user.id ?? null,
    user.username || '',
    user.role || '',
    user.position || '',
    entry.module,
    entry.action,
    String(entry.bizNo ?? '').slice(0, 40),
    entry.beforeStatus ?? null,
    entry.afterStatus ?? null,
    String(entry.detail ?? '').slice(0, 500),
    String((req && req.ip) || '').slice(0, 45),
  ];

  await (conn || pool).execute(sql, params);
}

module.exports = { writeLog };
