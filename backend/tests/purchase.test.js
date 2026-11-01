const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PURCHASE_STATUS,
  calcItemAmount,
  calcTotal,
  canEdit,
  canSubmit,
  canReceive,
  canCancel,
  payStatus,
} = require('../utils/purchase');

test('单行金额保留两位小数，规避浮点尾差', () => {
  assert.equal(calcItemAmount(3, 12.5), 37.5);
  assert.equal(calcItemAmount(3, 0.1), 0.3);
  assert.equal(calcItemAmount(3, 0.335), 1.01);
  assert.equal(calcItemAmount(0, 10), 0);
  assert.equal(calcItemAmount(null, 10), 0);
});

test('采购总金额按明细汇总并保留两位小数', () => {
  assert.equal(calcTotal([]), 0);
  assert.equal(calcTotal([
    { quantity: 2, price: 3.25 },
    { quantity: 3, price: 1.1 },
  ]), 9.8);
  assert.equal(calcTotal([
    { quantity: 1, price: 0.1 },
    { quantity: 1, price: 0.2 },
  ]), 0.3);
});

test('只有草稿可以编辑和提交', () => {
  assert.equal(canEdit(PURCHASE_STATUS.DRAFT), true);
  assert.equal(canEdit(PURCHASE_STATUS.SUBMITTED), false);
  assert.equal(canEdit(PURCHASE_STATUS.RECEIVED), false);
  assert.equal(canSubmit(PURCHASE_STATUS.DRAFT), true);
  assert.equal(canSubmit(PURCHASE_STATUS.SUBMITTED), false);
});

test('只有已提交的采购单可以收货', () => {
  assert.equal(canReceive(PURCHASE_STATUS.SUBMITTED), true);
  assert.equal(canReceive(PURCHASE_STATUS.DRAFT), false);
  assert.equal(canReceive(PURCHASE_STATUS.RECEIVED), false);
  assert.equal(canReceive(PURCHASE_STATUS.CANCELLED), false);
});

test('草稿和已提交可以取消，已入库和已取消不能再取消', () => {
  assert.equal(canCancel(PURCHASE_STATUS.DRAFT), true);
  assert.equal(canCancel(PURCHASE_STATUS.SUBMITTED), true);
  assert.equal(canCancel(PURCHASE_STATUS.RECEIVED), false);
  assert.equal(canCancel(PURCHASE_STATUS.CANCELLED), false);
});

test('付款状态区分未付、部分付款和已付清', () => {
  assert.equal(payStatus(100, 0), 0);
  assert.equal(payStatus(100, 30), 1);
  assert.equal(payStatus(100, 100), 2);
  assert.equal(payStatus(100, 120), 2);
  assert.equal(payStatus(0, 0), 0);
});
