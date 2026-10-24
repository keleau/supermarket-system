-- ============================================================
--  增量迁移 001：sys_user 增加 token_version
--
--  作用：修改密码 / 重置密码 / 禁用账号 / 变更角色时把该值 +1，
--        旧 JWT 中的版本号与数据库不一致，鉴权时直接返回 401。
--
--  执行方式（不要跑 npm run db:init，那会清空数据）：
--    mysql -u root -p supermarket_admin < db/migrations/001_add_token_version.sql
--  或在 Navicat 中打开本文件并执行。
-- ============================================================

ALTER TABLE `sys_user`
  ADD COLUMN `token_version` INT NOT NULL DEFAULT 0
  COMMENT '登录令牌版本号，自增后旧 token 立即失效'
  AFTER `status`;
