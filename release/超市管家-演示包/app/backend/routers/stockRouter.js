/**
 * 库存管理路由  /api/stock
 */
const express = require('express');
const ctrl = require('../controllers/stockController');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();

// 库存查询：仓管 / 采购 / 后勤 / 会计 / 管理员
router.get('/inbound/list', authenticate, requirePermission('stock:read'), asyncHandler(ctrl.inboundList));
router.get('/outbound/list', authenticate, requirePermission('stock:read'), asyncHandler(ctrl.outboundList));
router.get('/warn/list', authenticate, requirePermission('stock:read'), asyncHandler(ctrl.warnList));
router.get('/log/list', authenticate, requirePermission('stock:read'), asyncHandler(ctrl.logList));
router.get('/statistics', authenticate, requirePermission('stock:read'), asyncHandler(ctrl.statistics));
router.get('/slow-moving', authenticate, requirePermission('stock:read'), asyncHandler(ctrl.slowMoving));

// 库存操作：按岗位细分（收银员不可入库/出库）
router.post('/inbound', authenticate, requirePermission('stock:in'), asyncHandler(ctrl.inbound));
router.post('/outbound', authenticate, requirePermission('stock:out'), asyncHandler(ctrl.outbound));

module.exports = router;
