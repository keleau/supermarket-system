const test = require('node:test');
const assert = require('node:assert/strict');

const userController = require('../controllers/userController');
const userModel = require('../models/userModel');
const { pool } = require('../db/pool');
const { BizError } = require('../utils/result');
const config = require('../config');

const EXIST = {
  id: 5,
  username: 'cashier',
  realName: '小王',
  role: 'operator',
  position: '收银员',
  status: 1,
};

function fakeRes() {
  return { json: (payload) => payload };
}

async function callUpdate(t, exist, body) {
  t.mock.method(userModel, 'findById', async () => exist);
  const updated = t.mock.method(userModel, 'update', async () => exist);
  const bump = t.mock.method(userModel, 'bumpTokenVersion', async () => {});

  const result = await userController.update({ body }, fakeRes());
  return { result, updated, bump };
}

test.after(() => pool.end());

test('改职位后 token_version +1', async (t) => {
  const { result, bump } = await callUpdate(t, EXIST, { id: 5, position: '仓管', status: 1 });

  assert.equal(result.code, 200);
  assert.equal(bump.mock.callCount(), 1);
  assert.deepEqual(bump.mock.calls[0].arguments, [5]);
});

test('禁用账号后 token_version +1', async (t) => {
  const { result, bump } = await callUpdate(t, EXIST, { id: 5, position: '收银员', status: 0 });

  assert.equal(result.code, 200);
  assert.equal(bump.mock.callCount(), 1);
});

test('重新启用账号后 token_version +1（禁用期间签发的 token 也作废）', async (t) => {
  const disabled = { ...EXIST, status: 0 };
  const { result, bump } = await callUpdate(t, disabled, { id: 5, position: '收银员', status: 1 });

  assert.equal(result.code, 200);
  assert.equal(bump.mock.callCount(), 1);
});

test('只改姓名/电话等资料不踢下线', async (t) => {
  const { result, bump } = await callUpdate(t, EXIST, {
    id: 5, position: '收银员', status: 1, realName: '小李', phone: '13800138000',
  });

  assert.equal(result.code, 200);
  assert.equal(bump.mock.callCount(), 0);
});

test('内置管理员职位被保护，不会被降权也不触发失效', async (t) => {
  const admin = { ...EXIST, username: config.builtinAdminUsername, role: 'admin', position: '管理员' };
  const { result, updated, bump } = await callUpdate(t, admin, { id: 5, position: '仓管', status: 1 });

  assert.equal(result.code, 200);
  assert.equal(bump.mock.callCount(), 0);

  const payload = updated.mock.calls[0].arguments[1];
  assert.equal(payload.role, 'admin');
  assert.equal(payload.position, '管理员');
});

test('内置管理员不能被禁用，且不产生任何写入', async (t) => {
  const admin = { ...EXIST, username: config.builtinAdminUsername, role: 'admin', position: '管理员' };
  t.mock.method(userModel, 'findById', async () => admin);
  const updated = t.mock.method(userModel, 'update', async () => admin);
  const bump = t.mock.method(userModel, 'bumpTokenVersion', async () => {});

  await assert.rejects(
    () => userController.update({ body: { id: 5, position: '管理员', status: 0 } }, fakeRes()),
    (err) => err instanceof BizError && err.code === 400 && /系统管理员不可禁用/.test(err.message)
  );
  assert.equal(updated.mock.callCount(), 0);
  assert.equal(bump.mock.callCount(), 0);
});
