const test = require('node:test');
const assert = require('node:assert/strict');

const { calcDiff } = require('../utils/stocktake');

test('盘盈：实盘大于账面', () => {
  const result = calcDiff(12, 10, 6);
  assert.equal(result.diffQty, 2);
  assert.equal(result.diffAmount, 12);
});

test('盘亏：实盘小于账面', () => {
  const result = calcDiff(8, 10, 6);
  assert.equal(result.diffQty, -2);
  assert.equal(result.diffAmount, -12);
});

test('账实相符：差异为 0', () => {
  const result = calcDiff(10, 10, 6);
  assert.equal(result.diffQty, 0);
  assert.equal(result.diffAmount, 0);
});

test('盈亏金额保留两位小数', () => {
  const result = calcDiff(3, 2, 1.005);
  assert.equal(result.diffQty, 1);
  assert.equal(result.diffAmount, 1.01);
});
