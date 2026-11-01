/**
 * 出入库流水 / 库存统计 Model
 */
const { pool, query } = require('../db/pool');
const { formatDateTime } = require('../utils/date');

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
  l.biz_type      AS bizType,
  CASE l.biz_type
    WHEN 1 THEN '采购入库'
    WHEN 2 THEN '销售出库'
    WHEN 3 THEN '销售退货'
    WHEN 4 THEN '盘点盘盈'
    WHEN 5 THEN '盘点盘亏'
    WHEN 6 THEN '期初入库'
    WHEN 7 THEN '手工调整'
    WHEN 8 THEN '作废回补'
    ELSE '其他'
  END             AS bizTypeName,
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
  productName, productId, changeType, bizType, startTime, endTime,
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
  if (bizType !== null && bizType !== undefined) {
    where.push('l.biz_type = ?');
    params.push(bizType);
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
      (product_id, change_type, biz_type, quantity, before_num, after_num,
       supplier_name, inbound_price, operator, remark)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.productId,
      data.changeType,
      data.bizType ?? 7,
      data.quantity,
      data.beforeNum,
      data.afterNum,
      data.supplierName || '',
      data.inboundPrice ?? null,
      data.operator || '',
      data.remark || '',
    ]
  );
  return { id: result.insertId };
}

/** 该商品是否已有入库流水（用于判断首次入库 = 期初入库） */
async function hasInbound(conn, productId) {
  const rows = await run(
    conn,
    'SELECT 1 FROM stock_log WHERE product_id = ? AND change_type = 1 LIMIT 1',
    [productId]
  );
  return rows.length > 0;
}

/**
 * 预警商品列表
 * stockNum = 0 → warnStatus 2（已缺货）
 * 0 < stockNum < warnNum → warnStatus 1（低于预警值）
 *
 * 注意：缺货商品必须无条件进入预警列表。只写 stock_num < warn_num 时，
 * 预警值为 0 的商品（新商品默认值）库存降到 0 后会被漏掉。
 */
function buildWarnWhere({ productName, warnStatus }) {
  const where = ['(p.stock_num <= 0 OR p.stock_num < p.warn_num)'];
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

  return { whereSql: where.join(' AND '), params };
}

async function warnList({ productName, warnStatus }) {
  const { whereSql, params } = buildWarnWhere({ productName, warnStatus });

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
     WHERE ${whereSql}
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
       COALESCE(SUM(CASE WHEN stock_num <= 0 OR stock_num < warn_num THEN 1 ELSE 0 END), 0) AS pendingProductCount,
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

/**
 * 积压商品：当前有库存，且近 days 天没有正常销售（从未销售也算积压）
 */
async function slowMoving(days = 30, limit = 10) {
  const cutoff = formatDateTime(new Date(Date.now() - days * 24 * 3600 * 1000));

  return query(
    `SELECT t.productId, t.productName, t.stockNum, t.unit, t.lastSaleTime,
            DATEDIFF(NOW(), t.lastSaleTime) AS daysSinceLastSale
     FROM (
       SELECT p.id AS productId,
              p.product_name AS productName,
              p.stock_num AS stockNum,
              p.unit,
              (SELECT MAX(sr.create_time)
               FROM sale_item si
               JOIN sale_record sr ON sr.id = si.sale_record_id
               WHERE si.product_id = p.id AND sr.status = 1) AS lastSaleTime
       FROM product p
       WHERE p.stock_num > 0
     ) t
     WHERE t.lastSaleTime IS NULL OR t.lastSaleTime < ?
     ORDER BY t.stockNum DESC, t.productId ASC
     LIMIT ?`,
    [cutoff, limit]
  );
}

/** 某时间区间内的入库总数量（仪表盘用） */
async function inboundQuantityBetween(startTime, endTime) {
  const rows = await query(
    `SELECT COALESCE(SUM(quantity), 0) AS total
     FROM stock_log
     WHERE change_type = 1 AND biz_type IN (1, 6)
       AND create_time >= ? AND create_time <= ?`,
    [startTime, endTime]
  );
  return Number(rows[0].total) || 0;
}

module.exports = {
  run, logList, insertLog, hasInbound, buildWarnWhere, warnList, statistics,
  slowMoving, inboundQuantityBetween,
};
