const test = require('node:test');
const assert = require('node:assert/strict');

const { isDate, assertDateRange } = require('../utils/validate');
const { BizError } = require('../utils/result');
const saleController = require('../controllers/saleController');
const stockController = require('../controllers/stockController');
const userController = require('../controllers/userController');
const userModel = require('../models/userModel');
const { pool } = require('../db/pool');

test.after(() => pool.end());

const isBiz400 = (err) => err instanceof BizError && err.code === 400;

test('isDate 接受真实存在的日期', () => {
  assert.equal(isDate('2026-10-24'), true);
  assert.equal(isDate('2024-02-29'), true);
  assert.equal(isDate('2000-02-29'), true);
});

test('isDate 拒绝格式错误或日历上不存在的日期', () => {
  for (const v of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-1-1', 'abc', '', null]) {
    assert.equal(isDate(v), false, `应拒绝 ${v}`);
  }
  assert.equal(isDate('1900-02-29'), false);
});

test('assertDateRange 接受空值与合法区间', () => {
  assert.doesNotThrow(() => assertDateRange('', ''));
  assert.doesNotThrow(() => assertDateRange('2026-10-01', '2026-10-24'));
  assert.doesNotThrow(() => assertDateRange('2026-10-24', '2026-10-24'));
});

test('assertDateRange 拒绝非法格式和倒序区间', () => {
  assert.throws(() => assertDateRange('abc', ''), isBiz400);
  assert.throws(() => assertDateRange('2026-10-01', '2026-10-32'), isBiz400);
  assert.throws(
    () => assertDateRange('2026-10-31', '2026-10-01'),
    (err) => isBiz400(err) && /不能晚于/.test(err.message)
  );
});

test('销售统计在查询数据库前拦下非法日期', async () => {
  await assert.rejects(
    () => saleController.statistics({ query: { startTime: 'abc' } }, {}),
    isBiz400
  );
  await assert.rejects(
    () => saleController.statistics({ query: { startTime: '2026-10-31', endTime: '2026-10-01' } }, {}),
    isBiz400
  );
});

test('出入库流水列表在查询数据库前拦下非法日期', async () => {
  await assert.rejects(
    () => stockController.inboundList({ query: { startTime: '2026-02-30' } }, {}),
    isBiz400
  );
});

test('用户生日/入职时间非法时不写库', async (t) => {
  const exist = {
    id: 5, username: 'cashier', realName: '小王', role: 'operator', position: '收银员', status: 1,
  };
  t.mock.method(userModel, 'findById', async () => exist);
  const updated = t.mock.method(userModel, 'update', async () => exist);

  await assert.rejects(
    () => userController.update(
      { body: { id: 5, position: '收银员', status: 1, birthday: '2026-02-30' } },
      {}
    ),
    isBiz400
  );
  await assert.rejects(
    () => userController.update(
      { body: { id: 5, position: '收银员', status: 1, joinDate: '2026-13-01' } },
      {}
    ),
    isBiz400
  );
  assert.equal(updated.mock.callCount(), 0);
});

test('用户生日为闰日时正常保存', async (t) => {
  const exist = {
    id: 5, username: 'cashier', realName: '小王', role: 'operator', position: '收银员', status: 1,
  };
  t.mock.method(userModel, 'findById', async () => exist);
  const updated = t.mock.method(userModel, 'update', async () => exist);

  const result = await userController.update(
    { body: { id: 5, position: '收银员', status: 1, birthday: '2024-02-29' } },
    { json: (payload) => payload }
  );

  assert.equal(result.code, 200);
  assert.equal(updated.mock.callCount(), 1);
  assert.equal(updated.mock.calls[0].arguments[1].birthday, '2024-02-29');
});
