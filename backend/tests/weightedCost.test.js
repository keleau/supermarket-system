const test = require('node:test');
const assert = require('node:assert/strict');

const { movingAverageCost, assertCostUnchanged } = require('../utils/cost');
const { round4 } = require('../utils/validate');
const { BizError } = require('../utils/result');

test('首次入库：库存为 0 时直接取入库价', () => {
  const cost = movingAverageCost({
    stockNum: 0,
    currentCost: 0,
    inboundQty: 10,
    inboundPrice: 5,
  });
  assert.equal(cost, 5);
});

test('库存为 0 但存在历史成本时，仍以本次入库价为新均价', () => {
  const cost = movingAverageCost({
    stockNum: 0,
    currentCost: 3,
    inboundQty: 10,
    inboundPrice: 5,
  });
  assert.equal(cost, 5);
});

test('同价入库不改变均价', () => {
  const cost = movingAverageCost({
    stockNum: 20,
    currentCost: 6,
    inboundQty: 10,
    inboundPrice: 6,
  });
  assert.equal(cost, 6);
});

test('不同价入库按移动加权平均计算', () => {
  // (10×5 + 10×7) / 20 = 6
  const cost = movingAverageCost({
    stockNum: 10,
    currentCost: 5,
    inboundQty: 10,
    inboundPrice: 7,
  });
  assert.equal(cost, 6);
});

test('库存与入库数量不同时按实际数量加权', () => {
  // (30×5 + 10×7) / 40 = 5.5
  const cost = movingAverageCost({
    stockNum: 30,
    currentCost: 5,
    inboundQty: 10,
    inboundPrice: 7,
  });
  assert.equal(cost, 5.5);
});

test('均价保留四位小数并四舍五入', () => {
  // (1×1 + 2×1.01) / 3 = 1.006666...
  const cost = movingAverageCost({
    stockNum: 1,
    currentCost: 1,
    inboundQty: 2,
    inboundPrice: 1.01,
  });
  assert.equal(cost, 1.0067);
});

test('浮点金额不产生尾差', () => {
  // (10×0.1 + 10×0.2) / 20 = 0.15
  const cost = movingAverageCost({
    stockNum: 10,
    currentCost: 0.1,
    inboundQty: 10,
    inboundPrice: 0.2,
  });
  assert.equal(cost, 0.15);
});

test('未提供入库价时维持原均价', () => {
  assert.equal(
    movingAverageCost({ stockNum: 10, currentCost: 6, inboundQty: 5, inboundPrice: null }),
    6
  );
  assert.equal(
    movingAverageCost({ stockNum: 10, currentCost: 6, inboundQty: 5 }),
    6
  );
});

test('入库数量非法时维持原均价', () => {
  assert.equal(
    movingAverageCost({ stockNum: 10, currentCost: 6, inboundQty: 0, inboundPrice: 7 }),
    6
  );
  assert.equal(
    movingAverageCost({ stockNum: 10, currentCost: 6, inboundQty: -1, inboundPrice: 7 }),
    6
  );
});

test('round4 保留四位小数并四舍五入', () => {
  assert.equal(round4(1.00666), 1.0067);
  assert.equal(round4(1.00664), 1.0066);
  assert.equal(round4(0.1 + 0.2), 0.3);
  assert.equal(round4(1.00005), 1.0001);
});

test('商品编辑允许不传成本或不修改成本', () => {
  assert.doesNotThrow(() => assertCostUnchanged(null, 6));
  assert.doesNotThrow(() => assertCostUnchanged(undefined, 6));
  assert.doesNotThrow(() => assertCostUnchanged(6, 6));
  assert.doesNotThrow(() => assertCostUnchanged('6', 6));
});

test('商品编辑试图修改成本时抛业务异常', () => {
  assert.throws(
    () => assertCostUnchanged(7, 6),
    (err) => err instanceof BizError && err.code === 400 && /不能手工修改/.test(err.message)
  );
});
