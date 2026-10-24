const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeSaleItems, MAX_SALE_ITEM_TYPES } = require('../utils/saleItems');

test('合并同一商品的多行并累加数量', () => {
  const items = normalizeSaleItems([
    { productId: 3, quantity: 6 },
    { productId: 3, quantity: 6 },
  ]);

  assert.deepEqual(items, [{ productId: 3, quantity: 12 }]);
});

test('客户端传入的 salePrice 被忽略，不进入归一化结果', () => {
  const items = normalizeSaleItems([
    { productId: 1, quantity: 2, salePrice: 0.01 },
  ]);

  assert.deepEqual(items, [{ productId: 1, quantity: 2 }]);
});

test('重复行售价不同也不影响合并，售价统一由后端决定', () => {
  const items = normalizeSaleItems([
    { productId: 1, quantity: 1, salePrice: 5 },
    { productId: 1, quantity: 2, salePrice: 0.01 },
  ]);

  assert.deepEqual(items, [{ productId: 1, quantity: 3 }]);
});

test('结果按 productId 升序排列，保证加锁顺序一致', () => {
  const items = normalizeSaleItems([
    { productId: 9, quantity: 1 },
    { productId: 2, quantity: 1 },
    { productId: 5, quantity: 1 },
  ]);

  assert.deepEqual(items.map((it) => it.productId), [2, 5, 9]);
});

test('空明细、非数组明细被拒绝', () => {
  assert.throws(() => normalizeSaleItems([]), /销售商品不能为空/);
  assert.throws(() => normalizeSaleItems(undefined), /销售商品不能为空/);
  assert.throws(() => normalizeSaleItems({ productId: 1 }), /销售商品不能为空/);
});

test('商品 id 缺失或非法被拒绝', () => {
  assert.throws(() => normalizeSaleItems([{ quantity: 1 }]), /商品不合法/);
  assert.throws(() => normalizeSaleItems([{ productId: 0, quantity: 1 }]), /商品不合法/);
  assert.throws(() => normalizeSaleItems([{ productId: 'abc', quantity: 1 }]), /商品不合法/);
});

test('数量必须为正整数', () => {
  assert.throws(() => normalizeSaleItems([{ productId: 1, quantity: 0 }]), /数量必须大于 0/);
  assert.throws(() => normalizeSaleItems([{ productId: 1, quantity: -1 }]), /数量必须大于 0/);
  assert.throws(() => normalizeSaleItems([{ productId: 1 }]), /数量必须大于 0/);
});

test('超过最大商品种类数被拒绝', () => {
  const tooMany = Array.from({ length: MAX_SALE_ITEM_TYPES + 1 }, (_, i) => ({
    productId: i + 1,
    quantity: 1,
  }));
  assert.throws(() => normalizeSaleItems(tooMany), /最多 200 种商品/);
});
