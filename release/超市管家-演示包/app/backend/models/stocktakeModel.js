/**
 * 库存盘点单 / 盘点明细 Model
 */
const { pool, query } = require('../db/pool');

async function run(conn, sql, params = []) {
  const [rows] = await (conn || pool).execute(sql, params);
  return rows;
}

const ORDER_FIELDS = `
  id,
  take_no            AS takeNo,
  status,
  operator,
  auditor,
  audit_time         AS auditTime,
  total_gain_qty     AS totalGainQty,
  total_loss_qty     AS totalLossQty,
  total_gain_amount  AS totalGainAmount,
  total_loss_amount  AS totalLossAmount,
  remark,
  create_time        AS createTime
`;

const ITEM_FIELDS = `
  id,
  product_id    AS productId,
  product_name  AS productName,
  unit,
  book_qty      AS bookQty,
  actual_qty    AS actualQty,
  diff_qty      AS diffQty,
  cost_price    AS costPrice,
  diff_amount   AS diffAmount,
  reason
`;

/** 生成盘点单号：PD + yyyyMMdd + '-' + 3 位当日序号 */
async function generateTakeNo(conn, dateStr) {
  const prefix = `PD${dateStr}-`;
  const rows = await run(
    conn,
    `SELECT MAX(CAST(SUBSTRING(take_no, ?) AS UNSIGNED)) AS maxSeq
     FROM stocktake_order WHERE take_no LIKE ?`,
    [prefix.length + 1, `${prefix}%`]
  );
  const next = (rows[0].maxSeq || 0) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

async function createOrder(conn, data) {
  const result = await run(
    conn,
    `INSERT INTO stocktake_order (take_no, status, operator, remark)
     VALUES (?, 0, ?, ?)`,
    [data.takeNo, data.operator, data.remark || '']
  );
  return result.insertId;
}

async function createItems(conn, orderId, items) {
  if (!items.length) return;

  // 一次多行插入，几十到几百个商品也不用逐条往返
  const placeholders = items.map(() => '(?, ?, ?, ?, ?, ?, 0, ?, 0, \'\')').join(', ');
  const params = [];
  for (const it of items) {
    params.push(
      orderId, it.productId, it.productName, it.unit,
      it.bookQty, it.actualQty, it.costPrice
    );
  }

  await run(
    conn,
    `INSERT INTO stocktake_item
      (order_id, product_id, product_name, unit, book_qty, actual_qty, diff_qty, cost_price, diff_amount, reason)
     VALUES ${placeholders}`,
    params
  );
}

/** 创建任务时的商品快照（categoryId 为空则全量） */
async function findSnapshotProducts(conn, categoryId) {
  return run(
    conn,
    `SELECT id,
            product_name AS productName,
            unit,
            stock_num    AS stockNum,
            cost_price   AS costPrice
     FROM product
     WHERE (? IS NULL OR category_id = ?)
     ORDER BY id ASC`,
    [categoryId, categoryId]
  );
}

async function findById(id, conn = null) {
  const orders = await run(conn, `SELECT ${ORDER_FIELDS} FROM stocktake_order WHERE id = ? LIMIT 1`, [id]);
  const order = orders[0];
  if (!order) return null;

  order.items = await run(
    conn,
    `SELECT ${ITEM_FIELDS} FROM stocktake_item WHERE order_id = ? ORDER BY id ASC`,
    [id]
  );
  return order;
}

async function findByIdForUpdate(conn, id) {
  const rows = await run(conn, 'SELECT * FROM stocktake_order WHERE id = ? FOR UPDATE', [id]);
  return rows[0] || null;
}

async function findItems(conn, orderId) {
  return run(
    conn,
    `SELECT ${ITEM_FIELDS} FROM stocktake_item WHERE order_id = ? ORDER BY id ASC`,
    [orderId]
  );
}

async function list({ pageNum, pageSize, offset, takeNo, status, startTime, endTime }) {
  const where = [];
  const params = [];

  if (takeNo) {
    where.push('take_no LIKE ?');
    params.push(`%${takeNo}%`);
  }
  if (status !== null && status !== undefined) {
    where.push('status = ?');
    params.push(status);
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

  const countRows = await query(`SELECT COUNT(*) AS total FROM stocktake_order ${whereSql}`, params);
  const total = countRows[0].total;

  const listRows = await query(
    `SELECT ${ORDER_FIELDS} FROM stocktake_order ${whereSql}
     ORDER BY create_time DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return { list: listRows, total, pageNum, pageSize };
}

/** 保存实盘数量：差异按快照账面数和快照成本即时重算 */
async function updateItem(conn, orderId, itemId, { actualQty, reason }) {
  return run(
    conn,
    `UPDATE stocktake_item
     SET actual_qty = ?,
         diff_qty = ? - book_qty,
         diff_amount = (? - book_qty) * cost_price,
         reason = ?
     WHERE id = ? AND order_id = ?`,
    [actualQty, actualQty, actualQty, reason || '', Number(itemId), orderId]
  );
}

/** 按明细重算盘点单汇总 */
async function recomputeTotals(conn, orderId) {
  await run(
    conn,
    `UPDATE stocktake_order o
     SET total_gain_qty = (
           SELECT COALESCE(SUM(CASE WHEN diff_qty > 0 THEN diff_qty ELSE 0 END), 0)
           FROM stocktake_item WHERE order_id = o.id
         ),
         total_loss_qty = (
           SELECT COALESCE(SUM(CASE WHEN diff_qty < 0 THEN -diff_qty ELSE 0 END), 0)
           FROM stocktake_item WHERE order_id = o.id
         ),
         total_gain_amount = (
           SELECT COALESCE(SUM(CASE WHEN diff_qty > 0 THEN diff_amount ELSE 0 END), 0)
           FROM stocktake_item WHERE order_id = o.id
         ),
         total_loss_amount = (
           SELECT COALESCE(SUM(CASE WHEN diff_qty < 0 THEN -diff_amount ELSE 0 END), 0)
           FROM stocktake_item WHERE order_id = o.id
         )
     WHERE o.id = ?`,
    [orderId]
  );
}

async function updateStatus(conn, id, status) {
  await run(conn, 'UPDATE stocktake_order SET status = ? WHERE id = ?', [status, id]);
}

async function auditOrder(conn, id, auditor) {
  await run(
    conn,
    'UPDATE stocktake_order SET status = 2, auditor = ?, audit_time = NOW() WHERE id = ?',
    [auditor, id]
  );
}

/** 审核时用「审核时库存/成本」覆盖快照明细 */
async function updateItemAtAudit(conn, itemId, bookQty, diffQty, costPrice, diffAmount) {
  await run(
    conn,
    `UPDATE stocktake_item
     SET book_qty = ?, diff_qty = ?, cost_price = ?, diff_amount = ?
     WHERE id = ?`,
    [bookQty, diffQty, costPrice, diffAmount, itemId]
  );
}

module.exports = {
  run,
  generateTakeNo,
  createOrder,
  createItems,
  findSnapshotProducts,
  findById,
  findByIdForUpdate,
  findItems,
  list,
  updateItem,
  recomputeTotals,
  updateStatus,
  auditOrder,
  updateItemAtAudit,
};
