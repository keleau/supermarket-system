/**
 * 真实数据库冒烟测试：启动服务 → 登录 → 结账 → 退货 → 关键查询
 * 仅用于测试库（CI 临时 MySQL 或本地临时库），不要指向生产/演示数据。
 */
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = Number(process.env.SMOKE_PORT) || 3100;
const BASE = `http://127.0.0.1:${PORT}`;

let child = null;
let childOutput = '';

function check(condition, message, detail) {
  if (!condition) {
    throw new Error(`${message}${detail === undefined ? '' : ` -> ${JSON.stringify(detail)}`}`);
  }
  console.log(`PASS ${message}`);
}

async function request(urlPath, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await res.json();
  return { status: res.status, payload };
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`后端进程提前退出（code=${child.exitCode}）\n${childOutput}`);
    }
    try {
      const res = await fetch(`${BASE}/api/health`);
      const payload = await res.json();
      if (payload.code === 200) return payload;
    } catch {
      /* 服务尚未就绪 */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`等待后端启动超时\n${childOutput}`);
}

async function main() {
  child = spawn(process.execPath, ['app.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (data) => {
    childOutput += data.toString();
    process.stdout.write(`[app] ${data}`);
  });
  child.stderr.on('data', (data) => {
    childOutput += data.toString();
    process.stderr.write(`[app] ${data}`);
  });

  const health = await waitForServer();
  check(health.data && health.data.database === 'connected', '健康检查连接数据库', health);

  const login = await request('/api/user/login', {
    method: 'POST',
    body: { username: 'admin', password: '123456' },
  });
  check(login.payload.code === 200 && login.payload.data?.token, '管理员登录', login.payload);
  const token = login.payload.data.token;

  const overview = await request('/api/dashboard/overview', { token });
  check(
    overview.payload.code === 200 && typeof overview.payload.data.todaySaleAmount === 'number',
    '仪表盘查询',
    overview.payload
  );

  const productBefore = await request('/api/product/1', { token });
  check(productBefore.payload.code === 200, '商品详情查询', productBefore.payload);
  const stockBefore = Number(productBefore.payload.data.stockNum);
  check(stockBefore >= 2, '预置商品库存足够冒烟测试', stockBefore);

  const sale = await request('/api/sale/record', {
    method: 'POST',
    token,
    body: { payType: 1, items: [{ productId: 1, quantity: 2 }] },
  });
  check(sale.payload.code === 200 && sale.payload.data?.saleNo, '销售结账', sale.payload);
  const { id: saleId, saleNo } = sale.payload.data;
  check(sale.payload.data.totalAmount === 4, '销售金额按商品售价计算', sale.payload.data);

  const productAfterSale = await request('/api/product/1', { token });
  check(
    Number(productAfterSale.payload.data.stockNum) === stockBefore - 2,
    '结账后库存正确扣减',
    { before: stockBefore, after: productAfterSale.payload.data.stockNum }
  );

  const recordList = await request('/api/sale/record/list?pageNum=1&pageSize=10', { token });
  check(
    recordList.payload.code === 200 &&
      recordList.payload.data.list.some((row) => row.saleNo === saleNo),
    '销售记录列表包含新单据',
    recordList.payload
  );

  const recordDetail = await request(`/api/sale/record/${saleId}`, { token });
  const detailItem = recordDetail.payload.data?.items?.find((row) => Number(row.productId) === 1);
  check(
    recordDetail.payload.code === 200 && detailItem && Number(detailItem.quantity) === 2,
    '销售详情包含明细',
    recordDetail.payload
  );

  const statistics = await request('/api/sale/statistics', { token });
  const productStat = statistics.payload.data?.productStats?.find(
    (row) => Number(row.productId) === 1
  );
  check(
    statistics.payload.code === 200 && productStat && Number(productStat.salePrice) === 2,
    '销售统计按售价聚合',
    statistics.payload
  );

  const logs = await request('/api/stock/log/list?pageNum=1&pageSize=20', { token });
  check(
    logs.payload.code === 200 &&
      logs.payload.data.list.some((row) => String(row.remark).includes(saleNo)),
    '销售生成出库流水',
    logs.payload
  );

  const warn = await request('/api/stock/warn/list?warnStatus=2', { token });
  check(
    warn.payload.code === 200 &&
      warn.payload.data.some((row) => Number(row.productId) === 8),
    '缺货预警列表包含预置缺货商品',
    warn.payload
  );

  const returned = await request('/api/sale/record/return', {
    method: 'POST',
    token,
    body: { saleNo },
  });
  check(returned.payload.code === 200, '销售退货', returned.payload);

  const productAfterReturn = await request('/api/product/1', { token });
  check(
    Number(productAfterReturn.payload.data.stockNum) === stockBefore,
    '退货后库存恢复',
    { before: stockBefore, after: productAfterReturn.payload.data.stockNum }
  );

  const badDate = await request('/api/sale/statistics?startTime=abc', { token });
  check(badDate.payload.code === 400, '非法日期被拒绝', badDate.payload);

  console.log('\nSMOKE ALL PASS');
}

main()
  .then(() => {
    if (child) child.kill('SIGTERM');
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\nSMOKE FAILED: ${err.message}`);
    if (child) child.kill('SIGTERM');
    process.exit(1);
  });
