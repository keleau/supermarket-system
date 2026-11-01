/**
 * 采购管理路由  /api/purchase
 */
const express = require('express');
const ctrl = require('../controllers/purchaseController');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, requireAdmin, requirePermission } = require('../middleware/auth');

const router = express.Router();

// 查询：采购 / 仓管 / 管理员
router.get('/list', authenticate, requirePermission('purchase:read'), asyncHandler(ctrl.list));
router.get('/:id', authenticate, requirePermission('purchase:read'), asyncHandler(ctrl.detail));

// 制单：采购 / 管理员
router.post('/', authenticate, requirePermission('purchase:create'), asyncHandler(ctrl.create));
router.put('/:id', authenticate, requirePermission('purchase:create'), asyncHandler(ctrl.update));
router.post('/:id/submit', authenticate, requirePermission('purchase:create'), asyncHandler(ctrl.submit));
router.post('/:id/cancel', authenticate, requirePermission('purchase:create'), asyncHandler(ctrl.cancel));

// 收货入库：仓管 / 管理员
router.post('/:id/receive', authenticate, requirePermission('purchase:receive'), asyncHandler(ctrl.receive));

// 登记付款：仅管理员
router.post('/:id/pay', authenticate, requireAdmin, asyncHandler(ctrl.pay));

module.exports = router;
