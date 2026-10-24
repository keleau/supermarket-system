/**
 * 供应商 Model
 */
const { query } = require('../db/pool');

const FIELDS = `
  id,
  supplier_name  AS supplierName,
  contact_person AS contactPerson,
  phone,
  address,
  remark,
  create_time    AS createTime
`;

/** 分页列表 */
async function list({ pageNum, pageSize, offset, supplierName, contactPerson }) {
  const where = [];
  const params = [];

  if (supplierName) {
    where.push('supplier_name LIKE ?');
    params.push(`%${supplierName}%`);
  }
  if (contactPerson) {
    where.push('contact_person LIKE ?');
    params.push(`%${contactPerson}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRows = await query(`SELECT COUNT(*) AS total FROM supplier ${whereSql}`, params);
  const total = countRows[0].total;

  const rows = await query(
    `SELECT ${FIELDS},
            (SELECT COUNT(*) FROM product p WHERE p.supplier_id = supplier.id) AS productCount
     FROM supplier ${whereSql}
     ORDER BY create_time DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return { list: rows, total, pageNum, pageSize };
}

/** 下拉选项（仅 id + 名称） */
async function options() {
  return query('SELECT id, supplier_name AS supplierName FROM supplier ORDER BY id ASC');
}

/** 按 id 查 */
async function findById(id) {
  const rows = await query(`SELECT ${FIELDS} FROM supplier WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

/** 按名称查（入库时回填 supplier_name 用） */
async function findByName(name) {
  const rows = await query(`SELECT ${FIELDS} FROM supplier WHERE supplier_name = ? LIMIT 1`, [name]);
  return rows[0] || null;
}

/** 名称是否已存在 */
async function existsName(name, excludeId = null) {
  const rows = excludeId
    ? await query('SELECT id FROM supplier WHERE supplier_name = ? AND id <> ? LIMIT 1', [name, excludeId])
    : await query('SELECT id FROM supplier WHERE supplier_name = ? LIMIT 1', [name]);
  return rows.length > 0;
}

/** 是否被商品引用 */
async function isReferenced(id) {
  const rows = await query('SELECT id FROM product WHERE supplier_id = ? LIMIT 1', [id]);
  return rows.length > 0;
}

/** 新增 */
async function create(data) {
  const rows = await query(
    'INSERT INTO supplier (supplier_name, contact_person, phone, address, remark) VALUES (?, ?, ?, ?, ?)',
    [data.supplierName, data.contactPerson, data.phone, data.address, data.remark]
  );
  return { id: rows.insertId };
}

/** 更新 */
async function update(id, data) {
  await query(
    'UPDATE supplier SET supplier_name = ?, contact_person = ?, phone = ?, address = ?, remark = ? WHERE id = ?',
    [data.supplierName, data.contactPerson, data.phone, data.address, data.remark, id]
  );
}

/** 删除 */
async function remove(id) {
  await query('DELETE FROM supplier WHERE id = ?', [id]);
}

/** 供应商数量 */
async function countAll() {
  const rows = await query('SELECT COUNT(*) AS total FROM supplier');
  return rows[0].total;
}

module.exports = {
  list, options, findById, findByName, existsName, isReferenced, create, update, remove, countAll,
};
