/**
 * 采购单 / 采购明细 Model
 */
const { query, run } = require('../db/pool');

const ORDER_FIELDS = `
  id,
  order_no       AS orderNo,
  supplier_id    AS supplierId,
  supplier_name  AS supplierName,
  status,
  total_amount   AS totalAmount,
  payable_amount AS payableAmount,
  paid_amount    AS paidAmount,
  operator,
  submit_time    AS submitTime,
  receiver,
  receive_time   AS receiveTime,
  remark,
  create_time    AS createTime,
  CASE
    WHEN payable_amount <= 0 THEN 0
    WHEN paid_amount <= 0 THEN 0
    WHEN paid_amount < payable_amount THEN 1
    ELSE 2
  END AS payStatus
`;

const ITEM_FIELDS = `
  id,
  product_id   AS productId,
  product_name AS productName,
  unit,
  quantity,
  price,
  amount
`;

async function generateOrderNo(conn, dateStr) {
  const prefix = `CG${dateStr}-`;
  const rows = await run(
    conn,
    `SELECT MAX(CAST(SUBSTRING(order_no, ?) AS UNSIGNED)) AS maxSeq
     FROM purchase_order WHERE order_no LIKE ?`,
    [prefix.length + 1, `${prefix}%`]
  );
  const next = (rows[0].maxSeq || 0) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

async function createOrder(conn, data) {
  const result = await run(
    conn,
    `INSERT INTO purchase_order
      (order_no, supplier_id, supplier_name, status, total_amount, payable_amount, paid_amount, operator, remark)
     VALUES (?, ?, ?, 0, ?, 0, 0, ?, ?)`,
    [data.orderNo, data.supplierId, data.supplierName, data.totalAmount, data.operator, data.remark || '']
  );
  return result.insertId;
}

async function createItems(conn, orderId, items) {
  if (!items.length) return;

  const placeholders = items.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
  const params = [];
  for (const item of items) {
    params.push(
      orderId,
      item.productId,
      item.productName,
      item.unit || '个',
      item.quantity,
      item.price,
      item.amount
    );
  }

  await run(
    conn,
    `INSERT INTO purchase_item
      (order_id, product_id, product_name, unit, quantity, price, amount)
     VALUES ${placeholders}`,
    params
  );
}

async function findById(id, conn = null) {
  const orders = await run(conn, `SELECT ${ORDER_FIELDS} FROM purchase_order WHERE id = ? LIMIT 1`, [id]);
  const order = orders[0];
  if (!order) return null;

  order.items = await run(
    conn,
    `SELECT ${ITEM_FIELDS} FROM purchase_item WHERE order_id = ? ORDER BY id ASC`,
    [id]
  );
  return order;
}

async function findByIdForUpdate(conn, id) {
  const rows = await run(conn, 'SELECT * FROM purchase_order WHERE id = ? FOR UPDATE', [id]);
  return rows[0] || null;
}

async function findItems(conn, orderId) {
  return run(
    conn,
    `SELECT ${ITEM_FIELDS} FROM purchase_item WHERE order_id = ? ORDER BY id ASC`,
    [orderId]
  );
}

async function list({ pageNum, pageSize, offset, orderNo, supplierId, status, startTime, endTime }) {
  const where = [];
  const params = [];

  if (orderNo) {
    where.push('order_no LIKE ?');
    params.push(`%${orderNo}%`);
  }
  if (supplierId !== null && supplierId !== undefined) {
    where.push('supplier_id = ?');
    params.push(supplierId);
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

  const countRows = await query(`SELECT COUNT(*) AS total FROM purchase_order ${whereSql}`, params);
  const total = countRows[0].total;

  const rows = await query(
    `SELECT ${ORDER_FIELDS} FROM purchase_order ${whereSql}
     ORDER BY create_time DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return { list: rows, total, pageNum, pageSize };
}

async function updateOrder(conn, id, data) {
  await run(
    conn,
    `UPDATE purchase_order
     SET supplier_id = ?, supplier_name = ?, total_amount = ?, remark = ?
     WHERE id = ?`,
    [data.supplierId, data.supplierName, data.totalAmount, data.remark || '', id]
  );
}

async function replaceItems(conn, orderId, items) {
  await run(conn, 'DELETE FROM purchase_item WHERE order_id = ?', [orderId]);
  await createItems(conn, orderId, items);
}

async function submitOrder(conn, id) {
  await run(
    conn,
    'UPDATE purchase_order SET status = 1, submit_time = NOW() WHERE id = ?',
    [id]
  );
}

async function receiveOrder(conn, id, receiver) {
  await run(
    conn,
    `UPDATE purchase_order
     SET status = 2, receiver = ?, receive_time = NOW(), payable_amount = total_amount
     WHERE id = ?`,
    [receiver, id]
  );
}

async function cancelOrder(conn, id) {
  await run(conn, 'UPDATE purchase_order SET status = 3 WHERE id = ?', [id]);
}

/** 登记付款：条件更新兜底，避免并发多付 */
async function registerPayment(conn, id, amount) {
  return run(
    conn,
    `UPDATE purchase_order
     SET paid_amount = paid_amount + ?
     WHERE id = ? AND status = 2 AND paid_amount + ? <= payable_amount`,
    [amount, id, amount]
  );
}

module.exports = {
  generateOrderNo,
  createOrder,
  createItems,
  findById,
  findByIdForUpdate,
  findItems,
  list,
  updateOrder,
  replaceItems,
  submitOrder,
  receiveOrder,
  cancelOrder,
  registerPayment,
};
