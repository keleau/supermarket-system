const test = require('node:test');
const assert = require('node:assert/strict');

const productModel = require('../models/productModel');
const { pool } = require('../db/pool');
const { BizError } = require('../utils/result');

function fakeConn(affectedRows) {
  const calls = [];
  return {
    calls,
    async execute(sql, params) {
      calls.push({ sql, params });
      return [{ affectedRows }];
    },
  };
}

test.after(() => pool.end());

test('增加库存直接累加，不走条件判断', async () => {
  const conn = fakeConn(1);
  await productModel.changeStock(conn, 7, 5);

  assert.equal(conn.calls.length, 1);
  assert.match(conn.calls[0].sql, /stock_num = stock_num \+ \?/);
  assert.doesNotMatch(conn.calls[0].sql, /stock_num >= \?/);
  assert.deepEqual(conn.calls[0].params, [5, 7]);
});

test('扣减库存时带上库存下限条件', async () => {
  const conn = fakeConn(1);
  await productModel.changeStock(conn, 7, -6);

  assert.equal(conn.calls.length, 2);
  assert.match(conn.calls[0].sql, /AND stock_num >= \?/);
  assert.deepEqual(conn.calls[0].params, [-6, 7, 6]);
});

test('扣减后库存为 0 时附带条件下架', async () => {
  const conn = fakeConn(1);
  await productModel.changeStock(conn, 7, -6);

  assert.match(conn.calls[1].sql, /SET status = 0/);
  assert.match(conn.calls[1].sql, /stock_num = 0/);
  assert.match(conn.calls[1].sql, /status = 1/);
  assert.deepEqual(conn.calls[1].params, [7]);
});

test('条件更新未命中（库存不足）时抛业务异常', async () => {
  const conn = fakeConn(0);

  await assert.rejects(
    () => productModel.changeStock(conn, 7, -6),
    (err) => err instanceof BizError && err.code === 400 && /库存不足/.test(err.message)
  );
});

test('编辑商品档案不写入成本价和库存', async () => {
  const conn = fakeConn(1);
  await productModel.update(conn, 7, {
    productCode: '6900000000007',
    productName: '测试商品',
    categoryId: 1,
    spec: '',
    unit: '个',
    salePrice: 10,
    stockNum: 5,
    warnNum: 1,
    supplierId: null,
    imageUrl: '',
    status: 1,
  });

  assert.equal(conn.calls.length, 1);
  assert.doesNotMatch(conn.calls[0].sql, /cost_price/);
  assert.doesNotMatch(conn.calls[0].sql, /stock_num/);
});

test('入库后单独更新加权成本', async () => {
  const conn = fakeConn(1);
  await productModel.updateCostPrice(conn, 7, 6.1234);

  assert.equal(conn.calls.length, 1);
  assert.match(conn.calls[0].sql, /SET cost_price = \? WHERE id = \?/);
  assert.deepEqual(conn.calls[0].params, [6.1234, 7]);
});
