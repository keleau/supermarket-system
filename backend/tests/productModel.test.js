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

  assert.equal(conn.calls.length, 1);
  assert.match(conn.calls[0].sql, /AND stock_num >= \?/);
  assert.deepEqual(conn.calls[0].params, [-6, 7, 6]);
});

test('条件更新未命中（库存不足）时抛业务异常', async () => {
  const conn = fakeConn(0);

  await assert.rejects(
    () => productModel.changeStock(conn, 7, -6),
    (err) => err instanceof BizError && err.code === 400 && /库存不足/.test(err.message)
  );
});
