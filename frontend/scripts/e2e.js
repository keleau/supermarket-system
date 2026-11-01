/**
 * 连续点击式 E2E 测试
 *
 * 独立环境：临时 MySQL 库 + 后端 3210 + 前端预览 4173
 * 不碰本地 5173 / 3000，也不会污染演示数据。
 *
 * 覆盖主链路：
 * 管理员登录 → 新增商品 → 期初入库 → 入库/出库切换 → 销售开单 → 退货
 * → 库存盘点（生成/保存/提交/审核）→ 操作日志 → 积压/供应商排行
 * → 收银员权限与本人单据 → 仓管/会计菜单权限
 *
 * 用法：cd frontend && npm run test:e2e
 */
import { chromium } from 'playwright-core'
import { execSync, execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND_DIR = path.resolve(__dirname, '..')
const BACKEND_DIR = path.resolve(FRONTEND_DIR, '..', 'backend')
const RESULTS_DIR = path.join(FRONTEND_DIR, 'test-results')

const PREVIEW_PORT = 4173
const API_PORT = 3210
const BASE = `http://127.0.0.1:${PREVIEW_PORT}`
const API = `http://127.0.0.1:${API_PORT}`
const TMP_DB = `supermarket_e2e_${Date.now()}`
const IS_WIN = process.platform === 'win32'

const steps = []
const consoleErrors = []
let backendProc = null
let previewProc = null
let browser = null
let page = null

/* ---------------- 基础工具 ---------------- */

function findBrowser() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]
  const found = candidates.find((p) => existsSync(p))
  if (!found) throw new Error('未找到 Edge/Chrome，无法运行 UI E2E')
  return found
}

async function waitHttp(url, timeout = 60000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* 服务尚未就绪 */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`等待服务超时：${url}`)
}

function killTree(proc) {
  if (!proc || proc.killed) return
  try {
    if (IS_WIN) execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' })
    else proc.kill('SIGTERM')
  } catch {
    /* 进程可能已经退出 */
  }
}

function dropTempDb() {
  const dropSql = `DROP DATABASE IF EXISTS \`${TMP_DB}\``
  const code = `
    const mysql = require('mysql2/promise');
    const config = require('./config');
    (async () => {
      const c = await mysql.createConnection({
        host: config.db.host, port: config.db.port,
        user: config.db.user, password: config.db.password,
      });
      await c.query(${JSON.stringify(dropSql)});
      await c.end();
    })().catch(() => {});
  `
  try {
    execFileSync(process.execPath, ['-e', code], {
      cwd: BACKEND_DIR,
      env: { ...process.env, DB_NAME: TMP_DB },
      stdio: 'ignore',
    })
  } catch {
    /* 清理失败不覆盖主错误 */
  }
}

async function step(name, fn) {
  process.stdout.write(`\n[E2E] ${name} ... `)
  try {
    await fn()
    console.log('PASS')
    steps.push({ name, ok: true })
  } catch (err) {
    console.log('FAIL')
    steps.push({ name, ok: false, error: err.message })
    throw err
  }
}

/* ---------------- 页面操作 ---------------- */

async function login(username, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('请输入账号').fill(username)
  await page.getByPlaceholder('请输入密码').fill(password)
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await page.waitForURL('**/dashboard', { timeout: 15000 })
  await page.getByText('今日销售额').first().waitFor({ timeout: 15000 })
}

async function resetSession() {
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
}

async function expandMenu() {
  const btn = page.getByRole('button', { name: '展开菜单' })
  if (await btn.count()) {
    await btn.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(250)
  }
}

async function ensureSubmenu(text) {
  const title = page.locator('.el-menu').getByText(text, { exact: true }).first()
  if (!(await title.count())) return false

  const submenu = page.locator('.el-sub-menu').filter({ hasText: text }).first()
  if (!(await submenu.count())) return false

  const opened = await submenu
    .evaluate((el) => el.classList.contains('is-opened'))
    .catch(() => false)
  if (!opened) {
    await title.click()
    await page.waitForTimeout(300)
  }
  return true
}

