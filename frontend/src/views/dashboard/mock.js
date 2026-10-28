/**
 * 运营总览 · 临时演示数据
 * 【临时】后端统计接口未就绪前用于页面效果演示；
 * 后端完成后改为调用 src/api/modules/dashboard.js 的接口，删除本文件。
 */

/** 顶部核心指标（对应 GET /api/dashboard/overview） */
export const overview = {
  // 今日销售额
  todaySaleAmount: 8642.5,
  todayCompareRate: 12.6, // 较昨日，正增负减（%）
  todayTrend: [420, 360, 300, 480, 620, 760, 690, 820, 960, 1180, 1040, 920, 780, 640, 520, 412.5],

  // 今日利润（负环比演示"较昨日下跌"红色箭头）
  todayProfitAmount: 1420.6,
  todayProfitRate: -3.8,
  todayProfitTrend: [86, 72, 60, 95, 128, 152, 138, 166, 190, 224, 208, 186, 158, 132, 108, 89.6],

  // 本月销售额
  monthSaleAmount: 268430.6,
  monthSaleRate: 9.4, // 较上月（%）
  monthSaleTrend: [6820, 7240, 6980, 7560, 7380, 8120, 7840, 8460, 8920, 8580, 9240, 9480, 9060, 9320, 9680, 9640.6],

  // 本月利润
  monthProfitAmount: 38650.8,
  monthProfitRate: 8.2, // 较上月（%）
  monthTrend: [1820, 2140, 1960, 2480, 2320, 2760, 2540, 2980, 3120, 2860, 3340, 3560, 3180, 3420, 3680, 3490.8],

  // 右侧紧凑小指标
  monthInboundQuantity: 12860, // 本月收货总数量
  inboundCompareRate: -4.2, // 负值演示"环比下跌"红色向下箭头状态
  productKindCount: 1268, // 商品总种类（SKU）
  warnProductCount: 23, // 库存预警商品数量
  pendingStockCount: 47, // 待补货商品数量
}

/** 近 7 日销售金额趋势（面积图） */
export const saleTrend7 = [
  { date: '10-05', amount: 6240 },
  { date: '10-06', amount: 7180 },
  { date: '10-07', amount: 6890 },
  { date: '10-08', amount: 8420 },
  { date: '10-09', amount: 7960 },
  { date: '10-10', amount: 9340 },
  { date: '10-11', amount: 8642.5 },
]

/** 库存余量 TOP5（柱状图；五项合计精确为 12,680 件，与卡片摘要行口径一致） */
export const stockTop5 = [
  { productName: '农夫山泉 550ml', stockNum: 3860 },
  { productName: '康师傅红烧牛肉面', stockNum: 2740 },
  { productName: '伊利纯牛奶 250ml', stockNum: 2380 },
  { productName: '双汇王中王火腿肠', stockNum: 1960 },
  { productName: '可口可乐 330ml', stockNum: 1740 },
]

/** 各分类库存占比（环形图） */
export const categoryStock = [
  { categoryName: '饮料乳品', stockNum: 8620 },
  { categoryName: '休闲零食', stockNum: 6240 },
  { categoryName: '粮油调味', stockNum: 4380 },
  { categoryName: '日用百货', stockNum: 3160 },
  { categoryName: '生鲜果蔬', stockNum: 2480 },
]

/** 热销商品 TOP5（横向条形图，按售出数量统计；数量序与金额序刻意不同，演示口径差异） */
export const hotProducts5 = [
  { productName: '农夫山泉 550ml', saleAmount: 4280, saleQuantity: 960 },
  { productName: '伊利纯牛奶 250ml', saleAmount: 3860, saleQuantity: 720 },
  { productName: '康师傅红烧牛肉面', saleAmount: 2980, saleQuantity: 690 },
  { productName: '可口可乐 330ml', saleAmount: 3420, saleQuantity: 640 },
  { productName: '双汇王中王火腿肠', saleAmount: 2460, saleQuantity: 470 },
]
