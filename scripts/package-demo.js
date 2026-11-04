#!/usr/bin/env node
/**
 * 生成学习通上传用的 Windows 离线演示包
 *
 * 用法：
 *   node scripts/package-demo.js            # 生成 release/超市管家-演示包.zip
 *   node scripts/package-demo.js --no-zip   # 只生成目录，方便先本地试跑
 *
 * 说明：
 * - 自动构建前端 dist
 * - 复制后端生产源码与 node_modules
 * - 复制当前电脑的 node.exe 作为便携运行时（要求打包机是 Windows x64）
 * - 生成 .env.demo（首次启动时由 start-demo.bat 复制为 .env）
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { execSync, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const BACKEND_DIR = path.join(ROOT, 'backend');
const DEMO_TEMPLATE_DIR = path.join(ROOT, 'demo');
const RELEASE_DIR = path.join(ROOT, 'release');
const STAGE_DIR = path.join(RELEASE_DIR, '超市管家-演示包');
const ZIP_FILE = path.join(RELEASE_DIR, '超市管家-演示包.zip');
const NO_ZIP = process.argv.includes('--no-zip');

function log(message) {
  console.log(`[package-demo] ${message}`);
}

async function copyDir(source, target) {
  await fsp.cp(source, target, { recursive: true, force: true });
}

async function copyFile(source, target) {
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.copyFile(source, target);
}

function run(command, cwd) {
  log(`执行：${command}`);
  execSync(command, { cwd, stdio: 'inherit' });
}

async function main() {
  if (!fs.existsSync(path.join(BACKEND_DIR, 'node_modules'))) {
    throw new Error('backend/node_modules 不存在，请先在 backend 执行 npm ci');
  }

  log('构建前端...');
  run('npm run build', FRONTEND_DIR);

  if (!fs.existsSync(path.join(FRONTEND_DIR, 'dist', 'index.html'))) {
    throw new Error('前端构建产物不存在：frontend/dist/index.html');
  }

  log('清理旧演示包...');
  await fsp.rm(STAGE_DIR, { recursive: true, force: true });
  await fsp.rm(ZIP_FILE, { force: true });
  await fsp.mkdir(STAGE_DIR, { recursive: true });

  log('复制后端源码与生产依赖...');
  const backendItems = [
    'app.js',
    'package.json',
    'package-lock.json',
    'config',
    'controllers',
    'db',
    'middleware',
    'models',
    'routers',
    'scripts',
    'services',
    'utils',
  ];
  for (const item of backendItems) {
    const source = path.join(BACKEND_DIR, item);
    if (!fs.existsSync(source)) continue;
    await copyDir(source, path.join(STAGE_DIR, 'app', 'backend', item));
  }
  await copyDir(path.join(BACKEND_DIR, 'node_modules'), path.join(STAGE_DIR, 'app', 'backend', 'node_modules'));

  log('复制前端构建产物...');
  await copyDir(path.join(FRONTEND_DIR, 'dist'), path.join(STAGE_DIR, 'app', 'frontend', 'dist'));

  log('写入便携 Node 运行时...');
  if (process.arch !== 'x64') {
    log(`警告：当前 Node 架构是 ${process.arch}，生成的 node.exe 只能在同一架构的演示机运行`);
  }
  await copyFile(process.execPath, path.join(STAGE_DIR, 'runtime', 'node.exe'));

  log('复制启动脚本...');
  // demo/start-demo.bat 只用于仓库模板转去 release 包；
  // 正式包使用不含模板判断的 start-demo.package.bat，避免批处理解析误判。
  for (const file of ['stop-demo.bat', 'reset-demo.bat', '配置数据库.bat', '使用说明.txt']) {
    await copyFile(path.join(DEMO_TEMPLATE_DIR, file), path.join(STAGE_DIR, file));
  }
  await copyFile(path.join(DEMO_TEMPLATE_DIR, 'start-demo.package.bat'), path.join(STAGE_DIR, 'start-demo.bat'));

  log('生成首次运行配置...');
  const envTemplate = fs.readFileSync(path.join(DEMO_TEMPLATE_DIR, 'env.demo.template'), 'utf8');
  const jwtSecret = crypto.randomBytes(32).toString('hex');
  const envDemo = envTemplate.replace('__JWT_SECRET__', jwtSecret);
  await fsp.mkdir(path.join(STAGE_DIR, 'app', 'backend'), { recursive: true });
  await fsp.writeFile(path.join(STAGE_DIR, 'app', 'backend', '.env.demo'), envDemo, 'utf8');

  log(`演示包目录已生成：${STAGE_DIR}`);

  if (!NO_ZIP) {
    log('压缩为 zip（学习通上传用）...');
    const command = `Compress-Archive -Path "${STAGE_DIR}" -DestinationPath "${ZIP_FILE}" -Force`;
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      stdio: 'inherit',
    });
    const sizeMb = (fs.statSync(ZIP_FILE).size / 1024 / 1024).toFixed(1);
    log(`完成：${ZIP_FILE}（${sizeMb} MB）`);
    log('上传前如需修改学校 MySQL 密码，可解压后编辑 app\\backend\\.env.demo，或首次启动时按提示编辑 .env。');
  } else {
    log('已跳过压缩，可直接运行目录内的 start-demo.bat 做本地验证。');
  }
}

main().catch((error) => {
  console.error(`[package-demo] 失败：${error.message}`);
  process.exit(1);
});