async function menuCount(text) {
  return page.locator('.el-menu').getByText(text, { exact: true }).count()
}

async function clickStockMenu(label) {
  await expandMenu()
  await ensureSubmenu('库存管理')
  await page.locator('.el-menu').getByText(label, { exact: true }).click()
}

async function confirmBox(buttonName) {
  const box = page.locator('.el-message-box:visible').last()
  await box.waitFor({ timeout: 5000 })
  await box.getByRole('button', { name: buttonName, exact: true }).click()
}

/* ---------------- 业务流程 ---------------- */

async function createProductWithOpeningStock() {
  const productName = `E2E测试商品${Date.now()}`

  await page.goto(`${BASE}/product/list`)
  await page.getByRole('button', { name: '新增商品' }).waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: '新增商品' }).click()

  const dialog = page.locator('.el-dialog:visible').last()
  await dialog.waitFor()
  await dialog.getByPlaceholder('如 农夫山泉 550ml').fill(productName)

  await dialog.locator('.el-select').first().click()
  await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').first().click()

  await dialog.getByPlaceholder('如 550ml / 70g').fill('500g')
  await dialog.getByPlaceholder('如 瓶 / 包 / kg').fill('袋')

  const nums = dialog.locator('input[role="spinbutton"]')
  await nums.nth(0).fill('4')
  await nums.nth(1).fill('8')
  await nums.nth(2).fill('2')

  await dialog.getByRole('button', { name: '确定', exact: true }).click()

  const openingBox = page.locator('.el-message-box:visible').last()
  await openingBox.waitFor({ timeout: 10000 })
  await openingBox.getByRole('button', { name: '去期初入库', exact: true }).click()

  await page.waitForURL('**/stock/inbound**', { timeout: 10000 })
  const inboundDialog = page.locator('.el-dialog:visible').last()
  await inboundDialog.waitFor()
  const inNums = inboundDialog.locator('input[role="spinbutton"]')
  await inNums.nth(0).fill('6')
  await inNums.nth(1).fill('4')
  await inboundDialog.getByRole('button', { name: '确定入库', exact: true }).click()
  await page.getByText('入库成功，库存已更新').waitFor({ timeout: 10000 })

  await page.goto(`${BASE}/product/list`)
  await page.getByPlaceholder('如 农夫山泉').fill(productName)
  await page.getByRole('button', { name: '查询', exact: true }).click()

  const row = page.locator('.el-table__row', { hasText: productName }).first()
  await row.waitFor({ timeout: 10000 })
  const rowText = await row.innerText()
  assert.match(rowText, /6\s*袋/, `新商品库存应为 6 袋，实际：${rowText}`)
  assert.match(rowText, /在售/, `期初入库后应为在售，实际：${rowText}`)

  return productName
}

async function switchInboundOutbound() {
  await clickStockMenu('入库明细')
  await page.waitForURL('**/stock/inbound', { timeout: 10000 })
  await page.getByRole('heading', { name: '入库明细' }).waitFor({ timeout: 10000 })

  await clickStockMenu('出库明细')
  await page.waitForURL('**/stock/outbound', { timeout: 10000 })
  await page.getByRole('heading', { name: '出库明细' }).waitFor({ timeout: 10000 })
  await page.locator('.el-table__row').first().waitFor({ timeout: 10000 })

  await clickStockMenu('入库明细')
  await page.waitForURL('**/stock/inbound', { timeout: 10000 })
  await page.getByRole('heading', { name: '入库明细' }).waitFor({ timeout: 10000 })
}

async function checkoutAndReturn() {
  await page.goto(`${BASE}/sale/checkout`)
  await page.getByText('收银结算').first().waitFor({ timeout: 10000 })
  await page.getByText('农夫山泉 550ml', { exact: true }).first().click()

  const eq = page.getByRole('button', { name: '等于应收', exact: true })
  if (await eq.count()) await eq.click()

  await page.getByRole('button', { name: '提交开单', exact: true }).click()
  await page.getByText('开单成功').waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: '查看销售记录', exact: true }).click()
  await page.waitForURL('**/sale/record', { timeout: 10000 })

  const row = page.locator('.el-table__row').first()
  await row.waitFor({ timeout: 10000 })
  await row.getByRole('button', { name: '退款退货', exact: true }).click()
  await confirmBox('确认退货')
  await page.getByText(/已退款退货/).waitFor({ timeout: 10000 })
  await page.locator('.el-table__row').first().getByText('已退货').waitFor({ timeout: 10000 })
}

