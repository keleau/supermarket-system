/**
 * 超市管家商品管理后台 · 后端服务入口
 *
 * 架构：Router（分发） → Controller（业务/校验/事务） → Model（SQL 持久化）
 * 启动：npm run db:init 初始化数据库 → npm start
 */
const express = require('express');
const cors = require('cors');
const path = require('path');

const config = require('./config');
const routes = require('./routers');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { pool } = require('./db/pool');

const app = express();

/* ---------------- 全局中间件 ---------------- */
// 只允许配置中的前端地址跨域；无 Origin 的请求（curl/Postman/服务端代理）放行
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    return callback(null, config.corsOrigins.includes(origin));
  },
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态资源（保留原有 public 目录）
app.use(express.static(path.join(__dirname, 'public')));

// 简易请求日志
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
  });
  next();
});

/* ---------------- 健康检查 ---------------- */
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ code: 200, msg: 'success', data: { status: 'ok', database: 'connected' } });
  } catch (err) {
    res.json({ code: 500, msg: `数据库连接失败：${err.message}`, data: null });
  }
});

/* ---------------- 业务路由 ---------------- */
app.use('/api', routes);

/* ---------------- 兜底处理 ---------------- */
app.use(notFound);
app.use(errorHandler);

/* ---------------- 启动 ---------------- */
async function bootstrap() {
  try {
    // 启动时先探一次数据库，避免接口全 500 却看不出原因
    await pool.query('SELECT 1');
    console.log(`[db] 已连接 ${config.db.host}:${config.db.port}/${config.db.database}`);
  } catch (err) {
    console.error('[db] ❌ 数据库连接失败：', err.message);
    console.error('     请检查 .env 配置，并确认已执行 npm run db:init');
    process.exit(1);
  }

  app.listen(config.port, () => {
    console.log(`\n超市管家后台服务已启动：http://localhost:${config.port}`);
    console.log(`接口前缀：http://localhost:${config.port}/api\n`);
  });
}

bootstrap();

module.exports = app;
