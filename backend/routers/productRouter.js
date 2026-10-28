/**
 * 商品档案路由  /api/product
 * 注意：/options、/list 必须定义在 /:id 之前，否则会被 :id 吞掉
 */
const express = require('express');
const ctrl = require('../controllers/productController');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, requireAdmin, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/list', authenticate, requirePermission('product:read'), asyncHandler(ctrl.list));
router.get('/options', authenticate, requirePermission('product:read'), asyncHandler(ctrl.options));

router.post('/', authenticate, requireAdmin, asyncHandler(ctrl.create));
router.put('/', authenticate, requireAdmin, asyncHandler(ctrl.update));

router.get('/:id', authenticate, requirePermission('product:read'), asyncHandler(ctrl.detail));
router.delete('/:id', authenticate, requireAdmin, asyncHandler(ctrl.remove));

module.exports = router;