async function stocktakeFlow() {
  await page.goto(`${BASE}/stock/stocktake`)
  await page.getByRole('button', { name: '生成盘点任务' }).waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: '生成盘点任务' }).click()

  const createDialog = page.locator('.el-dialog:visible').last()
  await createDialog.waitFor()
  await createDialog.getByRole('button', { name: '生成', exact: true }).click()

  const drawer = page.locator('.el-drawer:visible').last()
  await drawer.waitFor({ timeout: 10000 })
  await drawer.getByText('实盘数').waitFor({ timeout: 10000 })

  await drawer.getByRole('button', { name: '保存实盘', exact: true }).click()
  await page.getByText('实盘数量已保存').waitFor({ timeout: 10000 })

  await drawer.getByRole('button', { name: '提交盘点', exact: true }).click()
  await confirmBox('提交')
  await page.getByText('盘点单已提交').waitFor({ timeout: 10000 })

  await drawer.getByRole('button', { name: '审核并修正库存', exact: true }).click()
  await confirmBox('审核')
  await page.getByText(/盘点单已审核/).waitFor({ timeout: 10000 })
  await page.getByText('已审核').first().waitFor({ timeout: 10000 })
}

async function purchaseFlow() {
  await page.goto(`${BASE}/purchase`)
  const createBtn = page.getByRole('button', { name: '新建采购单' })
  await createBtn.waitFor({ timeout: 10000 })
  await createBtn.click()

  const dialog = page.locator('.el-dialog:visible').last()
  await dialog.waitFor()
  await dialog.getByRole('combobox').first().click()
  await page.getByRole('option', { name: /农夫山泉股份有限公司/ }).click()

  await dialog.getByRole('combobox').nth(1).click()
  await page.getByRole('option', { name: /农夫山泉 550ml/ }).click()

  const nums = dialog.locator('input[role="spinbutton"]')
  await nums.nth(0).fill('5')
  await nums.nth(1).fill('2.5')
  await dialog.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.getByText(/已创建/).waitFor({ timeout: 10000 })

  const firstRow = () => page.locator('.el-table__row').first()
  await firstRow().waitFor({ timeout: 10000 })
  await firstRow().getByText('草稿', { exact: true }).waitFor({ timeout: 10000 })

  await firstRow().getByRole('button', { name: '提交', exact: true }).click()
  await confirmBox('提交')
  await page.getByText('采购单已提交').waitFor({ timeout: 10000 })
  await firstRow().getByText('已提交', { exact: true }).waitFor({ timeout: 10000 })

  await firstRow().getByRole('button', { name: '收货', exact: true }).click()
  await confirmBox('确认收货')
  await page.getByText(/收货成功/).waitFor({ timeout: 10000 })
  await firstRow().getByText('已入库', { exact: true }).waitFor({ timeout: 10000 })

  await firstRow().getByRole('button', { name: '付款', exact: true }).click()
  const payDialog = page.locator('.el-dialog:visible').last()
  await payDialog.waitFor()
  await payDialog.getByRole('button', { name: '确认付款', exact: true }).click()
  await page.getByText('付款已登记').waitFor({ timeout: 10000 })
  await firstRow().getByText('已付清', { exact: true }).waitFor({ timeout: 10000 })

  await firstRow().getByRole('button', { name: '查看', exact: true }).click()
  const drawer = page.locator('.el-drawer:visible').last()
  await drawer.waitFor({ timeout: 10000 })
  await drawer.getByText('采购金额').waitFor({ timeout: 10000 })
  await drawer.getByText('已付清').waitFor({ timeout: 10000 })
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
}

