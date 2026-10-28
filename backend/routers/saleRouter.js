/**
 * 销售管理路由  /api/sale
 * 注意：/record/list、/record/return、/record/void 必须定义在 /record/:id 之前
 */
const express = require('express');
const ctrl = require('../controllers/saleController');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, requireAdmin, requirePermission } = require('../middleware/auth');

const router = express.Router();

/* ---- 销售记录 ---- */
router.get('/record/list', authenticate, requirePermission('sale:read'), asyncHandler(ctrl.recordList));
router.post('/record', authenticate, requirePermission('sale:create'), asyncHandler(ctrl.submit));

// 退货 / 作废：仅管理员
router.post('/record/return', authenticate, requireAdmin, asyncHandler(ctrl.returnSale));
router.post('/record/void', authenticate, requireAdmin, asyncHandler(ctrl.voidSale));

router.get('/record/:id', authenticate, requirePermission('sale:read'), asyncHandler(ctrl.recordDetail));

/* ---- 明细与统计 ---- */
router.get('/item/list', authenticate, requirePermission('sale:read'), asyncHandler(ctrl.itemList));
// 销售统计含成本 / 毛利，仅管理员可访问
router.get('/statistics', authenticate, requireAdmin, asyncHandler(ctrl.statistics));

module.exports = router;
