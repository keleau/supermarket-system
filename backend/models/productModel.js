/**
 * 商品档案 Model
 * 支持传入事务连接 conn —— 出入库/销售等事务内调用时，SQL 必须走同一个连接。
 */
const { pool, query } = require('../db/pool');
const { BizError } = require('../utils/result');

/** 统一执行入口：有事务连接走事务，否则走连接池 */
async function run(conn, sql, params = []) {
  const [rows] = await (conn || pool).execute(sql, params);
  return rows;
}

/** 列表/详情返回字段（含 JOIN 出来的 categoryName / supplierName） */
const SELECT_FIELDS = `
  p.id,
  p.product_code AS productCode,
  p.product_name AS productName,
  p.category_id  AS categoryId,
  c.name         AS categoryName,
  p.spec,
  p.unit,
  p.cost_price   AS costPrice,
  p.sale_price   AS salePrice,
  p.stock_num    AS stockNum,
  p.warn_num     AS warnNum,
  p.supplier_id  AS supplierId,
  s.supplier_name AS supplierName,
  p.image_url    AS imageUrl,
  p.status,
  p.create_time  AS createTime
`;

const JOINS = `
  FROM product p
  LEFT JOIN category c ON c.id = p.category_id
  LEFT JOIN supplier s ON s.id = p.supplier_id
`;