async function checkOperationLog() {
  await page.goto(`${BASE}/system/log`)
  await page.getByRole('heading', { name: '操作日志' }).waitFor({ timeout: 10000 })
  await page.locator('.el-table__row').first().waitFor({ timeout: 10000 })
  const text = await page.locator('.el-table').innerText()
  assert.match(text, /盘点/)
  assert.match(text, /审核/)
}

async function checkStockAnalysis() {
  await page.goto(`${BASE}/stock/statistics`)
  await page.getByRole('heading', { name: '积压商品' }).waitFor({ timeout: 10000 })
  await page.getByRole('heading', { name: '供应商进货排行' }).waitFor({ timeout: 10000 })
}

async function checkCashier() {
  await resetSession()
  await login('shouyin01', '123456')
  await expandMenu()

  assert.equal(await menuCount('库存管理'), 0, '收银员不应看到库存管理')
  assert.equal(await menuCount('采购管理'), 0, '收银员不应看到采购管理')
  assert.equal(await ensureSubmenu('销售管理'), true, '收银员应看到销售管理')
  assert.equal(await menuCount('收银开单'), 1, '收银员应看到收银开单')
  assert.equal(await menuCount('销售统计'), 0, '收银员不应看到销售统计')

  await page.goto(`${BASE}/stock/stocktake`)
  await page.waitForURL('**/dashboard', { timeout: 10000 })

  const stockApi = await page.evaluate(async () => {
    const token = localStorage.getItem('market_token')
    const res = await fetch('/api/stock/statistics', {
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.json()
  })
  assert.equal(stockApi.code, 403, '收银员调用库存接口应 403')

  await page.goto(`${BASE}/sale/checkout`)
  await page.getByText('收银结算').first().waitFor({ timeout: 10000 })
  await page.getByText('农夫山泉 550ml', { exact: true }).first().click()
  const eq = page.getByRole('button', { name: '等于应收', exact: true })
  if (await eq.count()) await eq.click()
  await page.getByRole('button', { name: '提交开单', exact: true }).click()
  await page.getByText('开单成功').waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: '查看销售记录', exact: true }).click()
  await page.waitForURL('**/sale/record', { timeout: 10000 })
  // 销售记录页是懒加载路由，URL 变了不代表表格已挂载
  await page.locator('.el-table__row').first().waitFor({ timeout: 15000 })

  const rows = await page.locator('.el-table__row').allTextContents()
  assert.ok(rows.length > 0, '收银员应能看到自己的销售单')
  assert.ok(rows.every((t) => !t.includes('系统管理员')), '收银员不应看到管理员的单据')
  assert.ok(rows.every((t) => !t.includes('李强')), '收银员不应看到其他收银员的单据')
  assert.ok(rows.some((t) => t.includes('张敏')), '收银员应看到自己的单据')
}

async function checkWarehouse() {
  await resetSession()
  await login('cangku01', '123456')
  await expandMenu()

  assert.equal(await menuCount('销售管理'), 0, '仓管不应看到销售管理')
  assert.equal(await menuCount('采购管理'), 1, '仓管应看到采购管理（只收货）')
  assert.equal(await ensureSubmenu('库存管理'), true, '仓管应看到库存管理')
  assert.equal(await menuCount('库存盘点'), 1, '仓管应看到库存盘点')

  await page.goto(`${BASE}/sale/checkout`)
  await page.waitForURL('**/dashboard', { timeout: 10000 })
}

async function checkAccountant() {
  await resetSession()
  await login('kuaiji01', '123456')
  await expandMenu()

  assert.equal(await ensureSubmenu('销售管理'), true, '会计应看到销售管理')
  assert.equal(await menuCount('销售记录'), 1, '会计应看到销售记录')
  assert.equal(await menuCount('收银开单'), 0, '会计不应看到收银开单')
  assert.equal(await menuCount('采购管理'), 0, '会计不应看到采购管理')
  assert.equal(await ensureSubmenu('库存管理'), true, '会计应看到库存管理')
  assert.equal(await menuCount('库存盘点'), 1, '会计应看到库存盘点')

  await page.goto(`${BASE}/stock/statistics`)
  await page.getByRole('heading', { name: '积压商品' }).waitFor({ timeout: 10000 })
  assert.equal(await page.getByText('供应商进货排行', { exact: true }).count(), 0, '会计不应看到供应商进货排行')
}

