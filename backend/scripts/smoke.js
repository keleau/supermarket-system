/**
 * 真实数据库冒烟测试：启动服务 → 登录 → 结账 → 退货 → 关键查询
 * 仅用于测试库（CI 临时 MySQL 或本地临时库），不要指向生产/演示数据。
 */
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = Number(process.env.SMOKE_PORT) || 3210;
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
  check(
    login.payload.code === 200 &&
      login.payload.data?.token &&
      Array.isArray(login.payload.data.permissions) &&
      login.payload.data.permissions.includes('*'),
    '管理员登录并返回全部权限',
    login.payload
  );
  const token = login.payload.data.token;

  const overview = await request('/api/dashboard/overview', { token });
  check(
    overview.payload.code === 200 &&
      typeof overview.payload.data.todaySaleAmount === 'number' &&
      typeof overview.payload.data.todayProfitAmount === 'number',
    '管理员仪表盘可见销售与利润',
    overview.payload
  );

  const productBefore = await request('/api/product/1', { token });
  check(
    productBefore.payload.code === 200 && typeof productBefore.payload.data.costPrice === 'number',
    '管理员可见商品成本',
    productBefore.payload
  );
  const stockBeforeInbound = Number(productBefore.payload.data.stockNum);
  const costBeforeInbound = Number(productBefore.payload.data.costPrice);
  check(stockBeforeInbound >= 2, '预置商品库存足够冒烟测试', stockBeforeInbound);

  // 入库 → 加权平均成本 → 销售快照成本
  const inboundQty = 10;
  const inboundPrice = 2;
  const rawCost = (stockBeforeInbound * costBeforeInbound + inboundQty * inboundPrice) /
    (stockBeforeInbound + inboundQty);
  const expectedCost = Math.round((rawCost + Number.EPSILON) * 10000) / 10000;

  const inbound = await request('/api/stock/inbound', {
    method: 'POST',
    token,
    body: { productId: 1, quantity: inboundQty, inboundPrice, supplierId: 1, remark: '冒烟测试补货' },
  });
  check(inbound.payload.code === 200, '入库成功', inbound.payload);

  const productAfterInbound = await request('/api/product/1', { token });
  check(
    Number(productAfterInbound.payload.data.stockNum) === stockBeforeInbound + inboundQty,
    '入库后库存正确增加',
    { before: stockBeforeInbound, after: productAfterInbound.payload.data.stockNum }
  );
  check(
    Number(productAfterInbound.payload.data.costPrice) === expectedCost,
    '入库后成本按移动加权平均更新',
    { expected: expectedCost, actual: productAfterInbound.payload.data.costPrice }
  );

  const inboundLogs = await request('/api/stock/log/list?productId=1&pageNum=1&pageSize=20', {
    token,
  });
  const purchaseInLog = inboundLogs.payload.data?.list?.find(
    (row) => row.remark === '冒烟测试补货'
  );
  check(
    purchaseInLog?.bizType === 1 && purchaseInLog?.bizTypeName === '采购入库',
    '入库流水标记为采购入库',
    inboundLogs.payload
  );

  const stockBeforeSale = stockBeforeInbound + inboundQty;
  const productSnapshot = productAfterInbound.payload.data;

  const badCostUpdate = await request('/api/product', {
    method: 'PUT',
    token,
    body: { ...productSnapshot, costPrice: Number(productSnapshot.costPrice) + 1 },
  });
  check(
    badCostUpdate.payload.code === 400 && /不能手工修改/.test(badCostUpdate.payload.msg || ''),
    '商品编辑禁止手改成本',
    badCostUpdate.payload
  );

  const goodUpdate = await request('/api/product', {
    method: 'PUT',
    token,
    body: productSnapshot,
  });
  check(goodUpdate.payload.code === 200, '商品编辑不修改成本可以正常保存', goodUpdate.payload);

  const productAfterUpdate = await request('/api/product/1', { token });
  check(
    Number(productAfterUpdate.payload.data.costPrice) === expectedCost,
    '正常编辑不会改动加权成本',
    { expected: expectedCost, actual: productAfterUpdate.payload.data.costPrice }
  );

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
    Number(productAfterSale.payload.data.stockNum) === stockBeforeSale - 2,
    '结账后库存正确扣减',
    { before: stockBeforeSale, after: productAfterSale.payload.data.stockNum }
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
  check(
    detailItem && Number(detailItem.costPrice) === expectedCost,
    '销售明细快照加权成本',
    { expected: expectedCost, actual: detailItem?.costPrice }
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
  check(
    typeof statistics.payload.data?.summary?.totalProfit === 'number',
    '管理员可见成本毛利',
    statistics.payload
  );

  const logs = await request('/api/stock/log/list?pageNum=1&pageSize=20', { token });
  const saleOutLog = logs.payload.data?.list?.find(
    (row) => String(row.remark).includes(saleNo) && row.changeType === 2
  );
  check(logs.payload.code === 200 && saleOutLog, '销售生成出库流水', logs.payload);
  check(
    saleOutLog?.bizType === 2 && saleOutLog?.bizTypeName === '销售出库',
    '销售流水标记为销售出库',
    saleOutLog
  );

  const warn = await request('/api/stock/warn/list?warnStatus=2', { token });
  check(
    warn.payload.code === 200 &&
      warn.payload.data.some((row) => Number(row.productId) === 8),
    '缺货预警列表包含预置缺货商品',
    warn.payload
  );

  const stockStats = await request('/api/stock/statistics', { token });
  check(
    stockStats.payload.code === 200 && typeof stockStats.payload.data.totalStockValue === 'number',
    '管理员可见库存总价值',
    stockStats.payload
  );

  const overviewBeforeReturn = await request('/api/dashboard/overview', { token });
  const inboundBeforeReturn = overviewBeforeReturn.payload.data.monthInboundQuantity;

  const returned = await request('/api/sale/record/return', {
    method: 'POST',
    token,
    body: { saleNo },
  });
  check(returned.payload.code === 200, '销售退货', returned.payload);

  const productAfterReturn = await request('/api/product/1', { token });
  check(
    Number(productAfterReturn.payload.data.stockNum) === stockBeforeSale,
    '退货后库存恢复',
    { before: stockBeforeSale, after: productAfterReturn.payload.data.stockNum }
  );
  check(
    Number(productAfterReturn.payload.data.costPrice) === expectedCost,
    '退货不改变加权成本',
    { expected: expectedCost, actual: productAfterReturn.payload.data.costPrice }
  );

  const returnLogs = await request('/api/stock/log/list?productId=1&pageNum=1&pageSize=20', {
    token,
  });
  const saleReturnLog = returnLogs.payload.data?.list?.find(
    (row) => String(row.remark).includes(saleNo) && row.changeType === 1
  );
  check(
    saleReturnLog?.bizType === 3 && saleReturnLog?.bizTypeName === '销售退货',
    '退货流水标记为销售退货',
    returnLogs.payload
  );

  const overviewAfterReturn = await request('/api/dashboard/overview', { token });
  check(
    overviewAfterReturn.payload.data.monthInboundQuantity === inboundBeforeReturn,
    '销售退货不计入本月收货数量',
    { before: inboundBeforeReturn, after: overviewAfterReturn.payload.data.monthInboundQuantity }
  );

  /* ---------- 商品库存只能由单据驱动：新建 + 期初入库 ---------- */
  const newProduct = await request('/api/product', {
    method: 'POST',
    token,
    body: {
      productName: '冒烟期初商品',
      categoryId: 1,
      salePrice: 5,
      costPrice: 2,
      // 故意传库存和状态，验证后端会忽略，统一从 0 开始
      stockNum: 100,
      status: 1,
      warnNum: 1,
    },
  });
  check(newProduct.payload.code === 200 && newProduct.payload.data?.id, '新建商品', newProduct.payload);
  const newProductId = newProduct.payload.data.id;

  const newProductBeforeInbound = await request(`/api/product/${newProductId}`, { token });
  check(
    Number(newProductBeforeInbound.payload.data.stockNum) === 0 &&
      Number(newProductBeforeInbound.payload.data.status) === 0,
    '新建商品库存固定为 0 并自动下架',
    newProductBeforeInbound.payload
  );

  const openingInbound = await request('/api/stock/inbound', {
    method: 'POST',
    token,
    body: { productId: newProductId, quantity: 5, inboundPrice: 3, remark: '期初入库' },
  });
  check(openingInbound.payload.code === 200, '期初入库', openingInbound.payload);

  const newProductAfterInbound = await request(`/api/product/${newProductId}`, { token });
  check(
    Number(newProductAfterInbound.payload.data.stockNum) === 5 &&
      Number(newProductAfterInbound.payload.data.status) === 1 &&
      Number(newProductAfterInbound.payload.data.costPrice) === 3,
    '期初入库后库存、状态、成本正确',
    newProductAfterInbound.payload
  );

  const openingLogs = await request(
    `/api/stock/log/list?productId=${newProductId}&pageNum=1&pageSize=10`,
    { token }
  );
  const openingLog = openingLogs.payload.data?.list?.find((row) => row.changeType === 1);
  check(
    openingLog?.bizType === 6 && openingLog?.bizTypeName === '期初入库',
    '首次入库标记为期初入库',
    openingLogs.payload
  );

  /* ---------- 收银员：成本 / 毛利字段隔离 + 只能看自己的单据 ---------- */
  const operatorLogin = await request('/api/user/login', {
    method: 'POST',
    body: { username: 'shouyin01', password: '123456' },
  });
  check(
    operatorLogin.payload.code === 200 &&
      operatorLogin.payload.data?.token &&
      Array.isArray(operatorLogin.payload.data.permissions) &&
      operatorLogin.payload.data.permissions.includes('sale:create') &&
      !operatorLogin.payload.data.permissions.includes('stock:in'),
    '收银员登录并返回岗位权限',
    operatorLogin.payload
  );
  const operatorToken = operatorLogin.payload.data.token;

  const operatorProduct = await request('/api/product/1', { token: operatorToken });
  check(
    operatorProduct.payload.code === 200 &&
      operatorProduct.payload.data.costPrice === undefined &&
      operatorProduct.payload.data.salePrice !== undefined,
    '收银员看不到商品成本',
    operatorProduct.payload
  );

  const operatorProducts = await request('/api/product/list?pageNum=1&pageSize=100', {
    token: operatorToken,
  });
  check(
    operatorProducts.payload.code === 200 &&
      operatorProducts.payload.data.list.every((row) => row.costPrice === undefined),
    '收银员商品列表不含成本',
    operatorProducts.payload
  );

  const operatorAdminRecord = await request(`/api/sale/record/${saleId}`, {
    token: operatorToken,
  });
  check(operatorAdminRecord.payload.code === 403, '收银员不能查看他人销售单', operatorAdminRecord.payload);

  const cashierSale = await request('/api/sale/record', {
    method: 'POST',
    token: operatorToken,
    body: { payType: 1, items: [{ productId: 1, quantity: 1 }] },
  });
  check(
    cashierSale.payload.code === 200 && cashierSale.payload.data?.saleNo,
    '收银员可以销售开单',
    cashierSale.payload
  );
  const cashierSaleId = cashierSale.payload.data.id;
  const cashierSaleNo = cashierSale.payload.data.saleNo;
  check(cashierSale.payload.data.totalAmount === 2, '收银员开单金额正确', cashierSale.payload.data);

  const operatorOwnRecord = await request(`/api/sale/record/${cashierSaleId}`, {
    token: operatorToken,
  });
  check(
    operatorOwnRecord.payload.code === 200 &&
      operatorOwnRecord.payload.data.items.every((item) => item.costPrice === undefined) &&
      operatorOwnRecord.payload.data.items.some((item) => item.salePrice !== undefined),
    '收银员能看到自己的销售单且看不到成本',
    operatorOwnRecord.payload
  );

  const operatorRecordList = await request('/api/sale/record/list?pageNum=1&pageSize=100', {
    token: operatorToken,
  });
  check(
    operatorRecordList.payload.code === 200 &&
      operatorRecordList.payload.data.list.every((row) => row.operator === '张敏') &&
      operatorRecordList.payload.data.list.every((row) => row.saleNo !== saleNo) &&
      operatorRecordList.payload.data.list.some((row) => row.saleNo === cashierSaleNo),
    '收银员只能查看自己的销售单',
    operatorRecordList.payload
  );

  const operatorOverview = await request('/api/dashboard/overview', { token: operatorToken });
  check(
    operatorOverview.payload.code === 200 &&
      operatorOverview.payload.data.todayProfitAmount === undefined &&
      operatorOverview.payload.data.monthProfitAmount === undefined &&
      operatorOverview.payload.data.monthTrend === undefined,
    '收银员看不到利润指标',
    operatorOverview.payload
  );

  const operatorStats = await request('/api/sale/statistics', { token: operatorToken });
  check(operatorStats.payload.code === 403, '收银员不能访问销售统计', operatorStats.payload);

  const operatorStockStats = await request('/api/stock/statistics', { token: operatorToken });
  check(operatorStockStats.payload.code === 403, '收银员不能访问库存统计', operatorStockStats.payload);

  const operatorLogs = await request('/api/stock/log/list?pageNum=1&pageSize=10', {
    token: operatorToken,
  });
  check(operatorLogs.payload.code === 403, '收银员不能访问库存流水', operatorLogs.payload);

  /* ---------- 仓管：可以出入库，不能销售 ---------- */
  const warehouseLogin = await request('/api/user/login', {
    method: 'POST',
    body: { username: 'cangku01', password: '123456' },
  });
  check(
    warehouseLogin.payload.code === 200 && warehouseLogin.payload.data?.token,
    '仓管登录',
    warehouseLogin.payload
  );
  const warehouseToken = warehouseLogin.payload.data.token;

  const warehouseProduct = await request('/api/product/1', { token: warehouseToken });
  check(
    warehouseProduct.payload.code === 200 &&
      warehouseProduct.payload.data.costPrice === undefined,
    '仓管看不到商品成本',
    warehouseProduct.payload
  );

  const warehouseLogs = await request('/api/stock/log/list?pageNum=1&pageSize=100', {
    token: warehouseToken,
  });
  check(
    warehouseLogs.payload.code === 200 &&
      warehouseLogs.payload.data.list.every((row) => row.inboundPrice === undefined),
    '仓管看不到入库单价',
    warehouseLogs.payload
  );
  check(
    warehouseLogs.payload.data.list.some(
      (row) => row.changeType === 2 && row.bizType === 7 && row.bizTypeName === '手工调整'
    ),
    '出库流水可区分手工调整',
    warehouseLogs.payload
  );

  const warehouseStockStats = await request('/api/stock/statistics', { token: warehouseToken });
  check(
    warehouseStockStats.payload.code === 200 &&
      warehouseStockStats.payload.data.totalStockValue === undefined,
    '仓管看不到库存总价值',
    warehouseStockStats.payload
  );

  const warehouseSale = await request('/api/sale/record', {
    method: 'POST',
    token: warehouseToken,
    body: {},
  });
  check(warehouseSale.payload.code === 403, '仓管不能销售开单', warehouseSale.payload);

  const warehouseSaleList = await request('/api/sale/record/list?pageNum=1&pageSize=10', {
    token: warehouseToken,
  });
  check(warehouseSaleList.payload.code === 403, '仓管不能查看销售单', warehouseSaleList.payload);

  const warehouseInbound = await request('/api/stock/inbound', {
    method: 'POST',
    token: warehouseToken,
    body: {},
  });
  check(
    warehouseInbound.payload.code === 400,
    '仓管有入库权限（业务校验拦截空参数）',
    warehouseInbound.payload
  );

  const warehouseOutbound = await request('/api/stock/outbound', {
    method: 'POST',
    token: warehouseToken,
    body: {},
  });
  check(
    warehouseOutbound.payload.code === 400,
    '仓管有出库权限（业务校验拦截空参数）',
    warehouseOutbound.payload
  );

  /* ---------- 会计：可以看全部销售单，不能开单 ---------- */
  const accountantLogin = await request('/api/user/login', {
    method: 'POST',
    body: { username: 'kuaiji01', password: '123456' },
  });
  check(
    accountantLogin.payload.code === 200 && accountantLogin.payload.data?.token,
    '会计登录',
    accountantLogin.payload
  );
  const accountantToken = accountantLogin.payload.data.token;

  const accountantRecords = await request('/api/sale/record/list?pageNum=1&pageSize=100', {
    token: accountantToken,
  });
  check(
    accountantRecords.payload.code === 200 &&
      accountantRecords.payload.data.list.some((row) => row.saleNo === saleNo) &&
      accountantRecords.payload.data.list.some((row) => row.saleNo === cashierSaleNo),
    '会计可以查看全部销售单',
    accountantRecords.payload
  );

  const accountantRecord = await request(`/api/sale/record/${saleId}`, {
    token: accountantToken,
  });
  check(
    accountantRecord.payload.code === 200 &&
      accountantRecord.payload.data.items.every((item) => item.costPrice === undefined),
    '会计查看销售单时看不到成本',
    accountantRecord.payload
  );

  const accountantSale = await request('/api/sale/record', {
    method: 'POST',
    token: accountantToken,
    body: {},
  });
  check(accountantSale.payload.code === 403, '会计不能销售开单', accountantSale.payload);

  const accountantStats = await request('/api/sale/statistics', { token: accountantToken });
  check(accountantStats.payload.code === 403, '会计不能访问销售统计', accountantStats.payload);

  const accountantStockStats = await request('/api/stock/statistics', {
    token: accountantToken,
  });
  check(
    accountantStockStats.payload.code === 200 &&
      accountantStockStats.payload.data.totalStockValue === undefined,
    '会计看不到库存总价值',
    accountantStockStats.payload
  );

  /* ---------- 采购：采购制单 → 仓管收货 → 管理员付款 ---------- */
  const purchaserLogin = await request('/api/user/login', {
    method: 'POST',
    body: { username: 'caigou01', password: '123456' },
  });
  check(
    purchaserLogin.payload.code === 200 &&
      purchaserLogin.payload.data?.token &&
      purchaserLogin.payload.data.permissions.includes('purchase:create') &&
      !purchaserLogin.payload.data.permissions.includes('purchase:receive') &&
      !purchaserLogin.payload.data.permissions.includes('stock:in'),
    '采购登录并返回制单权限',
    purchaserLogin.payload
  );
  const purchaserToken = purchaserLogin.payload.data.token;

  const purchaseItems = [
    { productId: 1, quantity: 4, price: 2.5 },
    { productId: 2, quantity: 3, price: 3 },
  ];
  const createPurchase = await request('/api/purchase', {
    method: 'POST',
    token: purchaserToken,
    body: { supplierId: 1, remark: '冒烟采购', items: purchaseItems },
  });
  check(
    createPurchase.payload.code === 200 &&
      createPurchase.payload.data?.id &&
      /^CG\d{8}-\d{3}$/.test(createPurchase.payload.data.orderNo || ''),
    '采购创建草稿单',
    createPurchase.payload
  );
  const purchaseId = createPurchase.payload.data.id;
  const purchaseNo = createPurchase.payload.data.orderNo;
  const purchaseTotal = 4 * 2.5 + 3 * 3;

  const purchaseDetailBefore = await request(`/api/purchase/${purchaseId}`, {
    token: purchaserToken,
  });
  check(
    purchaseDetailBefore.payload.code === 200 &&
      purchaseDetailBefore.payload.data.status === 0 &&
      purchaseDetailBefore.payload.data.items.length === 2 &&
      Number(purchaseDetailBefore.payload.data.totalAmount) === purchaseTotal,
    '采购草稿金额与明细正确',
    purchaseDetailBefore.payload
  );

  const updatePurchase = await request(`/api/purchase/${purchaseId}`, {
    method: 'PUT',
    token: purchaserToken,
    body: { supplierId: 1, remark: '冒烟采购修改', items: purchaseItems },
  });
  check(updatePurchase.payload.code === 200, '采购可编辑草稿', updatePurchase.payload);

  const purchaserReceive = await request(`/api/purchase/${purchaseId}/receive`, {
    method: 'POST',
    token: purchaserToken,
  });
  check(purchaserReceive.payload.code === 403, '采购不能自己确认收货', purchaserReceive.payload);

  const purchaserPay = await request(`/api/purchase/${purchaseId}/pay`, {
    method: 'POST',
    token: purchaserToken,
    body: { amount: 1 },
  });
  check(purchaserPay.payload.code === 403, '采购不能登记付款', purchaserPay.payload);

  const submitPurchase = await request(`/api/purchase/${purchaseId}/submit`, {
    method: 'POST',
    token: purchaserToken,
  });
  check(submitPurchase.payload.code === 200, '采购提交采购单', submitPurchase.payload);

  const editAfterSubmit = await request(`/api/purchase/${purchaseId}`, {
    method: 'PUT',
    token: purchaserToken,
    body: { supplierId: 1, remark: '提交后修改', items: purchaseItems },
  });
  check(editAfterSubmit.payload.code === 400, '采购单提交后不能再编辑', editAfterSubmit.payload);

  const purchaseProduct1Before = await request('/api/product/1', { token });
  const purchaseProduct2Before = await request('/api/product/2', { token });
  const p1StockBefore = Number(purchaseProduct1Before.payload.data.stockNum);
  const p1CostBefore = Number(purchaseProduct1Before.payload.data.costPrice);
  const p2StockBefore = Number(purchaseProduct2Before.payload.data.stockNum);
  const p1ExpectedCost = Math.round(
    (((p1StockBefore * p1CostBefore + 4 * 2.5) / (p1StockBefore + 4)) + Number.EPSILON) * 10000
  ) / 10000;

  const receivePurchase = await request(`/api/purchase/${purchaseId}/receive`, {
    method: 'POST',
    token: warehouseToken,
  });
  check(receivePurchase.payload.code === 200, '仓管确认采购收货', receivePurchase.payload);

  const doubleReceive = await request(`/api/purchase/${purchaseId}/receive`, {
    method: 'POST',
    token: warehouseToken,
  });
  check(doubleReceive.payload.code === 400, '采购单不能重复收货', doubleReceive.payload);

  const purchaseProduct1After = await request('/api/product/1', { token });
  const purchaseProduct2After = await request('/api/product/2', { token });
  check(
    Number(purchaseProduct1After.payload.data.stockNum) === p1StockBefore + 4 &&
      Number(purchaseProduct2After.payload.data.stockNum) === p2StockBefore + 3,
    '采购收货后库存正确增加',
    {
      product1: { before: p1StockBefore, after: purchaseProduct1After.payload.data.stockNum },
      product2: { before: p2StockBefore, after: purchaseProduct2After.payload.data.stockNum },
    }
  );
  check(
    Number(purchaseProduct1After.payload.data.costPrice) === p1ExpectedCost,
    '采购收货按移动加权平均更新成本',
    { expected: p1ExpectedCost, actual: purchaseProduct1After.payload.data.costPrice }
  );

  const purchaseLogs = await request('/api/stock/log/list?pageNum=1&pageSize=100', { token });
  const purchaseInboundLogs = purchaseLogs.payload.data.list.filter(
    (row) => row.bizType === 1 && String(row.remark).includes(purchaseNo)
  );
  check(
    purchaseInboundLogs.length === 2 &&
      purchaseInboundLogs.every((row) => row.bizTypeName === '采购入库'),
    '采购收货写入采购入库流水',
    purchaseLogs.payload
  );

  const purchaseDetailAfterReceive = await request(`/api/purchase/${purchaseId}`, { token });
  check(
    purchaseDetailAfterReceive.payload.code === 200 &&
      purchaseDetailAfterReceive.payload.data.status === 2 &&
      purchaseDetailAfterReceive.payload.data.receiver === '王仓管' &&
      Number(purchaseDetailAfterReceive.payload.data.payableAmount) === purchaseTotal &&
      Number(purchaseDetailAfterReceive.payload.data.paidAmount) === 0 &&
      Number(purchaseDetailAfterReceive.payload.data.items[0].price) === 2.5,
    '采购收货后状态与应付正确',
    purchaseDetailAfterReceive.payload
  );

  const warehousePurchaseDetail = await request(`/api/purchase/${purchaseId}`, {
    token: warehouseToken,
  });
  check(
    warehousePurchaseDetail.payload.code === 200 &&
      warehousePurchaseDetail.payload.data.totalAmount === undefined &&
      warehousePurchaseDetail.payload.data.payableAmount === undefined &&
      warehousePurchaseDetail.payload.data.payStatus === undefined &&
      warehousePurchaseDetail.payload.data.items.every(
        (item) => item.price === undefined && item.amount === undefined && item.quantity > 0
      ),
    '仓管看不到采购金额，只能看到数量',
    warehousePurchaseDetail.payload
  );

  const partialPay = await request(`/api/purchase/${purchaseId}/pay`, {
    method: 'POST',
    token,
    body: { amount: 5 },
  });
  check(
    partialPay.payload.code === 200 &&
      partialPay.payload.data.paidAmount === 5 &&
      partialPay.payload.data.unpaidAmount === purchaseTotal - 5,
    '管理员登记部分付款',
    partialPay.payload
  );

  const overPay = await request(`/api/purchase/${purchaseId}/pay`, {
    method: 'POST',
    token,
    body: { amount: purchaseTotal },
  });
  check(overPay.payload.code === 400, '付款金额不能超过未付金额', overPay.payload);

  const restPay = await request(`/api/purchase/${purchaseId}/pay`, {
    method: 'POST',
    token,
    body: { amount: purchaseTotal - 5 },
  });
  check(restPay.payload.code === 200 && restPay.payload.data.unpaidAmount === 0, '付清采购单', restPay.payload);

  const payAgain = await request(`/api/purchase/${purchaseId}/pay`, {
    method: 'POST',
    token,
    body: { amount: 1 },
  });
  check(payAgain.payload.code === 400, '已付清的采购单不能重复付款', payAgain.payload);

  const purchaseDetailPaid = await request(`/api/purchase/${purchaseId}`, { token });
  check(
    purchaseDetailPaid.payload.data.payStatus === 2 &&
      Number(purchaseDetailPaid.payload.data.paidAmount) === purchaseTotal,
    '采购单付款状态已付清',
    purchaseDetailPaid.payload
  );

  const purchaseOpLogs = await request(
    '/api/operation-log/list?pageNum=1&pageSize=100&module=purchase&action=receive',
    { token }
  );
  check(
    purchaseOpLogs.payload.code === 200 &&
      purchaseOpLogs.payload.data.list.some((row) => row.bizNo === purchaseNo),
    '操作日志记录采购收货',
    purchaseOpLogs.payload
  );

  const accountantPurchase = await request('/api/purchase/list?pageNum=1&pageSize=10', {
    token: accountantToken,
  });
  const cashierPurchase = await request('/api/purchase/list?pageNum=1&pageSize=10', {
    token: operatorToken,
  });
  check(
    accountantPurchase.payload.code === 403 && cashierPurchase.payload.code === 403,
    '会计和收银员不能访问采购模块',
    { accountant: accountantPurchase.payload, cashier: cashierPurchase.payload }
  );

  const cancelDraft = await request('/api/purchase', {
    method: 'POST',
    token: purchaserToken,
    body: { supplierId: 2, items: [{ productId: 3, quantity: 1, price: 1 }] },
  });
  const cancelId = cancelDraft.payload.data.id;
  const submitCancel = await request(`/api/purchase/${cancelId}/submit`, {
    method: 'POST',
    token: purchaserToken,
  });
  check(
    cancelDraft.payload.code === 200 && submitCancel.payload.code === 200,
    '创建并提交待取消采购单',
    { create: cancelDraft.payload, submit: submitCancel.payload }
  );
  const cancelPurchase = await request(`/api/purchase/${cancelId}/cancel`, {
    method: 'POST',
    token: purchaserToken,
  });
  check(cancelPurchase.payload.code === 200, '采购可取消已提交单据', cancelPurchase.payload);
  const receiveCancelled = await request(`/api/purchase/${cancelId}/receive`, {
    method: 'POST',
    token: warehouseToken,
  });
  check(receiveCancelled.payload.code === 400, '已取消采购单不能收货', receiveCancelled.payload);

  /* ---------- 盘点闭环：仓管制单/提交，管理员审核 ---------- */
  const createTake = await request('/api/stocktake', {
    method: 'POST',
    token: warehouseToken,
    body: { categoryId: 1, remark: '冒烟盘点' },
  });
  check(
    createTake.payload.code === 200 && createTake.payload.data?.id,
    '仓管生成盘点任务',
    createTake.payload
  );
  const takeId = createTake.payload.data.id;
  const takeNo = createTake.payload.data.takeNo;

  const takeDetailBefore = await request(`/api/stocktake/${takeId}`, { token: warehouseToken });
  check(
    takeDetailBefore.payload.code === 200 &&
      takeDetailBefore.payload.data.status === 0 &&
      takeDetailBefore.payload.data.items.length > 1 &&
      takeDetailBefore.payload.data.items.every(
        (it) => it.costPrice === undefined && it.diffAmount === undefined
      ) &&
      takeDetailBefore.payload.data.totalGainAmount === undefined,
    '仓管看盘点单不含成本金额',
    takeDetailBefore.payload
  );

  const takeItems = takeDetailBefore.payload.data.items;
  const gainItem = takeItems[0];
  const lossItem = takeItems[1];
  const gainBookQty = Number(gainItem.bookQty);
  const lossBookQty = Number(lossItem.bookQty);
  check(lossBookQty >= 1, '盘点样例商品库存足够', { lossBookQty });

  const saveTake = await request(`/api/stocktake/${takeId}/items`, {
    method: 'PUT',
    token: warehouseToken,
    body: {
      items: [
        { id: gainItem.id, actualQty: gainBookQty + 2, reason: '赠品' },
        { id: lossItem.id, actualQty: lossBookQty - 1, reason: '破损' },
      ],
    },
  });
  check(saveTake.payload.code === 200, '仓管保存实盘数量', saveTake.payload);

  const submitTake = await request(`/api/stocktake/${takeId}/submit`, {
    method: 'POST',
    token: warehouseToken,
  });
  check(submitTake.payload.code === 200, '仓管提交盘点单', submitTake.payload);

  const warehouseAudit = await request(`/api/stocktake/${takeId}/audit`, {
    method: 'POST',
    token: warehouseToken,
  });
  check(warehouseAudit.payload.code === 403, '仓管不能审核盘点', warehouseAudit.payload);

  const adminAudit = await request(`/api/stocktake/${takeId}/audit`, {
    method: 'POST',
    token,
  });
  check(adminAudit.payload.code === 200, '管理员审核盘点', adminAudit.payload);

  const takeDetailAfter = await request(`/api/stocktake/${takeId}`, { token });
  check(
    takeDetailAfter.payload.code === 200 &&
      takeDetailAfter.payload.data.status === 2 &&
      Number(takeDetailAfter.payload.data.totalGainQty) === 2 &&
      Number(takeDetailAfter.payload.data.totalLossQty) === 1 &&
      Number(takeDetailAfter.payload.data.totalGainAmount) > 0 &&
      Number(takeDetailAfter.payload.data.totalLossAmount) > 0,
    '盘点审核后汇总正确',
    takeDetailAfter.payload
  );

  const gainProductAfter = await request(`/api/product/${gainItem.productId}`, { token });
  const lossProductAfter = await request(`/api/product/${lossItem.productId}`, { token });
  check(
    Number(gainProductAfter.payload.data.stockNum) === gainBookQty + 2,
    '盘盈商品库存增加',
    { before: gainBookQty, after: gainProductAfter.payload.data.stockNum }
  );
  check(
    Number(lossProductAfter.payload.data.stockNum) === lossBookQty - 1,
    '盘亏商品库存减少',
    { before: lossBookQty, after: lossProductAfter.payload.data.stockNum }
  );

  const takeLogs = await request('/api/stock/log/list?pageNum=1&pageSize=100', { token });
  const takeGainLog = takeLogs.payload.data.list.find(
    (row) => String(row.remark).includes(takeNo) && row.bizType === 4
  );
  const takeLossLog = takeLogs.payload.data.list.find(
    (row) => String(row.remark).includes(takeNo) && row.bizType === 5
  );
  check(
    takeGainLog?.bizTypeName === '盘点盘盈' && takeLossLog?.bizTypeName === '盘点盘亏',
    '盘点审核写入盘盈/盘亏流水',
    takeLogs.payload
  );

  const doubleAudit = await request(`/api/stocktake/${takeId}/audit`, {
    method: 'POST',
    token,
  });
  check(doubleAudit.payload.code === 400, '盘点单不能重复审核', doubleAudit.payload);

  const accountantTakeList = await request('/api/stocktake/list?pageNum=1&pageSize=10', {
    token: accountantToken,
  });
  check(
    accountantTakeList.payload.code === 200 &&
      accountantTakeList.payload.data.list.some(
        (row) => row.takeNo === takeNo && row.totalGainAmount === undefined
      ),
    '会计可看盘点但看不到盈亏金额',
    accountantTakeList.payload
  );

  const cashierTakeList = await request('/api/stocktake/list?pageNum=1&pageSize=10', {
    token: operatorToken,
  });
  check(cashierTakeList.payload.code === 403, '收银员不能访问盘点', cashierTakeList.payload);

  /* ---------- 操作日志 ---------- */
  const opLogs = await request(
    '/api/operation-log/list?pageNum=1&pageSize=100&module=stocktake&action=audit',
    { token }
  );
  check(
    opLogs.payload.code === 200 && opLogs.payload.data.list.some((row) => row.bizNo === takeNo),
    '操作日志记录盘点审核',
    opLogs.payload
  );

  const inboundOps = await request(
    '/api/operation-log/list?pageNum=1&pageSize=100&module=stock&action=inbound',
    { token }
  );
  check(
    inboundOps.payload.code === 200 && inboundOps.payload.data.list.length > 0,
    '操作日志记录入库',
    inboundOps.payload
  );

  const cashierOpLogs = await request('/api/operation-log/list?pageNum=1&pageSize=10', {
    token: operatorToken,
  });
  check(cashierOpLogs.payload.code === 403, '收银员不能访问操作日志', cashierOpLogs.payload);

  /* ---------- 积压商品 / 供应商进货排行 ---------- */
  const slow = await request('/api/stock/slow-moving?days=30&limit=10', {
    token: warehouseToken,
  });
  check(
    slow.payload.code === 200 && Array.isArray(slow.payload.data),
    '仓管可查积压商品',
    slow.payload
  );

  const supplierRank = await request('/api/dashboard/supplier-ranking?days=30&limit=10', {
    token,
  });
  check(
    supplierRank.payload.code === 200 &&
      supplierRank.payload.data.some(
        (row) => row.supplierName === '农夫山泉股份有限公司' && Number(row.amount) > 0
      ),
    '管理员可查供应商进货排行',
    supplierRank.payload
  );

  const supplierRankCashier = await request('/api/dashboard/supplier-ranking', {
    token: operatorToken,
  });
  check(supplierRankCashier.payload.code === 403, '收银员不能查供应商进货排行', supplierRankCashier.payload);

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
