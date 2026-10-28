/**
 * 供应商路由  /api/supplier
 */
const express = require('express');
const ctrl = require('../controllers/supplierController');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, requireAdmin, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/list', authenticate, requirePermission('supplier:read'), asyncHandler(ctrl.list));
router.get('/options', authenticate, requirePermission('supplier:read'), asyncHandler(ctrl.options));

router.post('/', authenticate, requireAdmin, asyncHandler(ctrl.create));
router.put('/', authenticate, requireAdmin, asyncHandler(ctrl.update));
router.delete('/:id', authenticate, requireAdmin, asyncHandler(ctrl.remove));

module.exports = router;
