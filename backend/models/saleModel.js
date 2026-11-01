/**
 * 销售记录 / 销售明细 / 销售统计 Model
 */
const { pool, query } = require('../db/pool');

/** 事务连接执行入口 */
async function run(conn, sql, params = []) {
  const [rows] = await (conn || pool).execute(sql, params);
  return rows;
}

const RECORD_FIELDS = `
  id,
  sale_no        AS saleNo,
  total_quantity AS totalQuantity,
  total_amount   AS totalAmount,
  pay_type       AS payType,
  operator,
  status,
  remark,
  create_time    AS createTime,
  (SELECT r.status FROM sale_return_order r
    WHERE r.sale_record_id = sale_record.id AND r.status IN (0, 1)
    ORDER BY r.id DESC LIMIT 1) AS activeReturnStatus,
  (SELECT r.return_no FROM sale_return_order r
    WHERE r.sale_record_id = sale_record.id AND r.status IN (0, 1)
    ORDER BY r.id DESC LIMIT 1) AS activeReturnNo
`;

const ITEM_FIELDS = `
  product_id    AS productId,
  product_name  AS productName,
  category_name AS categoryName,
  quantity,
  sale_price    AS salePrice,
  cost_price    AS costPrice,
  amount
`;

/* ------------------------------------------------------------------ */
/* 销售记录                                                            */
/* ------------------------------------------------------------------ */

