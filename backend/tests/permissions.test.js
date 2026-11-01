const test = require('node:test');
const assert = require('node:assert/strict');

const {
  permissionsFor,
  hasPermission,
  hasAnyPermission,
} = require('../utils/permissions');

function user(position, role = 'operator') {
  return { role, position, permissions: permissionsFor({ role, position }) };
}

test('管理员拥有全部权限', () => {
  const admin = user('管理员', 'admin');
  assert.deepEqual(admin.permissions, ['*']);
  assert.equal(hasPermission(admin, 'stock:in'), true);
  assert.equal(hasPermission(admin, 'sale:stats'), true);
  assert.equal(hasPermission(admin, 'anything:else'), true);
});

test('仓管可以出入库和发起盘点，不能销售', () => {
  const warehouse = user('仓管');
  assert.equal(hasPermission(warehouse, 'stock:in'), true);
  assert.equal(hasPermission(warehouse, 'stock:out'), true);
  assert.equal(hasPermission(warehouse, 'stock:read'), true);
  assert.equal(hasPermission(warehouse, 'stocktake:create'), true);
  assert.equal(hasPermission(warehouse, 'stocktake:audit'), false);
  assert.equal(hasPermission(warehouse, 'sale:create'), false);
  assert.equal(hasPermission(warehouse, 'sale:read'), false);
});

test('收银员可以销售开单并发起退货申请，不能入库/出库或看全部单据', () => {
  const cashier = user('收银员');
  assert.equal(hasPermission(cashier, 'sale:create'), true);
  assert.equal(hasPermission(cashier, 'sale:return:create'), true);
  assert.equal(hasPermission(cashier, 'sale:read'), true);
  assert.equal(hasPermission(cashier, 'sale:read:all'), false);
  assert.equal(hasPermission(cashier, 'stock:in'), false);
  assert.equal(hasPermission(cashier, 'stock:out'), false);
  assert.equal(hasPermission(cashier, 'stock:read'), false);
});

test('采购可以制单，不能直接入库、出库或销售', () => {
  const purchaser = user('采购');
  assert.equal(hasPermission(purchaser, 'purchase:read'), true);
  assert.equal(hasPermission(purchaser, 'purchase:create'), true);
  assert.equal(hasPermission(purchaser, 'purchase:receive'), false);
  assert.equal(hasPermission(purchaser, 'stock:in'), false);
  assert.equal(hasPermission(purchaser, 'stock:out'), false);
  assert.equal(hasPermission(purchaser, 'sale:create'), false);
});

test('仓管可以确认采购收货，不能制单', () => {
  const warehouse = user('仓管');
  assert.equal(hasPermission(warehouse, 'purchase:read'), true);
  assert.equal(hasPermission(warehouse, 'purchase:receive'), true);
  assert.equal(hasPermission(warehouse, 'purchase:create'), false);
});

test('会计和收银员不能访问采购模块', () => {
  const accountant = user('会计');
  const cashier = user('收银员');
  assert.equal(hasPermission(accountant, 'purchase:read'), false);
  assert.equal(hasPermission(cashier, 'purchase:read'), false);
});

test('后勤只能看库存，不能操作单据', () => {
  const logistics = user('后勤');
  assert.equal(hasPermission(logistics, 'stock:read'), true);
  assert.equal(hasPermission(logistics, 'stock:in'), false);
  assert.equal(hasPermission(logistics, 'stock:out'), false);
});

test('会计可以查看全部销售单和盘点单，但不能开单/发起退货，销售统计仍为管理员专属', () => {
  const accountant = user('会计');
  assert.equal(hasPermission(accountant, 'sale:read'), true);
  assert.equal(hasPermission(accountant, 'sale:read:all'), true);
  assert.equal(hasPermission(accountant, 'sale:create'), false);
  assert.equal(hasPermission(accountant, 'sale:return:create'), false);
  assert.equal(hasPermission(accountant, 'sale:stats'), false);
  assert.equal(hasPermission(accountant, 'stocktake:read'), true);
  assert.equal(hasPermission(accountant, 'stocktake:create'), false);
});

test('未知职位只保留首页权限，避免登录后白屏', () => {
  const unknown = user('临时工');
  assert.deepEqual(unknown.permissions, ['dashboard:read']);
});

test('hasAnyPermission 满足任意一个权限码即通过', () => {
  const cashier = user('收银员');
  assert.equal(hasAnyPermission(cashier, ['sale:create', 'stock:in']), true);
  assert.equal(hasAnyPermission(cashier, ['stock:in', 'stock:out']), false);
  assert.equal(hasAnyPermission(cashier, []), true);
});
