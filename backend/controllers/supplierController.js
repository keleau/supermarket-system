/**
 * 供应商 Controller
 */
const supplierModel = require('../models/supplierModel');
const { ok, page } = require('../utils/result');
const { toStr, toInt, paging, assert, isPhone } = require('../utils/validate');

/** 解析并校验供应商入参 */
function buildPayload(body) {
  const b = body || {};

  const supplierName = toStr(b.supplierName);
  assert(supplierName, '请输入供应商名称');
  assert(supplierName.length <= 40, '供应商名称长度不能超过 40 个字');

  const contactPerson = toStr(b.contactPerson);
  assert(contactPerson.length <= 20, '联系人长度不能超过 20 个字');

  const phone = toStr(b.phone);
  if (phone) assert(isPhone(phone), '手机号格式不正确');

  const address = toStr(b.address);
  assert(address.length <= 80, '地址长度不能超过 80 个字');

  const remark = toStr(b.remark);
  assert(remark.length <= 100, '备注长度不能超过 100 个字');

  return { supplierName, contactPerson, phone, address, remark };
}

/* 4.4.1 供应商分页列表 */
async function list(req, res) {
  const { pageNum, pageSize, offset } = paging(req.query);
  const result = await supplierModel.list({
    pageNum,
    pageSize,
    offset,
    supplierName: toStr(req.query.supplierName) || null,
    contactPerson: toStr(req.query.contactPerson) || null,
  });
  return ok(res, page(result.list, result.total, pageNum, pageSize));
}

/* 4.4.2 供应商下拉选项 */
async function options(req, res) {
  return ok(res, await supplierModel.options());
}

/* 4.4.3 新增供应商 */
async function create(req, res) {
  const payload = buildPayload(req.body);
  assert(!(await supplierModel.existsName(payload.supplierName)), '供应商名称已存在');

  const created = await supplierModel.create(payload);
  return ok(res, created);
}

/* 4.4.4 编辑供应商 */
async function update(req, res) {
  const id = toInt(req.body.id);
  assert(id !== null, '缺少供应商 id');

  const exist = await supplierModel.findById(id);
  assert(exist, '供应商不存在');

  const payload = buildPayload(req.body);
  assert(!(await supplierModel.existsName(payload.supplierName, id)), '供应商名称已存在');

  await supplierModel.update(id, payload);
  return ok(res, null);
}

/* 4.4.5 删除供应商 */
async function remove(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少供应商 id');

  const exist = await supplierModel.findById(id);
  assert(exist, '供应商不存在');
  assert(!(await supplierModel.isReferenced(id)), '该供应商下存在关联商品或采购单，无法删除');

  await supplierModel.remove(id);
  return ok(res, null);
}

module.exports = { list, options, create, update, remove };
