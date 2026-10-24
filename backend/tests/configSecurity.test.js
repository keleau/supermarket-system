const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

function loadConfig(env) {
  return spawnSync(process.execPath, ['-e', "require('./config')"], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

test('生产环境拒绝空 JWT_SECRET', () => {
  const result = loadConfig({ NODE_ENV: 'production', JWT_SECRET: '' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JWT_SECRET/);
});

test('生产环境拒绝过短的 JWT_SECRET', () => {
  const result = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'too-short' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JWT_SECRET/);
});

test('生产环境拒绝示例默认密钥', () => {
  const result = loadConfig({
    NODE_ENV: 'production',
    JWT_SECRET: 'supermarket-admin-secret-key-please-change-in-production',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JWT_SECRET/);
});

test('生产环境接受至少 32 位的自定义密钥', () => {
  const result = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(32) });
  assert.equal(result.status, 0, result.stderr);
});

test('开发环境缺少 JWT_SECRET 时启动并给出警告', () => {
  const result = loadConfig({ NODE_ENV: 'development', JWT_SECRET: '' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /开发环境使用内置默认值/);
});
