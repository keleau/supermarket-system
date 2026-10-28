const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { authenticate, signToken, revokeToken } = require('../middleware/auth');
const userModel = require('../models/userModel');
const { pool } = require('../db/pool');
const { BizError } = require('../utils/result');
const { permissionsFor } = require('../utils/permissions');
const config = require('../config');

const DB_USER = {
  id: 7,
  username: 'cashier',
  realName: '小王',
  role: 'operator',
  position: '收银员',
  status: 1,
  tokenVersion: 3,
};

function makeReq(token) {
  return { headers: { authorization: `Bearer ${token}` } };
}

async function runAuth(req) {
  let error;
  let called = false;
  await authenticate(req, {}, (err) => {
    called = true;
    error = err;
  });
  assert.equal(called, true, 'next 应被调用');
  return error;
}

function assertUnauthorized(error) {
  assert.ok(error instanceof BizError);
  assert.equal(error.code, 401);
}

test.after(() => pool.end());

test('token 有效且版本一致：放行，权限以数据库当前值为准', async (t) => {
  t.mock.method(userModel, 'findAuthById', async () => DB_USER);

  // token 里故意写 admin，模拟被降权后仍持有旧 token
  const token = jwt.sign(
    {
      userId: DB_USER.id,
      username: DB_USER.username,
      role: 'admin',
      position: '管理员',
      realName: '小王',
      tokenVersion: DB_USER.tokenVersion,
    },
    config.jwt.secret,
    { expiresIn: '1h' }
  );

  const req = makeReq(token);
  const error = await runAuth(req);

  assert.equal(error, undefined);
  assert.deepEqual(req.user, {
    id: 7,
    username: 'cashier',
    role: 'operator',
    position: '收银员',
    realName: '小王',
    permissions: permissionsFor(DB_USER),
  });
  assert.equal(req.token, token);
});

test('缺少 token：直接 401，不查数据库', async (t) => {
  const spy = t.mock.method(userModel, 'findAuthById', async () => DB_USER);

  const error = await runAuth({ headers: {} });

  assertUnauthorized(error);
  assert.equal(spy.mock.callCount(), 0);
});

test('token 被退出登录拉黑：401', async (t) => {
  t.mock.method(userModel, 'findAuthById', async () => DB_USER);
  const token = signToken(DB_USER);
  revokeToken(token);

  const error = await runAuth(makeReq(token));

  assertUnauthorized(error);
});

test('账号已被删除：401', async (t) => {
  t.mock.method(userModel, 'findAuthById', async () => null);

  const error = await runAuth(makeReq(signToken(DB_USER)));

  assertUnauthorized(error);
});

test('账号已被禁用：401', async (t) => {
  t.mock.method(userModel, 'findAuthById', async () => ({ ...DB_USER, status: 0 }));

  const error = await runAuth(makeReq(signToken(DB_USER)));

  assertUnauthorized(error);
});

test('token 版本落后（改密码/改权限后）：401', async (t) => {
  t.mock.method(userModel, 'findAuthById', async () => DB_USER);
  const oldToken = signToken({ ...DB_USER, tokenVersion: DB_USER.tokenVersion - 1 });

  const error = await runAuth(makeReq(oldToken));

  assertUnauthorized(error);
});

test('升级前签发的无版本号 token：版本为 0 时仍可用', async (t) => {
  t.mock.method(userModel, 'findAuthById', async () => ({ ...DB_USER, tokenVersion: 0 }));
  const legacyToken = jwt.sign(
    { userId: DB_USER.id, username: DB_USER.username, role: 'operator', position: '收银员' },
    config.jwt.secret,
    { expiresIn: '1h' }
  );

  const error = await runAuth(makeReq(legacyToken));

  assert.equal(error, undefined);
});

test('签名不对或已过期：401，不查数据库', async (t) => {
  const spy = t.mock.method(userModel, 'findAuthById', async () => DB_USER);

  const badSignature = jwt.sign({ userId: 7, tokenVersion: 3 }, 'wrong-secret', { expiresIn: '1h' });
  const expired = jwt.sign(
    { userId: 7, tokenVersion: 3 },
    config.jwt.secret,
    { expiresIn: -1 }
  );

  assertUnauthorized(await runAuth(makeReq(badSignature)));
  assertUnauthorized(await runAuth(makeReq(expired)));
  assert.equal(spy.mock.callCount(), 0);
});

test('signToken 会把 tokenVersion 写进载荷', () => {
  const payload = jwt.verify(signToken(DB_USER), config.jwt.secret);

  assert.equal(payload.tokenVersion, DB_USER.tokenVersion);
  assert.equal(payload.userId, DB_USER.id);
});
