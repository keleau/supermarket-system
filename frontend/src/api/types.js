/**
 * 接口契约文档（JSDoc 形式，无运行时代码，仅供前后端对接参考）
 * 后端：Express + MySQL，统一响应体 { code, msg, data }，HTTP 状态码恒为 200。
 *
 * 【权限模型】role 与 position 由后端从同一份数据推导，用途严格区分：
 * - role     'admin' | 'operator'  → 仅用于权限判断（路由守卫、按钮显隐）
 * - position 中文职位             → 仅用于界面展示
 *
 * @typedef {Object} ApiResponse      统一响应体
 * @property {number} code            200 成功；400 业务/参数错误；401 登录失效；403 无权限；404 接口不存在；500 服务异常
 * @property {string} msg             提示信息（失败时前端直接弹窗展示）
 * @property {any} data               业务数据，失败时为 null
 *
 * @typedef {Object} PageQuery        分页查询入参（所有分页接口统一）
 * @property {number} pageNum         当前页码，从 1 开始
 * @property {number} pageSize        每页条数，1 ~ 200
 *
 * @typedef {Object} PageResult       分页返回结构（pageNum / pageSize 在 data 内部）
 * @property {Array} list             当前页数据
 * @property {number} total           总条数
 * @property {number} pageNum
 * @property {number} pageSize
 *
 * @typedef {Object} LoginResult      POST /api/user/login 返回 data
 * @property {string} token           访问令牌（有效期 24 小时）
 * @property {string} role            'admin' | 'operator'
 * @property {string} position        中文职位
 * @property {string} username
 * @property {string} realName
 * @property {string} avatar
 * @property {string[]} permissions   岗位权限码数组，'*' 表示全部权限
 *
 * @typedef {Object} UserInfo         GET /api/user/info 返回 data
 * @property {number} id
 * @property {string} username
 * @property {string} realName
 * @property {string} role
 * @property {string} position
 * @property {string[]} permissions   岗位权限码数组，'*' 表示全部权限
 * @property {string} avatar
 * @property {string} phone
 * @property {string} [gender]
 * @property {string} [birthday]
 * @property {string} [idCard]
 * @property {string} [address]
 * @property {string} [remark]
 *
 * @typedef {Object} ProductVO        商品信息
 * @property {number} id
 * @property {string} productCode     商品编码（条码）
 * @property {string} productName     商品名称
 * @property {number} categoryId      分类 id
 * @property {string} [categoryName]  后端 JOIN 好的分类名
 * @property {string} spec            规格
 * @property {string} unit            单位：个 / 箱 / 瓶 等
 * @property {number} costPrice       加权平均成本（入库自动计算，4 位小数；仅管理员返回，商品编辑不可修改）
 * @property {string} salePrice       销售价（保留 2 位小数的字符串）
 * @property {number} stockNum        当前库存数量（只读，由入库/出库/销售/退货等单据驱动，商品表单不可修改）
 * @property {number} warnNum         库存预警阈值
 * @property {number} [supplierId]
 * @property {string} [supplierName]  后端 JOIN 好的供应商名
 * @property {string} [imageUrl]
 * @property {number} status          1 在售 0 下架（库存为 0 时后端自动置 0）
 * @property {string} [createTime]
 *
 * @typedef {Object} CategoryVO      商品分类（GET /api/category/list，全量不分页）
 * @property {number} id
 * @property {string} name
 * @property {string} colorToken      图表色标令牌，如 var(--chart-1)
 * @property {string} description
 * @property {number} sort            越小越靠前
 * @property {number} status          1 启用 0 禁用
 * @property {number} productCount    该分类下商品数（后端聚合，用于删除拦截与展示）
 * @property {string} [createTime]
 *
 * @typedef {Object} InboundPayload   POST /api/stock/inbound 入参
 * @property {number} productId
 * @property {number} quantity        必须 > 0，后端在事务内增加库存并生成流水
 * @property {number} [inboundPrice]  入库单价；填写后按移动加权平均更新商品成本，留空则维持原均价
 * @property {number} [supplierId]
 * @property {string} [remark]
 *
 * @typedef {Object} OutboundPayload  POST /api/stock/outbound 入参
 * @property {number} productId
 * @property {number} quantity        必须 > 0；超过当前库存时后端回滚并返回错误 msg
 * @property {string} [remark]
 *
 * @typedef {Object} StockLogVO       出入库流水（后端在出入库 / 销售结账时自动生成）
 * @property {number} id
 * @property {number} productId
 * @property {string} productName
 * @property {number} changeType      1 入库 2 出库
 * @property {number} bizType         业务类型：1采购入库/2销售出库/3销售退货/4盘点盘盈/5盘点盘亏/6期初入库/7手工调整
 * @property {string} bizTypeName     业务类型名称（后端映射）
 * @property {number} quantity        变动数量（正数）
 * @property {number} beforeNum       变动前库存
 * @property {number} afterNum        变动后库存
 * @property {string} [supplierName]  入库时的供应商快照
 * @property {string|number} [inboundPrice]
 * @property {string} operator        操作人（由后端从 token 解析）
 * @property {string} [remark]
 * @property {string} createTime
 *
 * @typedef {Object} StockWarnVO      库存预警项（GET /api/stock/warn/list，无分页）
 * @property {number} productId
 * @property {string} productName
 * @property {string} productCode
 * @property {string} unit
 * @property {number} stockNum        当前库存
 * @property {number} warnNum         预警阈值
 * @property {number} warnStatus      1 库存偏低（0 < stock < warn）2 已缺货（stock <= 0）
 *
 * @typedef {Object} StockStatistics  GET /api/stock/statistics 返回 data
 * @property {number} totalStock            全部商品库存件数合计
 * @property {number} warnProductCount      库存偏低商品数
 * @property {number} outProductCount       已缺货商品数
 * @property {number} pendingProductCount   待处理合计（stock < warn）
 * @property {number} totalStockValue       库存总成本货值
 *
 * @typedef {Object} SaleItemPayload  POST /api/sale/record 销售明细项
 * @property {number} productId
 * @property {number} quantity        必须 > 0
 * @property {number} [salePrice]     仅作前端展示参考：后端一律取商品表当前售价，传入值会被忽略（防篡改）
 *
 * @typedef {Object} SaleRecordPayload POST /api/sale/record 入参（收银结账）
 * @property {Array<SaleItemPayload>} items  销售商品明细（至少 1 项）
 * @property {number} [payType]       支付方式：1 现金 2 微信 3 支付宝 4 银行卡，默认 1
 * @property {string} [remark]
 *
 * @typedef {Object} SaleRecordVO     销售记录
 * @property {number} id
 * @property {string} saleNo          销售单号（后端生成 XS + yyyyMMdd + 3 位序号）
 * @property {number} totalQuantity   商品总件数
 * @property {string} totalAmount     实收总金额（字符串，保留 2 位小数）
 * @property {number} payType         1~4
 * @property {string} operator        收银员
 * @property {number} status          1 正常 2 已退货 3 已作废（仅 1 计入统计）
 * @property {string} [remark]
 * @property {string} createTime
 * @property {Array<SaleItemVO>} [items]  详情接口才返回；明细为下单时的快照
 *
 * @typedef {Object} SaleItemVO       销售明细（下单价与成本为快照，不随商品改价变化）
 * @property {number} productId
 * @property {string} productName
 * @property {string} categoryName
 * @property {number} quantity
 * @property {string} salePrice
 * @property {string} [costPrice]     仅销售记录详情返回
 * @property {string} amount
 * @property {string} [saleNo]        按商品查明细时返回
 * @property {string} [createTime]    按商品查明细时返回
 *
 * @typedef {Object} SaleStatistics   GET /api/sale/statistics 返回 data
 * @property {{ totalQuantity:number, totalAmount:number, totalCost:number, totalProfit:number }} summary
 * @property {Array<{ date:string, sale:number, cost:number, profit:number }>} dailyTrend   区间内每天补齐，无销售日为 0
 * @property {Array<{ categoryName:string, amount:number }>} categoryStats                 按销售额降序
 * @property {Array<SaleProductStat>} productStats                                         按销售额降序
 *
 * @typedef {Object} SaleProductStat  商品销售统计行
 * @property {number} productId
 * @property {string} productName
 * @property {string} categoryName
 * @property {number} salePrice
 * @property {number} quantity
 * @property {number} amount
 * @property {number} cost
 * @property {number} profit
 * @property {number} rate            毛利率（百分比数值，如 28.89）
 *
 * @typedef {Object} SupplierVO       供应商
 * @property {number} id
 * @property {string} supplierName
 * @property {string} contactPerson
 * @property {string} phone
 * @property {string} [address]
 * @property {string} [remark]
 * @property {number} productCount    名下商品数（后端聚合，用于删除拦截与展示）
 * @property {string} [createTime]
 *
 * @typedef {Object} SysUserVO        系统用户（仅管理员可管理）
 * @property {number} id
 * @property {string} username
 * @property {string} realName
 * @property {string} role            'admin' | 'operator'
 * @property {string} position        中文职位
 * @property {string} [avatar]
 * @property {string} [idCard]
 * @property {string} [phone]
 * @property {string} [address]
 * @property {string} [gender]
 * @property {string} [birthday]
 * @property {string} [joinDate]
 * @property {string|number} [salary]
 * @property {string} [remark]
 * @property {number} status          1 启用 0 禁用
 * @property {string} [createTime]
 *
 * @typedef {Object} DashboardOverview  GET /api/dashboard/overview 返回 data（首页顶部指标）
 * @property {number} todaySaleAmount      今日销售额
 * @property {number} todayCompareRate     今日销售额环比（%，可为负）
 * @property {Array<number>} todayTrend    今日销售额迷你趋势（固定 8 点）
 * @property {number} todayProfitAmount    今日毛利
 * @property {number} todayProfitRate      今日毛利环比（%）
 * @property {Array<number>} todayProfitTrend
 * @property {number} monthSaleAmount      本月销售额
 * @property {number} monthSaleRate        本月销售额环比（%）
 * @property {Array<number>} monthSaleTrend
 * @property {number} monthProfitAmount    本月毛利
 * @property {number} monthProfitRate      本月毛利环比（%）
 * @property {Array<number>} monthTrend
 * @property {number} monthInboundQuantity 本月入库总件数
 * @property {number} inboundCompareRate   入库量环比（%）
 * @property {number} productKindCount     商品种类数（SKU）
 * @property {number} warnProductCount     库存偏低商品数
 * @property {number} pendingStockCount    待处理（库存低于预警）商品数
 *
 * @typedef {Object} SaleTrendItem      GET /api/dashboard/sale-trend 单项
 * @property {string} date              已格式化为 MM-DD 的日期标签
 * @property {number} amount            当日销售金额
 *
 * @typedef {Object} StockTopItem       GET /api/dashboard/stock-top 单项（固定 5 条）
 * @property {number} productId
 * @property {string} productName
 * @property {number} stockNum
 *
 * @typedef {Object} CategoryStockItem  GET /api/dashboard/category-stock 单项
 * @property {number} categoryId
 * @property {string} categoryName
 * @property {number} stockNum          该分类库存总量（无商品的分类为 0）
 *
 * @typedef {Object} HotProductItem     GET /api/dashboard/hot-products 单项（近 30 天 TOP5）
 * @property {number} productId
 * @property {string} productName
 * @property {number} saleAmount
 * @property {number} saleQuantity
 */
export {}
