/**
 * 销售管理路由  /api/sale
 * 注意：/record/list、/record/return、/record/void 必须定义在 /record/:id 之前
 */
const express = require('express');
const ctrl = require('../controllers/saleController');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/* ---- 销售记录 ---- */
router.get('/record/list', authenticate, asyncHandler(ctrl.recordList));
router.post('/record', authenticate, asyncHandler(ctrl.submit));

// 退货 / 作废：仅管理员
router.post('/record/return', authenticate, requireAdmin, asyncHandler(ctrl.returnSale));
router.post('/record/void', authenticate, requireAdmin, asyncHandler(ctrl.voidSale));

router.get('/record/:id', authenticate, asyncHandler(ctrl.recordDetail));

/* ---- 明细与统计 ---- */
router.get('/item/list', authenticate, asyncHandler(ctrl.itemList));
router.get('/statistics', authenticate, asyncHandler(ctrl.statistics));

module.exports = router;
