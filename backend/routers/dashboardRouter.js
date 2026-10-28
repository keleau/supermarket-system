/**
 * 运营仪表盘路由  /api/dashboard
 */
const express = require('express');
const ctrl = require('../controllers/dashboardController');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, requirePermission, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/overview', authenticate, requirePermission('dashboard:read'), asyncHandler(ctrl.overview));
router.get('/sale-trend', authenticate, requirePermission('dashboard:read'), asyncHandler(ctrl.saleTrend));
router.get('/stock-top', authenticate, requirePermission('dashboard:read'), asyncHandler(ctrl.stockTop));
router.get('/category-stock', authenticate, requirePermission('dashboard:read'), asyncHandler(ctrl.categoryStock));
router.get('/hot-products', authenticate, requirePermission('dashboard:read'), asyncHandler(ctrl.hotProducts));

// 进货金额属于成本数据，仅管理员
router.get('/supplier-ranking', authenticate, requireAdmin, asyncHandler(ctrl.supplierRanking));

module.exports = router;
