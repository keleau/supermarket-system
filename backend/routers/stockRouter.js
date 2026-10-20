/**
 * 库存管理路由  /api/stock
 */
const express = require('express');
const ctrl = require('../controllers/stockController');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// 出入库明细与提交（管理员与操作员均可）
router.get('/inbound/list', authenticate, asyncHandler(ctrl.inboundList));
router.post('/inbound', authenticate, asyncHandler(ctrl.inbound));

router.get('/outbound/list', authenticate, asyncHandler(ctrl.outboundList));
router.post('/outbound', authenticate, asyncHandler(ctrl.outbound));

router.get('/warn/list', authenticate, asyncHandler(ctrl.warnList));
router.get('/log/list', authenticate, asyncHandler(ctrl.logList));
router.get('/statistics', authenticate, asyncHandler(ctrl.statistics));

module.exports = router;
