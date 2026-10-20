/**
 * 出入库流水 / 库存统计 Model
 */
const { pool, query } = require('../db/pool');

/** 事务连接执行入口 */
async function run(conn, sql, params = []) {
  const [rows] = await (conn || pool).execute(sql, params);
  return rows;
}

const LOG_FIELDS = `
  l.id,
  l.product_id    AS productId,
  p.product_name  AS productName,
  l.change_type   AS changeType,
  l.quantity,
  l.before_num    AS beforeNum,
  l.after_num     AS afterNum,
  l.supplier_name AS supplierName,
  l.inbound_price AS inboundPrice,
  l.operator,
  l.remark,
  l.create_time   AS createTime
`;

const LOG_JOINS = 'FROM stock_log l LEFT JOIN product p ON p.id = l.product_id';

/**
 * 流水分页列表（入库/出库明细复用同一实现）
 * @param {number|null} changeType 1 入库 / 2 出库 / null 全部
 */
async function logList({
  pageNum, pageSize, offset,
  productName, productId, changeType, startTime, endTime,
}) {
  const where = [];
  const params = [];

  if (productName) {
    where.push('p.product_name LIKE ?');
    params.push(`%${productName}%`);
  }
  if (productId !== null && productId !== undefined) {
    where.push('l.product_id = ?');
    params.push(productId);
  }
  if (changeType !== null && changeType !== undefined) {
    where.push('l.change_type = ?');
    params.push(changeType);
  }
  if (startTime) {
    where.push('l.create_time >= ?');
    params.push(startTime);
  }
  if (endTime) {
    where.push('l.create_time <= ?');
    params.push(endTime);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRows = await query(`SELECT COUNT(*) AS total ${LOG_JOINS} ${whereSql}`, params);
  const total = countRows[0].total;

  const list = await query(
    `SELECT ${LOG_FIELDS} ${LOG_JOINS} ${whereSql}
     ORDER BY l.create_time DESC, l.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return { list, total, pageNum, pageSize };
}

/** 写入流水（事务内使用） */
async function insertLog(conn, data) {
  const result = await run(
    conn,
    `INSERT INTO stock_log
      (product_id, change_type, quantity, before_num, after_num,
       supplier_name, inbound_price, operator, remark)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.productId, data.changeType, data.quantity, data.beforeNum, data.afterNum,
      data.supplierName || '', data.inboundPrice ?? null, data.operator || '', data.remark || '',
    ]
  );
  return { id: result.insertId };
}

/**
 * 预警商品列表
 * stockNum = 0 → warnStatus 2（已缺货）
 * 0 < stockNum < warnNum → warnStatus 1（低于预警值）
 */
async function warnList({ productName, warnStatus }) {
  const where = ['p.stock_num < p.warn_num'];
  const params = [];

  if (productName) {
    where.push('p.product_name LIKE ?');
    params.push(`%${productName}%`);
  }
  if (warnStatus === 2) {
    where.push('p.stock_num <= 0');
  } else if (warnStatus === 1) {
    where.push('p.stock_num > 0');
  }

  return query(
    `SELECT
       p.id           AS productId,
       p.product_name AS productName,
       p.product_code AS productCode,
       p.unit,
       p.stock_num    AS stockNum,
       p.warn_num     AS warnNum,
       CASE WHEN p.stock_num <= 0 THEN 2 ELSE 1 END AS warnStatus
     FROM product p
     WHERE ${where.join(' AND ')}
     ORDER BY p.stock_num ASC, p.id ASC`,
    params
  );
}

/** 库存统计（实时聚合） */
async function statistics() {
  const rows = await query(
    `SELECT
       COALESCE(SUM(stock_num), 0)                                            AS totalStock,
       COALESCE(SUM(CASE WHEN stock_num > 0 AND stock_num < warn_num THEN 1 ELSE 0 END), 0) AS warnProductCount,
       COALESCE(SUM(CASE WHEN stock_num <= 0 THEN 1 ELSE 0 END), 0)           AS outProductCount,
       COALESCE(SUM(CASE WHEN stock_num < warn_num THEN 1 ELSE 0 END), 0)     AS pendingProductCount,
       COALESCE(SUM(cost_price * stock_num), 0)                               AS totalStockValue
     FROM product`
  );

  const r = rows[0];
  return {
    totalStock: Number(r.totalStock) || 0,
    warnProductCount: Number(r.warnProductCount) || 0,
    outProductCount: Number(r.outProductCount) || 0,
    pendingProductCount: Number(r.pendingProductCount) || 0,
    totalStockValue: Math.round((Number(r.totalStockValue) || 0) * 100) / 100,
  };
}

/** 某时间区间内的入库总数量（仪表盘用） */
async function inboundQuantityBetween(startTime, endTime) {
  const rows = await query(
    `SELECT COALESCE(SUM(quantity), 0) AS total
     FROM stock_log
     WHERE change_type = 1 AND create_time >= ? AND create_time <= ?`,
    [startTime, endTime]
  );
  return Number(rows[0].total) || 0;
}

module.exports = {
  run, logList, insertLog, warnList, statistics, inboundQuantityBetween,
};
