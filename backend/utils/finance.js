/**
 * 财务字段脱敏
 *
 * 成本 / 毛利属于经营敏感数据，只对管理员返回。
 * 非管理员统一剔除：
 * - 商品 costPrice
 * - 销售明细 costPrice
 * - 仪表盘利润字段
 * - 库存统计 totalStockValue
 * - 出入库流水 inboundPrice
 *
 * 这里只做字段级脱敏，不改变数据库与内部计算；
 * 销售统计这类整块财务接口仍由 requireAdmin 直接拒绝。
 */

const PROFIT_FIELDS = [
  'todayProfitAmount',
  'todayProfitRate',
  'todayProfitTrend',
  'monthProfitAmount',
  'monthProfitRate',
  'monthTrend',
];

function isAdmin(user) {
  return !!user && user.role === 'admin';
}

function omitFields(row, fields) {
  if (!row || typeof row !== 'object') return row;
  const copy = { ...row };
  fields.forEach((field) => delete copy[field]);
  return copy;
}

function maskFields(data, fields, user) {
  if (isAdmin(user)) return data;
  if (Array.isArray(data)) return data.map((row) => omitFields(row, fields));
  return omitFields(data, fields);
}

function maskProductCost(data, user) {
  return maskFields(data, ['costPrice'], user);
}

function maskSaleItems(items, user) {
  return maskFields(items || [], ['costPrice'], user);
}

function maskDashboardProfit(data, user) {
  return maskFields(data, PROFIT_FIELDS, user);
}

function maskStockStatistics(data, user) {
  return maskFields(data, ['totalStockValue'], user);
}

function maskStockLogPrice(rows, user) {
  return maskFields(rows, ['inboundPrice'], user);
}

/** 盘点单：非管理员看不到成本与盈亏金额，只保留数量 */
function maskStocktakeFinance(data, user) {
  if (isAdmin(user) || !data) return data;

  if (Array.isArray(data)) {
    return data.map((row) => omitFields(row, ['totalGainAmount', 'totalLossAmount']));
  }

  const order = omitFields(data, ['totalGainAmount', 'totalLossAmount']);
  if (Array.isArray(order.items)) {
    order.items = order.items.map((item) => omitFields(item, ['costPrice', 'diffAmount']));
  }
  return order;
}

/**
 * 采购单：采购金额与付款数据只对管理员和采购岗位开放。
 * 仓管可以查看/收货，但只需要数量，不应看到采购价与应付金额。
 */
function canSeePurchaseAmounts(user) {
  return !!user && (user.role === 'admin' || user.position === '采购');
}

function maskPurchaseFinance(data, user) {
  if (canSeePurchaseAmounts(user) || !data) return data;

  const orderFields = ['totalAmount', 'payableAmount', 'paidAmount', 'payStatus'];
  if (Array.isArray(data)) {
    return data.map((row) => omitFields(row, orderFields));
  }

  const order = omitFields(data, orderFields);
  if (Array.isArray(order.items)) {
    order.items = order.items.map((item) => omitFields(item, ['price', 'amount']));
  }
  return order;
}

module.exports = {
  isAdmin,
  maskProductCost,
  maskSaleItems,
  maskDashboardProfit,
  maskStockStatistics,
  maskStockLogPrice,
  maskStocktakeFinance,
  canSeePurchaseAmounts,
  maskPurchaseFinance,
};
