/**
 * 操作日志 Model（只读查询）
 */
const { query } = require('../db/pool');

const LOG_FIELDS = `
  id,
  user_id       AS userId,
  username,
  role,
  position,
  module,
  action,
  biz_no        AS bizNo,
  before_status AS beforeStatus,
  after_status  AS afterStatus,
  detail,
  ip,
  create_time   AS createTime
`;

async function list({ pageNum, pageSize, offset, module, action, username, startTime, endTime }) {
  const where = [];
  const params = [];

  if (module) {
    where.push('module = ?');
    params.push(module);
  }
  if (action) {
    where.push('action = ?');
    params.push(action);
  }
  if (username) {
    where.push('username LIKE ?');
    params.push(`%${username}%`);
  }
  if (startTime) {
    where.push('create_time >= ?');
    params.push(startTime);
  }
  if (endTime) {
    where.push('create_time <= ?');
    params.push(endTime);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRows = await query(`SELECT COUNT(*) AS total FROM operation_log ${whereSql}`, params);
  const total = countRows[0].total;

  const rows = await query(
    `SELECT ${LOG_FIELDS} FROM operation_log ${whereSql}
     ORDER BY create_time DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return { list: rows, total, pageNum, pageSize };
}

module.exports = { list };
