/**
 * 用户模块路由  /api/user
 */
const express = require('express');
const ctrl = require('../controllers/userController');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate, requireAdmin } = require('../middleware/auth');
const loginRateLimit = require('../middleware/loginRateLimit');

const router = express.Router();

// 公开
router.post('/login', loginRateLimit, asyncHandler(ctrl.login));

// 登录即可
router.post('/logout', authenticate, asyncHandler(ctrl.logout));
router.get('/info', authenticate, asyncHandler(ctrl.info));
router.post('/password', authenticate, asyncHandler(ctrl.changePassword));
router.put('/profile', authenticate, asyncHandler(ctrl.updateProfile));
router.patch('/avatar', authenticate, asyncHandler(ctrl.updateAvatar));

// 仅管理员
router.get('/list', authenticate, requireAdmin, asyncHandler(ctrl.list));
router.post('/', authenticate, requireAdmin, asyncHandler(ctrl.create));
router.put('/', authenticate, requireAdmin, asyncHandler(ctrl.update));
router.delete('/:id', authenticate, requireAdmin, asyncHandler(ctrl.remove));
router.post('/reset-password', authenticate, requireAdmin, asyncHandler(ctrl.resetPassword));

module.exports = router;
