/**
 * 全局配置：从 .env 读取，提供默认值兜底
 */
require('dotenv').config();

// 统一业务时区。必须在任何 Date 计算之前设置，否则「今天」的边界会按服务器默认时区算。
process.env.TZ = process.env.TZ || 'Asia/Shanghai';

// 与 .env.example 中的示例值保持一致：生产环境不允许继续使用
const INSECURE_JWT_SECRETS = new Set([
  'supermarket-admin-secret-key',
  'supermarket-admin-secret-key-please-change-in-production',
]);
const jwtSecret = process.env.JWT_SECRET || 'supermarket-admin-secret-key';

if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || INSECURE_JWT_SECRETS.has(process.env.JWT_SECRET)) {
    throw new Error('生产环境必须配置至少 32 位的 JWT_SECRET，且不能使用示例默认值');
  }
} else if (!process.env.JWT_SECRET) {
  console.warn('[config] 未配置 JWT_SECRET，开发环境使用内置默认值；生产环境将拒绝启动');
}

// 允许跨域访问的前端地址（逗号分隔）；无 Origin 的请求（curl/Postman/服务端代理）不受限制
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

module.exports = {
  port: Number(process.env.PORT) || 3000,

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'supermarket_admin',
    // MySQL 会话时区，需与上面的 TZ 保持一致（数字偏移格式）
    timeZone: process.env.DB_TIME_ZONE || '+08:00',
  },

  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  corsOrigins,

  // 新增用户 / 重置密码时的默认初始密码
  defaultPassword: '123456',

  // 系统内置管理员账号：禁止删除
  builtinAdminUsername: 'admin',
};