/* ---------------- 启动与清理 ---------------- */

async function startEnvironment() {
  console.log(`[E2E] 临时数据库：${TMP_DB}`)

  console.log('[E2E] 构建前端...')
  execSync('npm run build', { cwd: FRONTEND_DIR, stdio: 'inherit' })

  console.log('[E2E] 初始化临时数据库...')
  execSync('node db/init.js', {
    cwd: BACKEND_DIR,
    env: { ...process.env, DB_NAME: TMP_DB },
    stdio: 'inherit',
  })

  console.log('[E2E] 启动后端...')
  backendProc = spawn(process.execPath, ['app.js'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, DB_NAME: TMP_DB, PORT: String(API_PORT), E2E: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  backendProc.stdout.on('data', (d) => process.stdout.write(`[backend] ${d}`))
  backendProc.stderr.on('data', (d) => process.stderr.write(`[backend] ${d}`))
  await waitHttp(`${API}/api/health`)

  console.log('[E2E] 启动前端预览...')
  previewProc = spawn('npm', ['run', 'preview', '--', '--port', String(PREVIEW_PORT)], {
    cwd: FRONTEND_DIR,
    env: { ...process.env, E2E: '1', VITE_API_TARGET: API },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: IS_WIN,
  })
  previewProc.stdout.on('data', (d) => process.stdout.write(`[preview] ${d}`))
  previewProc.stderr.on('data', (d) => process.stderr.write(`[preview] ${d}`))
  await waitHttp(BASE)

  const executablePath = findBrowser()
  browser = await chromium.launch({ executablePath, headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  page = await context.newPage()

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(err.message))
}

async function cleanup() {
  try {
    await browser?.close()
  } catch {
    /* ignore */
  }
  killTree(previewProc)
  killTree(backendProc)
  dropTempDb()
}

async function main() {
  await startEnvironment()

  try {
    await step('管理员登录', () => login('admin', '123456'))
    await step('新增商品 + 期初入库 + 库存校验', createProductWithOpeningStock)
    await step('入库/出库切换 + 列表重载', switchInboundOutbound)
    await step('销售开单 + 退款退货', checkoutAndReturn)
    await step('库存盘点：生成/保存/提交/审核', stocktakeFlow)
    await step('采购：制单/提交/收货/付款', purchaseFlow)
    await step('操作日志记录盘点审核', checkOperationLog)
    await step('积压商品 + 供应商进货排行', checkStockAnalysis)
    await step('收银员权限与本人销售单', checkCashier)
    await step('仓管菜单与销售权限拦截', checkWarehouse)
    await step('会计菜单与成本报表隔离', checkAccountant)
    await step('浏览器无控制台错误', () => {
      assert.deepEqual(consoleErrors, [], `控制台错误：\n${consoleErrors.join('\n')}`)
    })
  } catch (err) {
    mkdirSync(RESULTS_DIR, { recursive: true })
    const shot = path.join(RESULTS_DIR, `e2e-failure-${Date.now()}.png`)
    try {
      await page?.screenshot({ path: shot, fullPage: true })
      console.error(`\n[E2E] 失败截图：${shot}`)
    } catch {
      /* ignore */
    }
    throw err
  } finally {
    const failed = steps.some((s) => !s.ok)
    console.log('\n========== E2E 汇总 ==========')
    for (const s of steps) {
      console.log(`${s.ok ? 'PASS' : 'FAIL'}  ${s.name}${s.error ? `：${s.error}` : ''}`)
    }
    console.log(`共 ${steps.length} 步，失败 ${steps.filter((s) => !s.ok).length} 步`)
    await cleanup()
    if (failed) process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(`\n[E2E] 运行失败：${err.message}`)
  process.exitCode = 1
})
