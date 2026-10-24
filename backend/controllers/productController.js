/**
 * 商品档案 Controller
 */
const productModel = require('../models/productModel');
const categoryModel = require('../models/categoryModel');
const supplierModel = require('../models/supplierModel');
const stockModel = require('../models/stockModel');
const { transaction } = require('../db/pool');
const { BizError, ok, page } = require('../utils/result');
const { toStr, toInt, toNum, round2, paging, assert } = require('../utils/validate');

/**
 * 解析并校验商品入参
 * @returns 规范化后的字段对象
 */
function buildPayload(body) {
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

  const costPrice = round2(toNum(b.costPrice, 0));
  assert(costPrice >= 0, '进货价不能为负');

  const stockNum = toInt(b.stockNum, 0);
  assert(stockNum >= 0, '库存不能为负');

  const warnNum = toInt(b.warnNum, 0);
  assert(warnNum >= 0, '预警值不能为负');

  const supplierId = toInt(b.supplierId, null);

  // 库存为 0 时自动下架
  let status = toInt(b.status, 1) === 0 ? 0 : 1;
  if (stockNum === 0) status = 0;

  return {
    productCode,
    productName,
    categoryId,
    spec: toStr(b.spec),
    unit: toStr(b.unit, '个'),
    costPrice,
    salePrice,
    stockNum,
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
  return ok(res, page(result.list, result.total, pageNum, pageSize));
}

/* 4.3.2 商品详情 */
async function detail(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少商品 id');

  const product = await productModel.findById(id);
  assert(product, '商品不存在');

  return ok(res, product);
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
  const payload = buildPayload(req.body);
  await assertRelations(payload);

  const created = await transaction(async (conn) => {
    // 条码为空时后端自动生成（690 + 10 位序号）
    if (!payload.productCode) {
      payload.productCode = await productModel.generateProductCode(conn);
    } else {
      assert(!(await productModel.existsCode(payload.productCode)), '商品条码已存在');
    }
    return productModel.create(conn, payload);
  });

  return ok(res, created);
}

/* 4.3.4 编辑商品 */
async function update(req, res) {
  const id = toInt(req.body.id);
  assert(id !== null, '缺少商品 id');

  const exist = await productModel.findById(id);
  assert(exist, '商品不存在');

  const payload = buildPayload(req.body);
  await assertRelations(payload);

  // 条码为空时保留原条码，否则校验唯一
  if (!payload.productCode) {
    payload.productCode = exist.productCode;
  } else {
    assert(!(await productModel.existsCode(payload.productCode, id)), '商品条码已存在');
  }

  const operator = req.user.realName || req.user.username || '';

  await transaction(async (conn) => {
    // 行锁：防止编辑库存与并发出入库/结账互相覆盖
    const before = await productModel.findByIdForUpdate(conn, id);
    if (!before) throw new BizError('商品不存在');

    await productModel.update(conn, id, payload);

    // 编辑时直接改了库存 → 补一条调整流水，保证流水账与库存始终可对账
    const diff = payload.stockNum - before.stock_num;
    if (diff !== 0) {
      await stockModel.insertLog(conn, {
        productId: id,
        changeType: diff > 0 ? 1 : 2,
        quantity: Math.abs(diff),
        beforeNum: before.stock_num,
        afterNum: payload.stockNum,
        operator,
        remark: '商品档案编辑调整库存',
      });
    }
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
  return ok(res, null);
}

module.exports = { list, detail, options, create, update, remove };
