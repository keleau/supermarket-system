/**
 * 超市管家商品管理后台 · 后端服务入口
 *
 * 架构：Router（分发） → Controller（业务/校验/事务） → Model（SQL 持久化）
 * 启动：npm run db:init 初始化数据库 → npm start
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

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

/* ---------------- 前端静态资源（演示/生产单端口模式） ---------------- */
// 开发/E2E 不开启；演示包通过 SERVE_FRONTEND=1 让后端同时托管 Vue 构建产物。
const serveFrontend = process.env.SERVE_FRONTEND === '1';
if (serveFrontend) {
  const frontendDist = process.env.FRONTEND_DIST
    ? path.resolve(__dirname, process.env.FRONTEND_DIST)
    : path.join(__dirname, '..', 'frontend', 'dist');
  const indexFile = path.join(frontendDist, 'index.html');

  if (fs.existsSync(indexFile)) {
    app.use(express.static(frontendDist, { index: false }));
    // history 模式路由回退：非 /api 的 GET 全部交给 Vue Router
    app.get(/.*/, (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      return res.sendFile(indexFile);
    });
  } else {
    console.warn(`[frontend] SERVE_FRONTEND=1，但未找到前端构建产物：${indexFile}`);
  }
}

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
