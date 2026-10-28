const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isAdmin,
  maskProductCost,
  maskSaleItems,
  maskDashboardProfit,
  maskStockStatistics,
  maskStockLogPrice,
  maskStocktakeFinance,
} = require('../utils/finance');

const admin = { role: 'admin' };
const operator = { role: 'operator' };

test('只有 admin 角色算管理员', () => {
  assert.equal(isAdmin(admin), true);
  assert.equal(isAdmin(operator), false);
  assert.equal(isAdmin(null), false);
  assert.equal(isAdmin(undefined), false);
});

test('管理员保留商品成本', () => {
  const product = { id: 1, salePrice: 9, costPrice: 6 };
  assert.equal(maskProductCost(product, admin), product);
});

test('操作员商品详情不返回成本，且不修改原对象', () => {
  const product = { id: 1, salePrice: 9, costPrice: 6 };
  const masked = maskProductCost(product, operator);

  assert.equal(masked.costPrice, undefined);
  assert.equal(masked.salePrice, 9);
  assert.equal(product.costPrice, 6);
});

test('操作员商品列表逐行剔除成本', () => {
  const rows = [
    { id: 1, salePrice: 9, costPrice: 6 },
    { id: 2, salePrice: 5, costPrice: 3 },
  ];
  const masked = maskProductCost(rows, operator);

  assert.equal(masked.length, 2);
  assert.equal(masked[0].costPrice, undefined);
  assert.equal(masked[1].costPrice, undefined);
  assert.equal(rows[0].costPrice, 6);
});

test('管理员保留销售明细成本', () => {
  const items = [{ productId: 1, salePrice: 9, costPrice: 6 }];
  assert.equal(maskSaleItems(items, admin), items);
});

test('操作员销售明细不返回成本', () => {
  const items = [{ productId: 1, salePrice: 9, costPrice: 6, amount: 18 }];
  const masked = maskSaleItems(items, operator);

  assert.equal(masked[0].costPrice, undefined);
  assert.equal(masked[0].salePrice, 9);
  assert.equal(masked[0].amount, 18);
});

test('操作员仪表盘剔除全部利润字段，保留销售字段', () => {
  const data = {
    todaySaleAmount: 100,
    todayProfitAmount: 30,
    todayProfitRate: 1.2,
    todayProfitTrend: [1, 2],
    monthSaleAmount: 900,
    monthProfitAmount: 260,
    monthProfitRate: 2.3,
    monthTrend: [3, 4],
    monthSaleTrend: [5, 6],
  };
  const masked = maskDashboardProfit(data, operator);

  assert.equal(masked.todayProfitAmount, undefined);
  assert.equal(masked.todayProfitRate, undefined);
  assert.equal(masked.todayProfitTrend, undefined);
  assert.equal(masked.monthProfitAmount, undefined);
  assert.equal(masked.monthProfitRate, undefined);
  assert.equal(masked.monthTrend, undefined);
  assert.equal(masked.todaySaleAmount, 100);
  assert.equal(masked.monthSaleAmount, 900);
  assert.equal(masked.monthSaleTrend.length, 2);
  assert.equal(data.todayProfitAmount, 30);
});

test('管理员仪表盘保留利润字段', () => {
  const data = { todayProfitAmount: 30, monthProfitAmount: 260 };
  assert.equal(maskDashboardProfit(data, admin), data);
});

test('操作员库存统计不返回库存总价值', () => {
  const data = { totalStock: 1000, totalStockValue: 6600.5 };
  const masked = maskStockStatistics(data, operator);

  assert.equal(masked.totalStockValue, undefined);
  assert.equal(masked.totalStock, 1000);
});

test('操作员出入库流水不返回入库单价', () => {
  const rows = [
    { id: 1, changeType: 1, quantity: 10, inboundPrice: 6.5 },
    { id: 2, changeType: 2, quantity: 2, inboundPrice: null },
  ];
  const masked = maskStockLogPrice(rows, operator);

  assert.equal(masked[0].inboundPrice, undefined);
  assert.equal(masked[1].inboundPrice, undefined);
  assert.equal(masked[0].quantity, 10);
  assert.equal(rows[0].inboundPrice, 6.5);
});

test('管理员出入库流水保留入库单价', () => {
  const rows = [{ id: 1, inboundPrice: 6.5 }];
  assert.equal(maskStockLogPrice(rows, admin), rows);
});

test('操作员盘点单不返回成本与盈亏金额，但保留数量', () => {
  const order = {
    id: 1,
    totalGainQty: 2,
    totalLossQty: 1,
    totalGainAmount: 12,
    totalLossAmount: 6,
    items: [
      { productId: 1, bookQty: 10, actualQty: 12, diffQty: 2, costPrice: 6, diffAmount: 12, reason: '赠品' },
    ],
  };
  const masked = maskStocktakeFinance(order, operator);

  assert.equal(masked.totalGainAmount, undefined);
  assert.equal(masked.totalLossAmount, undefined);
  assert.equal(masked.totalGainQty, 2);
  assert.equal(masked.items[0].costPrice, undefined);
  assert.equal(masked.items[0].diffAmount, undefined);
  assert.equal(masked.items[0].diffQty, 2);
  assert.equal(order.items[0].costPrice, 6);
});

test('管理员盘点单保留成本与盈亏金额', () => {
  const order = { id: 1, totalGainAmount: 12, items: [{ costPrice: 6 }] };
  assert.equal(maskStocktakeFinance(order, admin), order);
});
