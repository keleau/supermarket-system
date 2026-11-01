/**
 * 演示机启动器
 *
 * 目标：学习通下载解压后，双击 start-demo.bat 即可：
 *   1. 检查 MySQL 连接
 *   2. 首次运行时自动建库、建表、写入演示账号
 *   3. 启动后端（同时托管前端 dist）
 *   4. 自动打开浏览器
 *
 * 不依赖演示机安装 Node：演示包自带 runtime/node.exe。
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, spawnSync, exec } = require('child_process');
const mysql = require('mysql2/promise');

const BACKEND_DIR = path.resolve(__dirname, '..');
const PACKAGE_DIR = path.resolve(BACKEND_DIR, '..');
const FRONTEND_DIST = process.env.FRONTEND_DIST
  ? path.resolve(process.env.FRONTEND_DIST)
  : path.join(PACKAGE_DIR, 'frontend', 'dist');
const PID_FILE = path.join(BACKEND_DIR, '.demo.pid');
const ENV_FILE = path.join(BACKEND_DIR, '.env');
const REQUIRED_TABLES = [
  'sys_user',
  'product',
  'purchase_order',
  'sale_return_order',
  'stocktake_order',
  'operation_log',
];

function log(message) {
  console.log(`[demo] ${message}`);
}

function openEnvEditor() {
  if (process.platform === 'win32') {
    spawnSync('notepad.exe', [ENV_FILE], { stdio: 'ignore' });
  }
}

function cleanupPid() {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    /* pid 文件可能不存在 */
  }
}

function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* 进程可能已经退出 */
  }
}

function stopPreviousInstance() {
  if (!fs.existsSync(PID_FILE)) return;

  const oldPid = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
  if (Number.isInteger(oldPid) && oldPid > 0) {
    log(`发现上次运行的演示进程 PID=${oldPid}，先停止...`);
    killProcessTree(oldPid);
  }
  cleanupPid();
}

function portAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function choosePort(preferred) {
  for (let port = preferred; port < preferred + 20; port += 1) {
    if (await portAvailable(port)) return port;
  }
  throw new Error(`端口 ${preferred} ~ ${preferred + 19} 都被占用，请关闭占用程序后重试`);
}

async function inspectDatabase(db) {
  const conn = await mysql.createConnection({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    connectTimeout: 5000,
  });

  try {
    const [schemas] = await conn.query(
      'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
      [db.database]
    );
    if (!schemas.length) return 'missing';

    const placeholders = REQUIRED_TABLES.map(() => '?').join(', ');
    const [tables] = await conn.query(
      `SELECT COUNT(*) AS count
       FROM information_schema.tables
       WHERE table_schema = ? AND table_name IN (${placeholders})`,
      [db.database, ...REQUIRED_TABLES]
    );
    return Number(tables[0].count) === REQUIRED_TABLES.length ? 'ready' : 'partial';
  } finally {
    await conn.end();
  }
}

function explainDbError(error) {
  console.error('');
  console.error('[demo] 无法连接 MySQL：', error.message);
  console.error('');

  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    console.error('请先启动学校电脑上的 MySQL 服务（Windows 服务管理器 → MySQL → 启动）。');
    console.error(`如果端口不是 3306，请修改：${ENV_FILE}`);
  } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('数据库账号或密码不正确。');
    console.error(`即将打开配置文件：${ENV_FILE}`);
    console.error('请修改 DB_USER / DB_PASSWORD 后保存，再重新双击 start-demo.bat。');
    openEnvEditor();
  } else {
    console.error(`请检查配置文件：${ENV_FILE}`);
  }
}

async function ensureDatabase() {
  // config 会读取 backend/.env；必须在 start-demo.bat 复制 .env 之后运行
  const config = require('../config');
  const db = config.db;

  let status;
  try {
    status = await inspectDatabase(db);
  } catch (error) {
    explainDbError(error);
    process.exit(1);
  }

  if (status === 'ready') {
    log(`演示数据库已就绪：${db.database}`);
    return config;
  }

  log(status === 'missing' ? '未找到演示数据库，开始初始化...' : '数据库结构不完整，重新初始化...');
  const result = spawnSync(process.execPath, ['db/init.js'], {
    cwd: BACKEND_DIR,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.error('');
    console.error('[demo] 数据库初始化失败，请检查上面的错误信息。');
    process.exit(1);
  }

  log('演示数据库初始化完成。');
  return config;
}

async function waitForHealth(port, child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`后端进程提前退出（code=${child.exitCode}）`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      const payload = await res.json();
      if (payload.code === 200) return;
    } catch {
      /* 服务尚未就绪 */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('后端启动超时');
}

async function main() {
  stopPreviousInstance();

  if (!fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
    throw new Error(`未找到前端构建产物：${path.join(FRONTEND_DIST, 'index.html')}，请重新打包`);
  }

  const config = await ensureDatabase();
  const port = await choosePort(Number(config.port) || 3000);
  if (port !== Number(config.port)) {
    log(`端口 ${config.port} 被占用，改用 ${port}`);
  }

  log('正在启动后端服务...');
  const child = spawn(process.execPath, ['app.js'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      SERVE_FRONTEND: '1',
      FRONTEND_DIST,
    },
    stdio: 'inherit',
  });

  fs.writeFileSync(PID_FILE, String(child.pid));

  const stop = () => {
    cleanupPid();
    killProcessTree(child.pid);
  };
  process.on('SIGINT', () => {
    stop();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    stop();
    process.exit(0);
  });

  child.on('exit', (code) => {
    cleanupPid();
    process.exit(code ?? 0);
  });

  try {
    await waitForHealth(port, child);
  } catch (error) {
    stop();
    throw error;
  }

  const url = `http://localhost:${port}`;
  console.log('');
  console.log('========================================');
  console.log('  超市管家演示环境已启动');
  console.log(`  地址：${url}`);
  console.log('  管理员：admin / 123456');
  console.log('  收银员：shouyin01 / 123456');
  console.log('  仓管：cangku01 / 123456');
  console.log('  会计：kuaiji01 / 123456');
  console.log('  停止：双击 stop-demo.bat（不要直接结束命令行窗口）');
  console.log('========================================');
  console.log('');

  if (process.env.DEMO_NO_BROWSER !== '1') {
    exec(`start "" "${url}"`);
  }
}

main().catch((error) => {
  console.error('');
  console.error('[demo] 启动失败：', error.message);
  process.exit(1);
});