/** 分页列表（不含明细） */
async function recordList({ pageNum, pageSize, offset, saleNo, operator, payType, startTime, endTime }) {
  const where = [];
  const params = [];

  if (saleNo) {
    where.push('sale_no LIKE ?');
    params.push(`%${saleNo}%`);
  }
  if (operator) {
    where.push('operator = ?');
    params.push(operator);
  }
  if (payType !== null && payType !== undefined) {
    where.push('pay_type = ?');
    params.push(payType);
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

  const countRows = await query(`SELECT COUNT(*) AS total FROM sale_record ${whereSql}`, params);
  const total = countRows[0].total;

  const list = await query(
    `SELECT ${RECORD_FIELDS} FROM sale_record ${whereSql}
     ORDER BY create_time DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return { list, total, pageNum, pageSize };
}

/** 详情（含明细） */
async function findRecordById(id) {
  const rows = await query(`SELECT ${RECORD_FIELDS} FROM sale_record WHERE id = ? LIMIT 1`, [id]);
  const record = rows[0];
  if (!record) return null;

  record.items = await query(
    `SELECT ${ITEM_FIELDS} FROM sale_item WHERE sale_record_id = ? ORDER BY id ASC`,
    [id]
  );
  return record;
}

/** 按单号查（退货/作废用） */
async function findRecordBySaleNo(saleNo) {
  const rows = await query(`SELECT ${RECORD_FIELDS} FROM sale_record WHERE sale_no = ? LIMIT 1`, [saleNo]);
  return rows[0] || null;
}

/**
 * 按单号查并加行锁（事务内使用）
 * 防止并发重复退货 / 退货与作废同时发生导致状态错乱。
 */
async function findRecordBySaleNoForUpdate(conn, saleNo) {
  const rows = await run(conn, 'SELECT * FROM sale_record WHERE sale_no = ? FOR UPDATE', [saleNo]);
  return rows[0] || null;
}

/** 单据明细（传 conn 则在事务内查询） */
async function findItemsByRecordId(recordId, conn = null) {
  return run(
    conn,
    `SELECT ${ITEM_FIELDS} FROM sale_item WHERE sale_record_id = ? ORDER BY id ASC`,
    [recordId]
  );
}

/** 按 id 查并加行锁（退货确认 / 作废时使用，与按单号加锁保持相同的锁顺序） */
async function findRecordByIdForUpdate(conn, id) {
  const rows = await run(conn, 'SELECT * FROM sale_record WHERE id = ? FOR UPDATE', [id]);
  return rows[0] || null;
}

/**
 * 生成当日销售单号：XS + yyyyMMdd + '-' + 3 位当日序号
 * 并发场景由 sale_record.uk_sale_no 唯一索引兜底，冲突时上层重试。
 */
async function generateSaleNo(conn, dateStr) {
  const prefix = `XS${dateStr}-`;
  const rows = await run(
    conn,
    `SELECT MAX(CAST(SUBSTRING(sale_no, ?) AS UNSIGNED)) AS maxSeq
     FROM sale_record WHERE sale_no LIKE ?`,
    [prefix.length + 1, `${prefix}%`]
  );
  const next = (rows[0].maxSeq || 0) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

/** 写入销售主单 */
async function createRecord(conn, data) {
  const result = await run(
    conn,
    `INSERT INTO sale_record
      (sale_no, total_quantity, total_amount, pay_type, operator, status, remark)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
    [data.saleNo, data.totalQuantity, data.totalAmount, data.payType, data.operator, data.remark]
  );
  return { id: result.insertId };
}

/** 批量写入销售明细 */
async function createItems(conn, recordId, items) {
  for (const it of items) {
    await run(
      conn,
      `INSERT INTO sale_item
        (sale_record_id, product_id, product_name, category_name, quantity, sale_price, cost_price, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recordId, it.productId, it.productName, it.categoryName,
        it.quantity, it.salePrice, it.costPrice, it.amount,
      ]
    );
  }
}

/** 变更单据状态（事务内使用） */
async function updateStatus(conn, id, status) {
  await run(conn, 'UPDATE sale_record SET status = ? WHERE id = ?', [status, id]);
}

/* ------------------------------------------------------------------ */
/* 销售明细按商品查询                                                   */
/* ------------------------------------------------------------------ */
async function itemListByProduct({ productId, operator, pageNum, pageSize, offset }) {
  const where = ['si.product_id = ?'];
  const params = [productId];
  if (operator) {
    where.push('sr.operator = ?');
    params.push(operator);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const countRows = await query(
    `SELECT COUNT(*) AS total
     FROM sale_item si
     JOIN sale_record sr ON sr.id = si.sale_record_id
     ${whereSql}`,
    params
  );
  const total = countRows[0].total;

  const list = await query(
    `SELECT
       sr.sale_no     AS saleNo,
       sr.create_time AS createTime,
       si.product_name  AS productName,
       si.category_name AS categoryName,
       si.quantity,
       si.sale_price AS salePrice,
       si.amount
     FROM sale_item si
     JOIN sale_record sr ON sr.id = si.sale_record_id
     ${whereSql}
     ORDER BY sr.create_time DESC, si.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return { list, total, pageNum, pageSize };
}

/* ------------------------------------------------------------------ */
/* 销售统计聚合                                                         */
/* ------------------------------------------------------------------ */

/** 构造统计的公共 WHERE（仅统计 status=1 的正常单据） */
function statsWhere({ startTime, endTime, categoryName, productName }) {
  const where = ['sr.status = 1', 'sr.create_time >= ?', 'sr.create_time <= ?'];
  const params = [startTime, endTime];

  // 商品/分类改名后仍按当前名称归类与筛选；商品被手工删除时退回销售快照
  if (categoryName) {
    where.push('COALESCE(c.name, si.category_name) = ?');
    params.push(categoryName);
  }
  if (productName) {
    where.push('COALESCE(p.product_name, si.product_name) = ?');
    params.push(productName);
  }
  return { whereSql: where.join(' AND '), params };
}

const STATS_FROM = `
  FROM sale_item si
  JOIN sale_record sr ON sr.id = si.sale_record_id
  LEFT JOIN product p ON p.id = si.product_id
  LEFT JOIN category c ON c.id = p.category_id`;

/** 汇总指标 */
async function statsSummary(f) {
  const rows = await query(
    `SELECT
       COALESCE(SUM(si.quantity), 0)                       AS totalQuantity,
       COALESCE(SUM(si.amount), 0)                         AS totalAmount,
       COALESCE(SUM(si.cost_price * si.quantity), 0)       AS totalCost
     ${STATS_FROM}
     WHERE ${f.whereSql}`,
    f.params
  );

  const r = rows[0];
  const totalAmount = round2(r.totalAmount);
  const totalCost = round2(r.totalCost);

  return {
    totalQuantity: Number(r.totalQuantity) || 0,
    totalAmount,
    totalCost,
    totalProfit: round2(totalAmount - totalCost),
  };
}

/** 每日销售额 / 成本 / 毛利 */
async function statsDaily(f) {
  const rows = await query(
    `SELECT
       DATE(sr.create_time)                          AS date,
       COALESCE(SUM(si.amount), 0)                   AS sale,
       COALESCE(SUM(si.cost_price * si.quantity), 0) AS cost
     ${STATS_FROM}
     WHERE ${f.whereSql}
     GROUP BY DATE(sr.create_time)
     ORDER BY date ASC`,
    f.params
  );

  return rows.map((r) => {
    const sale = round2(r.sale);
    const cost = round2(r.cost);
    return { date: String(r.date), sale, cost, profit: round2(sale - cost) };
  });
}

/** 各分类销售额（降序） */
async function statsByCategory(f) {
  const rows = await query(
    `SELECT
       COALESCE(c.name, si.category_name) AS categoryName,
       COALESCE(SUM(si.amount), 0)        AS amount
     ${STATS_FROM}
     WHERE ${f.whereSql}
     GROUP BY COALESCE(c.name, si.category_name)
     ORDER BY amount DESC`,
    f.params
  );

  return rows.map((r) => ({ categoryName: r.categoryName || '未分类', amount: round2(r.amount) }));
}

/** 各商品销售统计（按销售额降序，同一商品只出一行） */
async function statsByProduct(f) {
  const rows = await query(
    `SELECT
       si.product_id                                 AS productId,
       COALESCE(p.product_name, MAX(si.product_name)) AS productName,
       COALESCE(c.name, MAX(si.category_name))       AS categoryName,
       COALESCE(SUM(si.quantity), 0)                 AS quantity,
       COALESCE(SUM(si.amount), 0)                   AS amount,
       COALESCE(SUM(si.cost_price * si.quantity), 0) AS cost
     ${STATS_FROM}
     WHERE ${f.whereSql}
     GROUP BY si.product_id, p.product_name, c.name
     ORDER BY amount DESC`,
    f.params
  );

  return rows.map((r) => {
    const quantity = Number(r.quantity) || 0;
    const amount = round2(r.amount);
    const cost = round2(r.cost);
    const profit = round2(amount - cost);
    return {
      productId: r.productId,
      productName: r.productName,
      categoryName: r.categoryName,
      // 区间加权均价：总金额 / 总数量，避免改价后显示成最高价
      salePrice: quantity > 0 ? round2(amount / quantity) : 0,
      quantity,
      amount,
      cost,
      profit,
      rate: amount === 0 ? 0 : round2((profit / amount) * 100),
    };
  });
}

/** 区间内销售总额 / 成本（仪表盘环比用） */
async function amountBetween(startTime, endTime) {
  const rows = await query(
    `SELECT
       COALESCE(SUM(si.amount), 0)                   AS amount,
       COALESCE(SUM(si.cost_price * si.quantity), 0) AS cost,
       COUNT(DISTINCT sr.id)                         AS billCount
     ${STATS_FROM}
     WHERE sr.status = 1 AND sr.create_time >= ? AND sr.create_time <= ?`,
    [startTime, endTime]
  );

  const r = rows[0];
  const amount = round2(r.amount);
  const cost = round2(r.cost);
  return { amount, cost, profit: round2(amount - cost), billCount: Number(r.billCount) || 0 };
}

/** 每日销售额（仪表盘趋势线用） */
async function dailyAmountsBetween(startTime, endTime) {
  const rows = await query(
    `SELECT DATE(sr.create_time) AS date, COALESCE(SUM(si.amount), 0) AS amount
     ${STATS_FROM}
     WHERE sr.status = 1 AND sr.create_time >= ? AND sr.create_time <= ?
     GROUP BY DATE(sr.create_time)
     ORDER BY date ASC`,
    [startTime, endTime]
  );
  return rows.map((r) => ({ date: String(r.date), amount: round2(r.amount) }));
}

/** 热销商品 TOP N（按售出数量降序，同一商品只出一行） */
async function hotProducts(startTime, endTime, limit = 5) {
  const rows = await query(
    `SELECT
       si.product_id                  AS productId,
       COALESCE(p.product_name, MAX(si.product_name)) AS productName,
       COALESCE(SUM(si.amount), 0)    AS saleAmount,
       COALESCE(SUM(si.quantity), 0)  AS saleQuantity
     ${STATS_FROM}
     WHERE sr.status = 1 AND sr.create_time >= ? AND sr.create_time <= ?
     GROUP BY si.product_id, p.product_name
     ORDER BY saleQuantity DESC
     LIMIT ?`,
    [startTime, endTime, limit]
  );

  return rows.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    saleAmount: round2(r.saleAmount),
    saleQuantity: Number(r.saleQuantity) || 0,
  }));
}

/** 保留两位小数 */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

module.exports = {
  run,
  recordList,
  findRecordById,
  findRecordBySaleNo,
  findRecordBySaleNoForUpdate,
  findRecordByIdForUpdate,
  findItemsByRecordId,
  generateSaleNo,
  createRecord,
  createItems,
  updateStatus,
  itemListByProduct,
  statsWhere,
  STATS_FROM,
  statsSummary,
  statsDaily,
  statsByCategory,
  statsByProduct,
  amountBetween,
  dailyAmountsBetween,
  hotProducts,
};
