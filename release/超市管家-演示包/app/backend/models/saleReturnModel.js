/**
 * 销售退货单 / 退货明细 Model
 *
 * 退货单是独立单据（红字），不直接改动原销售单明细：
 * - 申请时把原销售明细复制成退货明细快照，保证后续商品改名/改价不影响历史单据；
 * - 管理员确认后才回补库存并把原销售单置为「已退货」，从而冲减营收统计。
 */
const { pool, query } = require('../db/pool');

async function run(conn, sql, params = []) {
  const [rows] = await (conn || pool).execute(sql, params);
  return rows;
}

const ORDER_FIELDS = `
  id,
  return_no      AS returnNo,
  sale_record_id AS saleRecordId,
  sale_no        AS saleNo,
  status,
  total_quantity AS totalQuantity,
  total_amount   AS totalAmount,
  operator,
  auditor,
  audit_time     AS auditTime,
  remark,
  create_time    AS createTime
`;

const ITEM_FIELDS = `
  id,
  product_id    AS productId,
  product_name  AS productName,
  category_name AS categoryName,
  quantity,
  sale_price    AS salePrice,
  cost_price    AS costPrice,
  amount
`;

/**
 * 生成退货单号：TH + yyyyMMdd + '-' + 3 位当日序号
 * 并发场景由 sale_return_order.uk_return_no 唯一索引兜底，冲突时上层重试。
 */
async function generateReturnNo(conn, dateStr) {
  const prefix = `TH${dateStr}-`;
  const rows = await run(
    conn,
    `SELECT MAX(CAST(SUBSTRING(return_no, ?) AS UNSIGNED)) AS maxSeq
     FROM sale_return_order WHERE return_no LIKE ?`,
    [prefix.length + 1, `${prefix}%`]
  );
  const next = (rows[0].maxSeq || 0) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

/** 写入退货主单（初始为待确认） */
async function createOrder(conn, data) {
  const result = await run(
    conn,
    `INSERT INTO sale_return_order
      (return_no, sale_record_id, sale_no, status, total_quantity, total_amount, operator, remark)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
    [
      data.returnNo,
      data.saleRecordId,
      data.saleNo,
      data.totalQuantity,
      data.totalAmount,
      data.operator || '',
      data.remark || '',
    ]
  );
  return result.insertId;
}

/** 批量写入退货明细快照 */
async function createItems(conn, returnId, items) {
  if (!items.length) return;

  const placeholders = items.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  const params = [];
  for (const it of items) {
    params.push(
      returnId,
      it.productId,
      it.productName,
      it.categoryName || '',
      it.quantity,
      it.salePrice,
      it.costPrice,
      it.amount
    );
  }

  await run(
    conn,
    `INSERT INTO sale_return_item
      (return_id, product_id, product_name, category_name, quantity, sale_price, cost_price, amount)
     VALUES ${placeholders}`,
    params
  );
}

/** 详情（含明细） */
async function findById(id, conn = null) {
  const orders = await run(
    conn,
    `SELECT ${ORDER_FIELDS} FROM sale_return_order WHERE id = ? LIMIT 1`,
    [id]
  );
  const order = orders[0];
  if (!order) return null;

  order.items = await run(
    conn,
    `SELECT ${ITEM_FIELDS} FROM sale_return_item WHERE return_id = ? ORDER BY id ASC`,
    [id]
  );
  return order;
}

/** 加行锁（确认 / 拒绝 / 取消时使用） */
async function findByIdForUpdate(conn, id) {
  const rows = await run(conn, 'SELECT * FROM sale_return_order WHERE id = ? FOR UPDATE', [id]);
  return rows[0] || null;
}

/** 不加锁读取（确认时先取 sale_record_id，再按固定顺序加锁） */
async function findRawById(conn, id) {
  const rows = await run(conn, 'SELECT * FROM sale_return_order WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function findItems(conn, returnId) {
  return run(
    conn,
    `SELECT ${ITEM_FIELDS} FROM sale_return_item WHERE return_id = ? ORDER BY id ASC`,
    [returnId]
  );
}

/**
 * 原销售单是否已有「待确认 / 已确认」的退货单。
 * 整单退货一张销售单只能退一次；被拒绝/取消后允许重新申请。
 */
async function findActiveBySaleRecordId(conn, saleRecordId) {
  const rows = await run(
    conn,
    `SELECT * FROM sale_return_order
     WHERE sale_record_id = ? AND status IN (0, 1)
     ORDER BY id DESC LIMIT 1`,
    [saleRecordId]
  );
  return rows[0] || null;
}

/** 作废销售单时，把其下待确认的退货申请一并取消，避免再次被确认 */
async function cancelPendingBySaleRecordId(conn, saleRecordId) {
  await run(
    conn,
    'UPDATE sale_return_order SET status = 3 WHERE sale_record_id = ? AND status = 0',
    [saleRecordId]
  );
}

/** 确认退货（条件更新兜底，避免并发重复确认） */
async function confirmOrder(conn, id, auditor) {
  return run(
    conn,
    `UPDATE sale_return_order
     SET status = 1, auditor = ?, audit_time = NOW()
     WHERE id = ? AND status = 0`,
    [auditor, id]
  );
}

/** 拒绝 / 取消 */
async function updateStatus(conn, id, status) {
  await run(conn, 'UPDATE sale_return_order SET status = ? WHERE id = ?', [status, id]);
}

/** 分页列表（不含明细） */
async function list({ pageNum, pageSize, offset, returnNo, saleNo, status, operator, startTime, endTime }) {
  const where = [];
  const params = [];

  if (returnNo) {
    where.push('return_no LIKE ?');
    params.push(`%${returnNo}%`);
  }
  if (saleNo) {
    where.push('sale_no LIKE ?');
    params.push(`%${saleNo}%`);
  }
  if (status !== null && status !== undefined) {
    where.push('status = ?');
    params.push(status);
  }
  if (operator) {
    where.push('operator = ?');
    params.push(operator);
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

  const countRows = await query(
    `SELECT COUNT(*) AS total FROM sale_return_order ${whereSql}`,
    params
  );
  const total = countRows[0].total;

  const rows = await query(
    `SELECT ${ORDER_FIELDS} FROM sale_return_order ${whereSql}
     ORDER BY create_time DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return { list: rows, total, pageNum, pageSize };
}

module.exports = {
  run,
  generateReturnNo,
  createOrder,
  createItems,
  findById,
  findByIdForUpdate,
  findRawById,
  findItems,
  findActiveBySaleRecordId,
  cancelPendingBySaleRecordId,
  confirmOrder,
  updateStatus,
  list,
};
