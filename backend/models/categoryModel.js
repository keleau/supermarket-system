/**
 * 商品分类 Model
 */
const { query } = require('../db/pool');

const FIELDS = `
  id,
  name,
  color_token AS colorToken,
  description,
  sort,
  status,
  create_time AS createTime
`;

/** 全量列表（按 sort 升序） */
async function listAll() {
  return query(`SELECT ${FIELDS} FROM category ORDER BY sort ASC, id ASC`);
}

/** 按 id 查 */
async function findById(id) {
  const rows = await query(`SELECT ${FIELDS} FROM category WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

/** 名称是否已存在 */
async function existsName(name, excludeId = null) {
  const rows = excludeId
    ? await query('SELECT id FROM category WHERE name = ? AND id <> ? LIMIT 1', [name, excludeId])
    : await query('SELECT id FROM category WHERE name = ? LIMIT 1', [name]);
  return rows.length > 0;
}

/** 该分类下是否有商品 */
async function hasProducts(id) {
  const rows = await query('SELECT id FROM product WHERE category_id = ? LIMIT 1', [id]);
  return rows.length > 0;
}

/** 新增 */
async function create(data) {
  const rows = await query(
    'INSERT INTO category (name, color_token, description, sort, status) VALUES (?, ?, ?, ?, ?)',
    [data.name, data.colorToken, data.description, data.sort, data.status]
  );
  return { id: rows.insertId };
}

/** 更新 */
async function update(id, data) {
  await query(
    'UPDATE category SET name = ?, color_token = ?, description = ?, sort = ?, status = ? WHERE id = ?',
    [data.name, data.colorToken, data.description, data.sort, data.status, id]
  );
}

/** 删除 */
async function remove(id) {
  await query('DELETE FROM category WHERE id = ?', [id]);
}

/** 分类数量 */
async function countAll() {
  const rows = await query('SELECT COUNT(*) AS total FROM category');
  return rows[0].total;
}

module.exports = { listAll, findById, existsName, hasProducts, create, update, remove, countAll };
