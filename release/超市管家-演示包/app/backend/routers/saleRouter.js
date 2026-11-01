/**
 * 销售管理路由  /api/sale
 * 注意：/record/list、/record/return、/record/void 必须定义在 /record/:id 之前；
 *      /return/list 必须定义在 /return/:id 之前。
 */
const express = require('express');
const ctrl = require('../controllers/saleController');
const returnCtrl = require('../controllers/saleReturnController');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, requireAdmin, requirePermission } = require('../middleware/auth');

const router = express.Router();

/* ---- 销售记录 ---- */
router.get('/record/list', authenticate, requirePermission('sale:read'), asyncHandler(ctrl.recordList));
router.post('/record', authenticate, requirePermission('sale:create'), asyncHandler(ctrl.submit));

// 兼容入口：管理员直接退货 / 作废
router.post('/record/return', authenticate, requireAdmin, asyncHandler(ctrl.returnSale));
router.post('/record/void', authenticate, requireAdmin, asyncHandler(ctrl.voidSale));

router.get('/record/:id', authenticate, requirePermission('sale:read'), asyncHandler(ctrl.recordDetail));

/* ---- 独立整单退货单（红字） ---- */
// /return/list 必须定义在 /return/:id 之前
router.get('/return/list', authenticate, requirePermission('sale:read'), asyncHandler(returnCtrl.list));
router.post('/return', authenticate, requirePermission('sale:return:create'), asyncHandler(returnCtrl.create));
router.get('/return/:id', authenticate, requirePermission('sale:read'), asyncHandler(returnCtrl.detail));

// 确认 / 拒绝：仅管理员（确认后回补库存并冲减营收）
router.post('/return/:id/confirm', authenticate, requireAdmin, asyncHandler(returnCtrl.confirm));
router.post('/return/:id/reject', authenticate, requireAdmin, asyncHandler(returnCtrl.reject));
// 取消：申请人本人或管理员
router.post('/return/:id/cancel', authenticate, requirePermission('sale:return:create'), asyncHandler(returnCtrl.cancel));

/* ---- 明细与统计 ---- */
router.get('/item/list', authenticate, requirePermission('sale:read'), asyncHandler(ctrl.itemList));
// 销售统计含成本 / 毛利，仅管理员可访问
router.get('/statistics', authenticate, requireAdmin, asyncHandler(ctrl.statistics));

module.exports = router;
