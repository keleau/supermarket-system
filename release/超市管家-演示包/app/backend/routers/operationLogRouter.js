/**
 * 操作日志路由  /api/operation-log
 * 仅管理员可查询，不提供修改/删除接口。
 */
const express = require('express');
const ctrl = require('../controllers/operationLogController');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/list', authenticate, requireAdmin, asyncHandler(ctrl.list));

module.exports = router;