/** 分页列表 */
async function list({ pageNum, pageSize, offset, productName, productCode, categoryId, status }) {
  const where = [];
  const params = [];

  if (productName) {
    where.push('p.product_name LIKE ?');
    params.push(`%${productName}%`);
  }
  if (productCode) {
    where.push('p.product_code LIKE ?');
    params.push(`%${productCode}%`);
  }
  if (categoryId !== null && categoryId !== undefined) {
    where.push('p.category_id = ?');
    params.push(categoryId);
  }
  if (status !== null && status !== undefined) {
    where.push('p.status = ?');
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRows = await query(`SELECT COUNT(*) AS total ${JOINS} ${whereSql}`, params);
  const total = countRows[0].total;

  const rows = await query(
    `SELECT ${SELECT_FIELDS} ${JOINS} ${whereSql}
     ORDER BY p.create_time DESC, p.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return { list: rows, total, pageNum, pageSize };
}

/** 按 id 查详情 */
async function findById(id) {
  const rows = await query(`SELECT ${SELECT_FIELDS} ${JOINS} WHERE p.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

/**
 * 按 id 查原始行并加行锁（事务内使用，防止并发超卖）
 */
async function findByIdForUpdate(conn, id) {
  const rows = await run(conn, 'SELECT * FROM product WHERE id = ? FOR UPDATE', [id]);
  return rows[0] || null;
}

/** 条码是否已存在 */
async function existsCode(code, excludeId = null) {
  const rows = excludeId
    ? await query('SELECT id FROM product WHERE product_code = ? AND id <> ? LIMIT 1', [code, excludeId])
    : await query('SELECT id FROM product WHERE product_code = ? LIMIT 1', [code]);
  return rows.length > 0;
}

/** 生成唯一商品条码：690 + 10 位序号 */
async function generateProductCode(conn) {
  const rows = await run(conn, "SELECT MAX(CAST(SUBSTRING(product_code, 4) AS UNSIGNED)) AS maxSeq FROM product WHERE product_code LIKE '690%'");
  const maxSeq = rows[0].maxSeq || 0;
  return `690${String(maxSeq + 1).padStart(10, '0')}`;
}

/** 新增 */
async function create(conn, data) {
  const result = await run(
    conn,
    `INSERT INTO product
      (product_code, product_name, category_id, spec, unit, cost_price, sale_price,
       stock_num, warn_num, supplier_id, image_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.productCode, data.productName, data.categoryId, data.spec, data.unit,
      data.costPrice, data.salePrice, data.stockNum, data.warnNum,
      data.supplierId, data.imageUrl, data.status,
    ]
  );
  return { id: result.insertId };
}

/**
 * 更新商品档案
 * 成本价与库存都不在此更新：
 * - 成本只能由入库按移动加权平均自动计算
 * - 库存只能由入库 / 出库 / 销售 / 盘点等单据驱动
 */
async function update(conn, id, data) {
  await run(
    conn,
    `UPDATE product SET
       product_code = ?, product_name = ?, category_id = ?, spec = ?, unit = ?,
       sale_price = ?, warn_num = ?,
       supplier_id = ?, image_url = ?, status = ?
     WHERE id = ?`,
    [
      data.productCode, data.productName, data.categoryId, data.spec, data.unit,
      data.salePrice, data.warnNum,
      data.supplierId, data.imageUrl, data.status, id,
    ]
  );
}

/** 入库后回写移动加权平均成本（事务内使用） */
async function updateCostPrice(conn, id, costPrice) {
  await run(conn, 'UPDATE product SET cost_price = ? WHERE id = ?', [costPrice, id]);
}

/**
 * 库存增减（事务内使用）
 * @param {number} delta 正数加库存，负数减库存
 */
async function changeStock(conn, id, delta) {
  if (delta >= 0) {
    await run(conn, 'UPDATE product SET stock_num = stock_num + ? WHERE id = ?', [delta, id]);
    return;
  }

  // 条件更新兜底：即使调用方漏做库存校验，也不会把库存扣成负数
  const result = await run(
    conn,
    'UPDATE product SET stock_num = stock_num + ? WHERE id = ? AND stock_num >= ?',
    [delta, id, -delta]
  );
  if (result.affectedRows !== 1) {
    throw new BizError('库存不足，扣减失败');
  }

  // 扣到 0 自动下架，避免 0 库存商品仍出现在收银选品和「在售」列表里
  await run(
    conn,
    'UPDATE product SET status = 0 WHERE id = ? AND stock_num = 0 AND status = 1',
    [id]
  );
}

/** 单独更新上下架状态（事务内使用） */
async function updateStatus(conn, id, status) {
  await run(conn, 'UPDATE product SET status = ? WHERE id = ?', [status, id]);
}

/** 删除 */
async function remove(id) {
  await query('DELETE FROM product WHERE id = ?', [id]);
}

/** 是否已有业务记录（流水、销售明细或盘点明细） */
async function hasBusinessRecords(id) {
  const rows = await query(
    `SELECT
       (SELECT COUNT(*) FROM stock_log WHERE product_id = ?) +
       (SELECT COUNT(*) FROM sale_item WHERE product_id = ?) +
       (SELECT COUNT(*) FROM stocktake_item WHERE product_id = ?) AS cnt`,
    [id, id, id]
  );
  return rows[0].cnt > 0;
}

/** 商品总种类数（SKU） */
async function countAll() {
  const rows = await query('SELECT COUNT(*) AS total FROM product');
  return rows[0].total;
}

/**
 * 商品下拉选项
 * @param {{ includeOffline?: boolean }} [opts]
 *   includeOffline=true 时包含已下架商品 —— 出入库需要给「因库存为 0 被自动下架」的商品补货，
 *   收银开单则必须保持只返回在售商品。
 */
async function options({ includeOffline = false } = {}) {
  return query(
    `SELECT p.id,
            p.product_code AS productCode,
            p.product_name AS productName,
            p.sale_price   AS salePrice,
            p.stock_num    AS stockNum,
            p.unit,
            p.status,
            c.name         AS categoryName
     FROM product p
     LEFT JOIN category c ON c.id = p.category_id
     ${includeOffline ? '' : 'WHERE p.status = 1'}
     ORDER BY p.id ASC`
  );
}

module.exports = {
  run,
  list,
  findById,
  findByIdForUpdate,
  existsCode,
  generateProductCode,
  create,
  update,
  updateCostPrice,
  changeStock,
  updateStatus,
  remove,
  hasBusinessRecords,
  countAll,
  options,
};
