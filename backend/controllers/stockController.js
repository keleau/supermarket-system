/**
 * 库存管理 Controller
 * 入库 / 出库 均在 MySQL 事务内完成「更新库存 + 写流水」，二者原子一致。
 */
const stockModel = require('../models/stockModel');
const productModel = require('../models/productModel');
const supplierModel = require('../models/supplierModel');
const { transaction } = require('../db/pool');
const { BizError, ok, page } = require('../utils/result');
const {
  toStr, toInt, toNum, round2, paging, assert, assertDateRange, startOfDay, endOfDay,
} = require('../utils/validate');

/** 操作人一律从 token 解析，不接受前端传值（防伪造） */
function operatorName(req) {
  return req.user.realName || req.user.username || '';
}

/** 解析流水列表的公共查询条件 */
function logQuery(req, forcedChangeType = null) {
  const { pageNum, pageSize, offset } = paging(req.query);
  const startDate = toStr(req.query.startTime);
  const endDate = toStr(req.query.endTime);
  assertDateRange(startDate, endDate);

  return {
    pageNum,
    pageSize,
    offset,
    productName: toStr(req.query.productName) || null,
    productId: toInt(req.query.productId, null),
    changeType: forcedChangeType !== null ? forcedChangeType : toInt(req.query.changeType, null),
    startTime: startOfDay(startDate),
    endTime: endOfDay(endDate),
  };
}

/* ------------------------------------------------------------------ */
/* 4.5.1 入库明细分页列表                                                */
/* ------------------------------------------------------------------ */
async function inboundList(req, res) {
  const q = logQuery(req, 1);
  const result = await stockModel.logList(q);
  return ok(res, page(result.list, result.total, q.pageNum, q.pageSize));
}

/* ------------------------------------------------------------------ */
/* 4.5.2 提交入库                                                        */
/* ------------------------------------------------------------------ */
async function inbound(req, res) {
  const productId = toInt(req.body.productId);
  assert(productId !== null, '请选择商品');

  const quantity = toInt(req.body.quantity);
  assert(quantity !== null && quantity > 0, '入库数量必须大于 0');

  const inboundPrice = req.body.inboundPrice === undefined || req.body.inboundPrice === null || req.body.inboundPrice === ''
    ? null
    : round2(toNum(req.body.inboundPrice, 0));
  if (inboundPrice !== null) assert(inboundPrice >= 0, '入库单价不能为负');

  const supplierId = toInt(req.body.supplierId, null);
  const remark = toStr(req.body.remark);
  const operator = operatorName(req);

  const result = await transaction(async (conn) => {
    // 加行锁，防止并发入库覆盖
    const product = await productModel.findByIdForUpdate(conn, productId);
    if (!product) throw new BizError('商品不存在');

    // 供应商名称回填（冗余到流水，避免供应商改名影响历史）
    let supplierName = '';
    if (supplierId !== null) {
      const supplier = await supplierModel.findById(supplierId);
      if (!supplier) throw new BizError('供应商不存在');
      supplierName = supplier.supplierName;
    }

    const beforeNum = product.stock_num;
    const afterNum = beforeNum + quantity;

    await productModel.changeStock(conn, productId, quantity);

    // 原为缺货下架的商品，入库后自动上架
    if (beforeNum <= 0 && product.status === 0) {
      await productModel.updateStatus(conn, productId, 1);
    }

    return stockModel.insertLog(conn, {
      productId,
      changeType: 1,
      quantity,
      beforeNum,
      afterNum,
      supplierName,
      inboundPrice,
      operator,
      remark,
    });
  });

  return ok(res, { id: result.id });
}

/* ------------------------------------------------------------------ */
/* 4.5.3 出库明细分页列表                                                */
/* ------------------------------------------------------------------ */
async function outboundList(req, res) {
  const q = logQuery(req, 2);
  const result = await stockModel.logList(q);
  return ok(res, page(result.list, result.total, q.pageNum, q.pageSize));
}

/* ------------------------------------------------------------------ */
/* 4.5.4 提交出库                                                        */
/* ------------------------------------------------------------------ */
async function outbound(req, res) {
  const productId = toInt(req.body.productId);
  assert(productId !== null, '请选择商品');

  const quantity = toInt(req.body.quantity);
  assert(quantity !== null && quantity > 0, '出库数量必须大于 0');

  const remark = toStr(req.body.remark);
  const operator = operatorName(req);

  const result = await transaction(async (conn) => {
    const product = await productModel.findByIdForUpdate(conn, productId);
    if (!product) throw new BizError('商品不存在');

    // 库存不足 → 抛错触发回滚，不产生任何数据变更
    if (quantity > product.stock_num) {
      throw new BizError('出库数量大于当前库存');
    }

    const beforeNum = product.stock_num;
    const afterNum = beforeNum - quantity;

    await productModel.changeStock(conn, productId, -quantity);

    return stockModel.insertLog(conn, {
      productId,
      changeType: 2,
      quantity,
      beforeNum,
      afterNum,
      operator,
      remark,
    });
  });

  return ok(res, { id: result.id });
}

/* ------------------------------------------------------------------ */
/* 4.5.5 预警商品列表                                                    */
/* ------------------------------------------------------------------ */
async function warnList(req, res) {
  const warnStatus = toInt(req.query.warnStatus, null);
  if (warnStatus !== null) assert([1, 2].includes(warnStatus), '预警状态取值不合法');

  const list = await stockModel.warnList({
    productName: toStr(req.query.productName) || null,
    warnStatus,
  });
  return ok(res, list);
}

/* ------------------------------------------------------------------ */
/* 4.5.6 出入库流水分页列表                                              */
/* ------------------------------------------------------------------ */
async function logList(req, res) {
  const q = logQuery(req, null);
  const result = await stockModel.logList(q);
  return ok(res, page(result.list, result.total, q.pageNum, q.pageSize));
}

/* ------------------------------------------------------------------ */
/* 4.5.7 库存统计                                                        */
/* ------------------------------------------------------------------ */
async function statistics(req, res) {
  return ok(res, await stockModel.statistics());
}

module.exports = {
  inboundList, inbound, outboundList, outbound, warnList, logList, statistics,
};
