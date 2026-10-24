/**
 * 销售明细归一化
 * 同一商品可能被客户端拆成多行提交，必须先合并再校验库存，
 * 否则每行都按初始库存判断，合计数量就会超卖。
 *
 * 售价不在这里处理：结账时统一取商品表当前售价，忽略客户端传入的 salePrice。
 */
const { toInt, assert } = require('./validate');

const MAX_SALE_ITEM_TYPES = 200;

/**
 * 合并同商品、校验基础字段，并按 productId 升序返回。
 * 升序是为了让所有事务以相同顺序加行锁，降低并发死锁概率。
 */
function normalizeSaleItems(rawItems) {
  assert(Array.isArray(rawItems) && rawItems.length > 0, '销售商品不能为空');
  assert(rawItems.length <= MAX_SALE_ITEM_TYPES, `单笔销售最多 ${MAX_SALE_ITEM_TYPES} 种商品`);

  const merged = new Map();

  for (const raw of rawItems) {
    const item = raw && typeof raw === 'object' ? raw : {};

    const productId = toInt(item.productId, null);
    assert(productId !== null && productId > 0, '销售商品不合法');

    const quantity = toInt(item.quantity, null);
    assert(quantity !== null && quantity > 0, '销售数量必须大于 0');

    const existing = merged.get(productId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      merged.set(productId, { productId, quantity });
    }
  }

  return [...merged.values()].sort((a, b) => a.productId - b.productId);
}

module.exports = { normalizeSaleItems, MAX_SALE_ITEM_TYPES };
