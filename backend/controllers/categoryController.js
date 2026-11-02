/**
 * 商品分类 Controller
 */
const categoryModel = require('../models/categoryModel');
const { ok } = require('../utils/result');
const { toStr, toInt, assert, idParam } = require('../utils/validate');

/** 解析并校验分类入参 */
function buildPayload(body) {
  const b = body || {};

  const name = toStr(b.name);
  assert(name, '请输入分类名称');
  assert(name.length <= 20, '分类名称长度不能超过 20 个字');

  const description = toStr(b.description);
  assert(description.length <= 60, '分类描述长度不能超过 60 个字');

  const sort = toInt(b.sort, 0);

  return {
    name,
    colorToken: toStr(b.colorToken),
    description,
    sort,
    status: toInt(b.status, 1) === 0 ? 0 : 1,
  };
}

/* 4.2.1 分类列表（全量） */
async function list(req, res) {
  return ok(res, await categoryModel.listAll());
}

/* 4.2.2 新增分类 */
async function create(req, res) {
  const payload = buildPayload(req.body);
  assert(!(await categoryModel.existsName(payload.name)), '分类名称已存在');

  const created = await categoryModel.create(payload);
  return ok(res, created);
}

/* 4.2.3 编辑分类 */
async function update(req, res) {
  const id = toInt(req.body.id);
  assert(id !== null, '缺少分类 id');

  const exist = await categoryModel.findById(id);
  assert(exist, '分类不存在');

  const payload = buildPayload(req.body);
  assert(!(await categoryModel.existsName(payload.name, id)), '分类名称已存在');

  await categoryModel.update(id, payload);
  return ok(res, null);
}

/* 4.2.4 删除分类 */
async function remove(req, res) {
  const id = idParam(req, '分类');

  const exist = await categoryModel.findById(id);
  assert(exist, '分类不存在');
  assert(!(await categoryModel.hasProducts(id)), '该分类下存在商品，无法删除');

  await categoryModel.remove(id);
  return ok(res, null);
}

module.exports = { list, create, update, remove };
