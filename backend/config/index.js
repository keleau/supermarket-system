/**
 * 全局配置：从 .env 读取，提供默认值兜底
 */
require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT) || 3000,

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'supermarket_admin',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'supermarket-admin-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  // 新增用户 / 重置密码时的默认初始密码
  defaultPassword: '123456',

  // 系统内置管理员账号：禁止删除
  builtinAdminUsername: 'admin',
};
