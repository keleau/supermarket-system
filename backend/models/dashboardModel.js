/**
 * 运营仪表盘 Model（只读统计）
 * 销售口径与销售统计一致：仅统计 status=1 的正常单据。
 */
const { query } = require('../db/pool');
const { formatDateTime } = require('../utils/date');
const { round2 } = require('../utils/validate');

/** 库存余量 TOP N（按当前库存降序） */
async function stockTop(limit = 5) {
  return query(
    `SELECT id AS productId, product_name AS productName, stock_num AS stockNum
     FROM product
     ORDER BY stock_num DESC, id ASC
     LIMIT ?`,
    [limit]
  );
}

/** 各分类库存占比 */
async function categoryStock() {
  return query(
    `SELECT c.id AS categoryId, c.name AS categoryName, COALESCE(SUM(p.stock_num), 0) AS stockNum
     FROM category c
     LEFT JOIN product p ON p.category_id = c.id
     GROUP BY c.id, c.name
     ORDER BY stockNum DESC`
  );
}

/** 指定日期各小时的销售额 / 成本（今日趋势线用） */
async function hourlyAmounts(dateStr) {
  const rows = await query(
    `SELECT
       HOUR(sr.create_time)                          AS hour,
       COALESCE(SUM(si.amount), 0)                   AS amount,
       COALESCE(SUM(si.cost_price * si.quantity), 0) AS cost
     FROM sale_item si
     JOIN sale_record sr ON sr.id = si.sale_record_id
     WHERE sr.status = 1 AND DATE(sr.create_time) = ?
     GROUP BY HOUR(sr.create_time)
     ORDER BY hour ASC`,
    [dateStr]
  );

  const buckets = new Array(24).fill(null).map(() => ({ amount: 0, cost: 0 }));
  rows.forEach((r) => {
    buckets[r.hour] = { amount: Number(r.amount) || 0, cost: Number(r.cost) || 0 };
  });
  return buckets;
}

/** 指定区间每日的销售额 / 成本（月度趋势线用） */
async function dailyAmounts(startTime, endTime) {
  const rows = await query(
    `SELECT
       DATE(sr.create_time)                          AS date,
       COALESCE(SUM(si.amount), 0)                   AS amount,
       COALESCE(SUM(si.cost_price * si.quantity), 0) AS cost
     FROM sale_item si
     JOIN sale_record sr ON sr.id = si.sale_record_id
     WHERE sr.status = 1 AND sr.create_time >= ? AND sr.create_time <= ?
     GROUP BY DATE(sr.create_time)
     ORDER BY date ASC`,
    [startTime, endTime]
  );

  return rows.map((r) => ({
    date: String(r.date),
    amount: Number(r.amount) || 0,
    cost: Number(r.cost) || 0,
  }));
}

/** 入库总数量（区间） */
async function inboundQuantity(startTime, endTime) {
  const rows = await query(
    `SELECT COALESCE(SUM(quantity), 0) AS total
     FROM stock_log
     WHERE change_type = 1 AND biz_type IN (1, 6)
       AND create_time >= ? AND create_time <= ?`,
    [startTime, endTime]
  );
  return Number(rows[0].total) || 0;
}

/**
 * 供应商进货金额排行（近 N 天，只统计 biz_type=1 的采购入库）
 * 期初入库、销售退货、手工调整都不算供应商进货。
 */
async function supplierRanking(days = 30, limit = 10) {
  const cutoff = formatDateTime(new Date(Date.now() - days * 24 * 3600 * 1000));

  const rows = await query(
    `SELECT supplier_name AS supplierName,
            COALESCE(SUM(quantity), 0) AS quantity,
            COALESCE(SUM(COALESCE(inbound_price, 0) * quantity), 0) AS amount
     FROM stock_log
     WHERE change_type = 1 AND biz_type = 1 AND supplier_name <> ''
       AND create_time >= ?
     GROUP BY supplier_name
     ORDER BY amount DESC
     LIMIT ?`,
    [cutoff, limit]
  );

  return rows.map((r) => ({
    supplierName: r.supplierName,
    quantity: Number(r.quantity) || 0,
    amount: round2(r.amount),
  }));
}

/** 商品种类数（SKU） */
async function productKindCount() {
  const rows = await query('SELECT COUNT(*) AS total FROM product');
  return Number(rows[0].total) || 0;
}

/** 预警与待盘点数量 */
async function warnCounts() {
  const rows = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN stock_num <= 0 OR stock_num < warn_num THEN 1 ELSE 0 END), 0) AS pendingStockCount,
       COALESCE(SUM(CASE WHEN stock_num <= 0 THEN 1 ELSE 0 END), 0)       AS outProductCount,
       COALESCE(SUM(CASE WHEN stock_num > 0 AND stock_num < warn_num THEN 1 ELSE 0 END), 0) AS warnProductCount
     FROM product`
  );

  const r = rows[0];
  return {
    pendingStockCount: Number(r.pendingStockCount) || 0,
    outProductCount: Number(r.outProductCount) || 0,
    warnProductCount: Number(r.warnProductCount) || 0,
  };
}

module.exports = {
  stockTop,
  categoryStock,
  hourlyAmounts,
  dailyAmounts,
  inboundQuantity,
  supplierRanking,
  productKindCount,
  warnCounts,
};
