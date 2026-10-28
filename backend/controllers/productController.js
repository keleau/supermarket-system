/**
 * 商品档案 Controller
 */
const productModel = require('../models/productModel');
const categoryModel = require('../models/categoryModel');
const supplierModel = require('../models/supplierModel');
const { transaction } = require('../db/pool');
const { ok, page } = require('../utils/result');
const { toStr, toInt, toNum, round2, round4, paging, assert } = require('../utils/validate');
const { assertCostUnchanged } = require('../utils/cost');
const { maskProductCost } = require('../utils/finance');
const { writeLog } = require('../utils/operationLog');

/**
 * 解析并校验商品入参
 * @param {object} body
 * @param {{ withCost?: boolean }} [options] withCost=true 仅用于新增（期初成本）；
 *   编辑不允许写入成本，成本只能由入库按移动加权平均自动计算。
 * @returns 规范化后的字段对象
 */
function buildPayload(body, { withCost = false } = {}) {
  const b = body || {};

  const productName = toStr(b.productName);
  assert(productName, '请输入商品名称');
  assert(productName.length <= 50, '商品名称长度不能超过 50 个字');

  const productCode = toStr(b.productCode);
  assert(productCode.length <= 13, '商品条码长度不能超过 13 位');

  const categoryId = toInt(b.categoryId, null);
  assert(categoryId !== null, '请选择商品分类');

  const salePrice = round2(toNum(b.salePrice, 0));
  assert(salePrice > 0, '销售单价必须大于 0');

  const costPrice = round4(toNum(b.costPrice, 0));
  assert(costPrice >= 0, '成本价不能为负');

  const warnNum = toInt(b.warnNum, 0);
  assert(warnNum >= 0, '预警值不能为负');

  const supplierId = toInt(b.supplierId, null);
  const status = toInt(b.status, 1) === 0 ? 0 : 1;

  return {
    productCode,
    productName,
    categoryId,
    spec: toStr(b.spec),
    unit: toStr(b.unit, '个'),
    ...(withCost ? { costPrice } : {}),
    salePrice,
    warnNum,
    supplierId,
    imageUrl: toStr(b.imageUrl),
    status,
  };
}

/** 校验关联的分类/供应商存在 */
async function assertRelations(payload) {
  const category = await categoryModel.findById(payload.categoryId);
  assert(category, '商品分类不存在');

  if (payload.supplierId !== null) {
    const supplier = await supplierModel.findById(payload.supplierId);
    assert(supplier, '供应商不存在');
  }
}

/* 4.3.1 商品分页列表 */
async function list(req, res) {
  const { pageNum, pageSize, offset } = paging(req.query);
  const result = await productModel.list({
    pageNum,
    pageSize,
    offset,
    productName: toStr(req.query.productName) || null,
    productCode: toStr(req.query.productCode) || null,
    categoryId: toInt(req.query.categoryId, null),
    status: toInt(req.query.status, null),
  });
  return ok(res, page(maskProductCost(result.list, req.user), result.total, pageNum, pageSize));
}

/* 4.3.2 商品详情 */
async function detail(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少商品 id');

  const product = await productModel.findById(id);
  assert(product, '商品不存在');

  return ok(res, maskProductCost(product, req.user));
}

/**
 * 扩展：商品下拉选项
 * - 默认只返回在售商品（收银开单选品）
 * - includeOffline=1 时包含下架商品（出入库补货用：库存为 0 被自动下架的商品必须能再入库）
 */
async function options(req, res) {
  const includeOffline = toInt(req.query.includeOffline, 0) === 1;
  return ok(res, await productModel.options({ includeOffline }));
}

/* 4.3.3 新增商品 */
async function create(req, res) {
  // 新增时允许填写期初成本；首次入库后由加权平均接管
  const payload = buildPayload(req.body, { withCost: true });
  // 库存只能由入库 / 盘点等单据驱动：新建商品库存固定为 0，入库后自动上架
  payload.stockNum = 0;
  payload.status = 0;
  await assertRelations(payload);

  const created = await transaction(async (conn) => {
    // 条码为空时后端自动生成（690 + 10 位序号）
    if (!payload.productCode) {
      payload.productCode = await productModel.generateProductCode(conn);
    } else {
      assert(!(await productModel.existsCode(payload.productCode)), '商品条码已存在');
    }
    const createdRow = await productModel.create(conn, payload);
    await writeLog(conn, req, {
      module: 'product',
      action: 'create',
      bizNo: createdRow.id,
      detail: `创建商品「${payload.productName}」`,
    });
    return createdRow;
  });

  return ok(res, created);
}

/* 4.3.4 编辑商品 */
async function update(req, res) {
  const id = toInt(req.body.id);
  assert(id !== null, '缺少商品 id');

  const exist = await productModel.findById(id);
  assert(exist, '商品不存在');

  // 成本只能由入库自动计算：旧前端带回原值可通过，真正改动会被拒绝
  assertCostUnchanged(toNum(req.body.costPrice, null), exist.costPrice);

  const payload = buildPayload(req.body);
  // 库存为 0 时保持下架；库存 > 0 时允许手动下架/上架
  if (exist.stockNum <= 0) payload.status = 0;
  await assertRelations(payload);

  // 条码为空时保留原条码，否则校验唯一
  if (!payload.productCode) {
    payload.productCode = exist.productCode;
  } else {
    assert(!(await productModel.existsCode(payload.productCode, id)), '商品条码已存在');
  }

  // 库存不在此更新：只能由入库 / 出库 / 销售 / 盘点等单据驱动
  await productModel.update(null, id, payload);
  await writeLog(null, req, {
    module: 'product',
    action: 'update',
    bizNo: id,
    detail: `编辑商品「${payload.productName}」`,
  });

  return ok(res, null);
}

/* 4.3.5 删除商品 */
async function remove(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少商品 id');

  const exist = await productModel.findById(id);
  assert(exist, '商品不存在');
  assert(!(await productModel.hasBusinessRecords(id)), '该商品存在业务记录，无法删除');

  await productModel.remove(id);
  await writeLog(null, req, {
    module: 'product',
    action: 'delete',
    bizNo: id,
    detail: `删除商品「${exist.productName}」`,
  });
  return ok(res, null);
}

module.exports = { list, detail, options, create, update, remove };
