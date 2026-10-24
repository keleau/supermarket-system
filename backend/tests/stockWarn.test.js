const test = require('node:test');
const assert = require('node:assert/strict');

const { buildWarnWhere } = require('../models/stockModel');
const { pool } = require('../db/pool');

test.after(() => pool.end());

test('预警基础条件包含「缺货」与「低于预警值」两类', () => {
  const { whereSql, params } = buildWarnWhere({});

  assert.match(whereSql, /p\.stock_num <= 0 OR p\.stock_num < p\.warn_num/);
  assert.deepEqual(params, []);
});

test('只看已缺货时按 stock_num <= 0 过滤', () => {
  const { whereSql } = buildWarnWhere({ warnStatus: 2 });

  assert.match(whereSql, /p\.stock_num <= 0/);
  assert.doesNotMatch(whereSql, /p\.stock_num > 0/);
});

test('只看低于预警值时按 stock_num > 0 过滤', () => {
  const { whereSql } = buildWarnWhere({ warnStatus: 1 });

  assert.match(whereSql, /p\.stock_num > 0/);
});

test('商品名条件与参数按顺序拼装', () => {
  const { whereSql, params } = buildWarnWhere({ productName: '牛奶', warnStatus: 2 });

  assert.match(whereSql, /p\.product_name LIKE \?/);
  assert.deepEqual(params, ['%牛奶%']);
});
