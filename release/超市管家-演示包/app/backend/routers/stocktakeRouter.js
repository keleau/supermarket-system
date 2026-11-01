/**
 * 库存盘点路由  /api/stocktake
 */
const express = require('express');
const ctrl = require('../controllers/stocktakeController');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, requirePermission } = require('../middleware/auth');

const router = express.Router();

// 查询：仓管 / 会计 / 管理员
router.get('/list', authenticate, requirePermission('stocktake:read'), asyncHandler(ctrl.list));
router.get('/:id', authenticate, requirePermission('stocktake:read'), asyncHandler(ctrl.detail));

// 制单与实盘录入：仓管 / 管理员
router.post('/', authenticate, requirePermission('stocktake:create'), asyncHandler(ctrl.create));
router.put('/:id/items', authenticate, requirePermission('stocktake:create'), asyncHandler(ctrl.updateItems));
router.post('/:id/submit', authenticate, requirePermission('stocktake:create'), asyncHandler(ctrl.submit));
router.post('/:id/cancel', authenticate, requirePermission('stocktake:create'), asyncHandler(ctrl.cancel));

// 审核：仅管理员（权限矩阵中 stocktake:audit 只属于 *）
router.post('/:id/audit', authenticate, requirePermission('stocktake:audit'), asyncHandler(ctrl.audit));

module.exports = router;
