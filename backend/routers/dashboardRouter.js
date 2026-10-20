/**
 * 运营仪表盘路由  /api/dashboard
 */
const express = require('express');
const ctrl = require('../controllers/dashboardController');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/overview', authenticate, asyncHandler(ctrl.overview));
router.get('/sale-trend', authenticate, asyncHandler(ctrl.saleTrend));
router.get('/stock-top', authenticate, asyncHandler(ctrl.stockTop));
router.get('/category-stock', authenticate, asyncHandler(ctrl.categoryStock));
router.get('/hot-products', authenticate, asyncHandler(ctrl.hotProducts));

module.exports = router;
