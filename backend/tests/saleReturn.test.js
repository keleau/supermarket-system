const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RETURN_STATUS,
  RETURN_STATUS_LABELS,
  RETURN_STATUS_VALUES,
  canConfirm,
  canReject,
  canCancel,
  buildReturnItems,
  calcReturnTotals,
} = require('../utils/saleReturn');
const { STOCK_BIZ, STOCK_BIZ_LABELS } = require('../utils/stockBiz');

test('退货单状态与文案完整', () => {
  assert.equal(RETURN_STATUS.PENDING, 0);
  assert.equal(RETURN_STATUS.CONFIRMED, 1);
  assert.equal(RETURN_STATUS.REJECTED, 2);
  assert.equal(RETURN_STATUS.CANCELLED, 3);
  assert.equal(RETURN_STATUS_LABELS[RETURN_STATUS.PENDING], '待确认');
  assert.deepEqual(RETURN_STATUS_VALUES, [0, 1, 2, 3]);
});

test('只有待确认的退货单可以确认 / 拒绝', () => {
  assert.equal(canConfirm(RETURN_STATUS.PENDING), true);
  assert.equal(canConfirm(RETURN_STATUS.CONFIRMED), false);
  assert.equal(canConfirm(RETURN_STATUS.REJECTED), false);
  assert.equal(canConfirm(RETURN_STATUS.CANCELLED), false);

  assert.equal(canReject(RETURN_STATUS.PENDING), true);
  assert.equal(canReject(RETURN_STATUS.CONFIRMED), false);
});

test('申请人或管理员可以取消待确认的退货单', () => {
  assert.equal(canCancel(RETURN_STATUS.PENDING, { isOwner: true }), true);
  assert.equal(canCancel(RETURN_STATUS.PENDING, { isAdmin: true }), true);
  assert.equal(canCancel(RETURN_STATUS.PENDING, {}), false);
  assert.equal(canCancel(RETURN_STATUS.CONFIRMED, { isAdmin: true }), false);
});

test('退货明细保留原销售快照，金额优先使用原成交金额', () => {
  const items = buildReturnItems([
    {
      productId: 1,
      productName: '农夫山泉 550ml',
      categoryName: '饮料乳品',
      quantity: 2,
      salePrice: 2,
      costPrice: 1.2,
      amount: 4,
    },
    {
      productId: 5,
      productName: '乐事薯片 原味',
      categoryName: '休闲零食',
      quantity: 3,
      salePrice: 6,
      costPrice: 4,
    },
  ]);

  assert.equal(items[0].amount, 4);
  // 缺失 amount 时按售价 × 数量补齐
  assert.equal(items[1].amount, 18);
  assert.equal(items[1].categoryName, '休闲零食');
  assert.equal(items[0].costPrice, 1.2);
});

test('退货汇总数量与冲减营收金额保留两位小数', () => {
  const totals = calcReturnTotals([
    { quantity: 1, amount: 0.1 },
    { quantity: 2, amount: 0.2 },
  ]);
  assert.deepEqual(totals, { totalQuantity: 3, totalAmount: 0.3 });
  assert.deepEqual(calcReturnTotals([]), { totalQuantity: 0, totalAmount: 0 });
});

test('库存流水区分销售退货与作废回补', () => {
  assert.equal(STOCK_BIZ.SALE_RETURN, 3);
  assert.equal(STOCK_BIZ.VOID_RESTORE, 8);
  assert.equal(STOCK_BIZ_LABELS[STOCK_BIZ.SALE_RETURN], '销售退货');
  assert.equal(STOCK_BIZ_LABELS[STOCK_BIZ.VOID_RESTORE], '作废回补');
});
