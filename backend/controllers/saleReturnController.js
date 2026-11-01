/**
 * 销售退货单 Controller（独立整单退货 / 红字冲销）
 *
 * 流程：
 *   1. 收银员（或管理员）凭销售单号发起整单退货申请 —— 只生成退货单，不动库存与营收；
 *   2. 管理员确认后，事务内回补库存、原销售单置为已退货（统计口径剔除 → 冲减营收）；
 *   3. 管理员可拒绝，申请人可取消；关键动作全部写操作日志。
 */
const saleReturnModel = require('../models/saleReturnModel');
const { transaction } = require('../db/pool');
const { BizError, ok, page } = require('../utils/result');
const {
  toStr, toInt, paging, assert, assertDateRange, startOfDay, endOfDay,
} = require('../utils/validate');
const { maskSaleItems } = require('../utils/finance');
const { hasPermission } = require('../utils/permissions');
const { writeLog } = require('../utils/operationLog');
const {
  RETURN_STATUS,
  RETURN_STATUS_VALUES,
  canReject,
  canCancel,
} = require('../utils/saleReturn');
const {
  operatorName,
  createReturnOrder,
  confirmReturnOrder,
} = require('../services/saleReturnService');

const MAX_RETRY = 3;

/* ------------------------------------------------------------------ */
/* 退货单分页列表                                                        */
/* ------------------------------------------------------------------ */
async function list(req, res) {
  const { pageNum, pageSize, offset } = paging(req.query);

  const status = toInt(req.query.status, null);
  if (status !== null) assert(RETURN_STATUS_VALUES.includes(status), '退货状态取值不合法');

  const startDate = toStr(req.query.startTime);
  const endDate = toStr(req.query.endTime);
  assertDateRange(startDate, endDate);

  // 收银员只能看自己发起的申请；管理员 / 会计可按申请人筛选
  const operator = hasPermission(req.user, 'sale:read:all')
    ? (toStr(req.query.operator) || null)
    : operatorName(req);

  const result = await saleReturnModel.list({
    pageNum,
    pageSize,
    offset,
    returnNo: toStr(req.query.returnNo) || null,
    saleNo: toStr(req.query.saleNo) || null,
    status,
    operator,
    startTime: startOfDay(startDate),
    endTime: endOfDay(endDate),
  });

  return ok(res, page(result.list, result.total, pageNum, pageSize));
}

/* ------------------------------------------------------------------ */
/* 退货单详情                                                            */
/* ------------------------------------------------------------------ */
async function detail(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少退货单 id');

  const order = await saleReturnModel.findById(id);
  assert(order, '退货单不存在');

  if (!hasPermission(req.user, 'sale:read:all') && order.operator !== operatorName(req)) {
    throw new BizError('无权限查看该退货单', 403);
  }

  order.items = maskSaleItems(order.items, req.user);
  return ok(res, order);
}

/* ------------------------------------------------------------------ */
/* 发起整单退货申请                                                      */
/* ------------------------------------------------------------------ */
async function create(req, res) {
  const saleNo = toStr(req.body.saleNo);
  assert(saleNo, '请提供销售单号');

  const remark = toStr(req.body.remark).slice(0, 200);

  for (let attempt = 1; attempt <= MAX_RETRY; attempt += 1) {
    try {
      const created = await transaction((conn) =>
        createReturnOrder(conn, req, { saleNo, remark })
      );
      return ok(res, created);
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY' && attempt < MAX_RETRY) continue;
      throw err;
    }
  }

  throw new BizError('退货单号生成冲突，请重试');
}

/* ------------------------------------------------------------------ */
/* 管理员确认退货（回补库存 + 冲减营收，仅管理员）                        */
/* ------------------------------------------------------------------ */
async function confirm(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少退货单 id');

  const result = await transaction((conn) => confirmReturnOrder(conn, req, id));
  return ok(res, result);
}

/* ------------------------------------------------------------------ */
/* 管理员拒绝退货（仅管理员）                                             */
/* ------------------------------------------------------------------ */
async function reject(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少退货单 id');

  await transaction(async (conn) => {
    const order = await saleReturnModel.findByIdForUpdate(conn, id);
    if (!order) throw new BizError('退货单不存在');
    if (!canReject(order.status)) throw new BizError('该退货单状态异常，无法拒绝');

    await saleReturnModel.updateStatus(conn, id, RETURN_STATUS.REJECTED);

    await writeLog(conn, req, {
      module: 'sale',
      action: 'return_reject',
      bizNo: order.return_no,
      beforeStatus: RETURN_STATUS.PENDING,
      afterStatus: RETURN_STATUS.REJECTED,
      detail: `拒绝整单退货申请，原单 ${order.sale_no}`,
    });
  });

  return ok(res, null);
}

/* ------------------------------------------------------------------ */
/* 取消退货申请（申请人或管理员）                                         */
/* ------------------------------------------------------------------ */
async function cancel(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少退货单 id');

  await transaction(async (conn) => {
    const order = await saleReturnModel.findByIdForUpdate(conn, id);
    if (!order) throw new BizError('退货单不存在');

    const isAdmin = req.user.role === 'admin';
    const isOwner = order.operator === operatorName(req);
    if (!canCancel(order.status, { isAdmin, isOwner })) {
      if (Number(order.status) !== RETURN_STATUS.PENDING) {
        throw new BizError('该退货单状态异常，无法取消');
      }
      throw new BizError('只能取消自己发起的退货申请', 403);
    }

    await saleReturnModel.updateStatus(conn, id, RETURN_STATUS.CANCELLED);

    await writeLog(conn, req, {
      module: 'sale',
      action: 'return_cancel',
      bizNo: order.return_no,
      beforeStatus: RETURN_STATUS.PENDING,
      afterStatus: RETURN_STATUS.CANCELLED,
      detail: `取消整单退货申请，原单 ${order.sale_no}`,
    });
  });

  return ok(res, null);
}

module.exports = { list, detail, create, confirm, reject, cancel };
