/**
 * 系统用户 Model —— 只负责 SQL 与数据持久化
 * 注意：列表类查询一律不返回 password 字段。
 */
const { query } = require('../db/pool');

/** 对外可返回的字段（camelCase 别名） */
const PUBLIC_FIELDS = `
  id,
  username,
  real_name   AS realName,
  role,
  position,
  avatar,
  id_card     AS idCard,
  phone,
  address,
  gender,
  birthday,
  join_date   AS joinDate,
  salary,
  remark,
  status,
  create_time AS createTime
`;

/** 按账号查（含密码，仅供登录使用） */
async function findByUsernameWithPassword(username) {
  const rows = await query(
    `SELECT ${PUBLIC_FIELDS}, password FROM sys_user WHERE username = ? LIMIT 1`,
    [username]
  );
  return rows[0] || null;
}

/** 按 id 查 */
async function findById(id) {
  const rows = await query(`SELECT ${PUBLIC_FIELDS} FROM sys_user WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

/** 账号是否已存在（excludeId 用于编辑时排除自身） */
async function existsUsername(username, excludeId = null) {
  const rows = excludeId
    ? await query('SELECT id FROM sys_user WHERE username = ? AND id <> ? LIMIT 1', [username, excludeId])
    : await query('SELECT id FROM sys_user WHERE username = ? LIMIT 1', [username]);
  return rows.length > 0;
}

/** 分页列表 */
async function list({ pageNum, pageSize, offset, username, position, status }) {
  const where = [];
  const params = [];

  if (username) {
    where.push('username LIKE ?');
    params.push(`%${username}%`);
  }
  if (position) {
    where.push('position = ?');
    params.push(position);
  }
  if (status !== null && status !== undefined) {
    where.push('status = ?');
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRows = await query(`SELECT COUNT(*) AS total FROM sys_user ${whereSql}`, params);
  const total = countRows[0].total;

  const list = await query(
    `SELECT ${PUBLIC_FIELDS} FROM sys_user ${whereSql}
     ORDER BY create_time DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return { list, total, pageNum, pageSize };
}

/** 新增 */
async function create(data) {
  const rows = await query(
    `INSERT INTO sys_user
      (username, password, real_name, role, position, avatar, id_card, phone, address, gender, birthday, join_date, salary, remark, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.username, data.password, data.realName, data.role, data.position,
      data.avatar, data.idCard, data.phone, data.address, data.gender,
      data.birthday, data.joinDate, data.salary, data.remark, data.status,
    ]
  );
  // 重新查回，保证返回结构与列表一致
  return findById(rows.insertId);
}

/** 全量更新（按传入字段构建 SET，避免覆盖未传字段） */
async function update(id, data) {
  const map = {
    real_name: 'realName',
    role: 'role',
    position: 'position',
    avatar: 'avatar',
    id_card: 'idCard',
    phone: 'phone',
    address: 'address',
    gender: 'gender',
    birthday: 'birthday',
    join_date: 'joinDate',
    salary: 'salary',
    remark: 'remark',
    status: 'status',
  };

  const sets = [];
  const params = [];
  for (const [col, key] of Object.entries(map)) {
    if (data[key] !== undefined) {
      sets.push(`${col} = ?`);
      params.push(data[key]);
    }
  }
  if (!sets.length) return findById(id);

  params.push(id);
  await query(`UPDATE sys_user SET ${sets.join(', ')} WHERE id = ?`, params);
  return findById(id);
}

/** 更新密码（传已加密的哈希） */
async function updatePassword(id, hashedPassword) {
  await query('UPDATE sys_user SET password = ? WHERE id = ?', [hashedPassword, id]);
}

/** 删除 */
async function remove(id) {
  await query('DELETE FROM sys_user WHERE id = ?', [id]);
}

/** 统计用户总数（仪表盘用） */
async function countAll() {
  const rows = await query('SELECT COUNT(*) AS total FROM sys_user');
  return rows[0].total;
}

module.exports = {
  PUBLIC_FIELDS,
  findByUsernameWithPassword,
  findById,
  existsUsername,
  list,
  create,
  update,
  updatePassword,
  remove,
  countAll,
};
