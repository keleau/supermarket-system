/**
 * 商品分类路由  /api/category
 */
const express = require('express');
const ctrl = require('../controllers/categoryController');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, requireAdmin, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/list', authenticate, requirePermission('category:read'), asyncHandler(ctrl.list));

router.post('/', authenticate, requireAdmin, asyncHandler(ctrl.create));
router.put('/', authenticate, requireAdmin, asyncHandler(ctrl.update));
router.delete('/:id', authenticate, requireAdmin, asyncHandler(ctrl.remove));

module.exports = router;
