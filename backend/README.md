# 超市管家商品管理后台 · 后端服务

Node.js + Express + MySQL 实现的进销存管理后台接口，严格对齐 [`api.md`](api.md) 接口契约与 [`backend-requirements.md`](backend-requirements.md) 业务需求。

---

## 一、快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置数据库连接（默认 root/123456，按需修改）
#    直接编辑 .env 即可

# 3. 初始化数据库（建库 + 建表 + 预置数据 + 初始账号）
npm run db:init

# 4. 启动服务
npm start        # 生产
npm run dev      # 开发（nodemon 热重载）
```

> ⚠️ `db:init` 会重建表并清空原有数据。**已有数据的环境不要执行**，升级表结构请运行 `db/migrations/` 下的增量脚本，例如：
>
> ```bash
> mysql -u root -p supermarket_admin < db/migrations/001_add_token_version.sql
> ```

启动后访问 `http://localhost:3000/api/health` 应返回 `{"code":200,...,"database":"connected"}`。

### 初始账号

| 账号 | 密码 | 职位 | 角色 |
|------|------|------|------|
| admin | 123456 | 管理员 | admin |
| cangku01 | 123456 | 仓管 | operator |
| shouyin01 | 123456 | 收银员 | operator |
| houqin01 | 123456 | 后勤 | operator |
| caigou01 | 123456 | 采购 | operator |
| kuaiji01 | 123456 | 会计 | operator |

预置数据：5 个分类、5 家供应商、16 个商品、10 条出入库流水、6 张销售单（含已退货、已作废各一张）。
销售单与流水的时间均以 `NOW()` 相对生成，因此仪表盘「近 7 日趋势」等图表始终有数据。

---

## 二、目录结构

```
express demo/
├── app.js                  服务入口（中间件 → 路由 → 兜底）
├── config/index.js         全局配置（读 .env）
├── .env / .env.example     环境变量
│
├── db/
│   ├── pool.js             连接池 + query/execute/transaction 封装
│   ├── schema.sql          建表 SQL（7 张表）
│   ├── seed.sql            预置基础数据 SQL
│   ├── migrations/         增量迁移脚本（已有数据库升级用）
│   └── init.js             一键初始化脚本（建库→建表→预置→写用户）
│
├── routers/                路由层：请求分发
│   ├── index.js            汇总挂载到 /api
│   ├── userRouter.js  categoryRouter.js  productRouter.js
│   ├── supplierRouter.js  stockRouter.js  saleRouter.js
│   └── dashboardRouter.js
│
├── controllers/            控制器层：参数校验、业务逻辑、事务控制
│   ├── userController.js       categoryController.js
│   ├── productController.js    supplierController.js
│   ├── stockController.js      saleController.js
│   └── dashboardController.js
│
├── models/                 模型层：SQL 与数据持久化
│   ├── userModel.js       categoryModel.js   productModel.js
│   ├── supplierModel.js   stockModel.js      saleModel.js
│   └── dashboardModel.js
│
├── middleware/
│   ├── auth.js             JWT 鉴权 + 角色鉴权 + token 黑名单
│   └── errorHandler.js     404 与全局错误处理
│
├── utils/
│   ├── result.js           统一响应体 + BizError
│   ├── validate.js         参数校验与类型转换
│   ├── role.js             职位 ↔ 角色映射
│   ├── date.js             日期工具
│   └── asyncHandler.js     异步 Controller 包装
│
├── public/                 静态资源（保留原有）
├── index.js                ⚠️ 原 todo 练手 demo，已被 app.js 取代，可删除
└── api.md / backend-requirements.md   需求与契约文档
```

---

## 三、核心实现说明

### 3.1 统一响应与错误码

所有接口**HTTP 状态码恒为 200**，业务结果由 body 中的 `code` 表达：

```json
{ "code": 200, "msg": "success", "data": {} }
```

> 这样处理是因为前端 Axios 响应拦截器按 `body.code` 解包数据、弹错提示；若返回 4xx/5xx 会落入 axios 的 error 分支，拿不到 `msg`。

| code | 含义 |
|------|------|
| 200 | 成功 |
| 400 | 业务校验失败（`msg` 可直接弹窗展示） |
| 401 | 登录失效 |
| 403 | 无权限 |
| 404 | 接口不存在 |
| 500 | 服务异常 |

业务校验失败通过抛 `BizError` 实现，全局错误中间件统一转换：

```js
assert(quantity > 0, '入库数量必须大于 0');            // 等价于
if (quantity <= 0) throw new BizError('入库数量必须大于 0');
```

### 3.2 鉴权

- 登录返回 JWT（携带 `userId` / `role` / `position` / `tokenVersion`），前端以 `Authorization: Bearer <token>` 携带。
- `authenticate` 中间件除验签外，**每个受保护请求都会回库查一次当前用户**：
  - 账号被删除或禁用 → 立即 401；
  - token 中的 `tokenVersion` 与库中不一致 → 立即 401。
- 修改密码、管理员重置密码、禁用/启用账号、变更职位时会执行 `token_version + 1`，该用户所有旧 token 立刻失效，无需等 24 小时过期。
- 权限判断以**数据库当前值**为准，token 里过时的 `role` 不会生效（被降权的管理员无法继续调用 admin 接口）。
- `requireAdmin` 进一步校验 `role === 'admin'`。
- **操作人字段一律从数据库/ token 解析**（`operatorName(req)`），不接受前端传值，防止伪造操作人。
- 退出登录将 token 加入内存黑名单立即失效（单机部署足够；多实例可替换为 Redis）。

权限矩阵按需求文档落地：

| 接口 | 权限 |
|------|------|
| 商品 / 分类 / 供应商 增删改 | 仅 admin |
| 用户管理（列表/增删改/重置密码） | 仅 admin |
| 销售退货 / 作废 | 仅 admin |
| 入库 / 出库 / 销售结账 | admin + operator |
| 各类查询与统计 | admin + operator |

### 3.3 事务

以下操作在**单个 MySQL 事务**内完成，保证「库存 + 流水（+ 单据）」原子一致：

| 操作 | 库存变化 | 流水 | 附加 |
|------|----------|------|------|
| 提交入库 | `stock_num + N` | changeType=1 | 缺货商品自动上架 |
| 提交出库 | `stock_num - N` | changeType=2 | 先校验库存充足 |
| 提交销售 | 逐项 `- N` | 逐项 changeType=2 | 写 sale_record + sale_item |
| 销售退货 | 逐项 `+ N` | 逐项 changeType=1 | 单据置为已退货 |
| 销售作废 | 不变 | 不生成 | 单据置为已作废 |

`db/pool.js` 的 `transaction(handler)` 封装了 `beginTransaction / commit / rollback / release`，回调内抛错自动回滚。

### 3.4 并发与数据一致性

- **防超卖**：销售结账、出库、退货均先 `SELECT ... FOR UPDATE` 锁定商品行，再校验库存、扣减。
- **自动上下架**：库存被扣到 0 时自动置 `status=0`；入库/销售退货使库存恢复后，原缺货下架商品自动上架。
- **防重复操作**：退货/作废先锁定 `sale_record` 行再判断状态。
- **销售单号防重**：`XS + yyyyMMdd + - + 3 位当日序号`，由 `uk_sale_no` 唯一索引兜底；撞号时自动重试（最多 3 次）。
- **金额精度**：统一 `DECIMAL` 存储，`round2()` 计算保留两位小数，规避浮点误差。
- **流水不可变**：`stock_log` 只增不改不删，每条记录均含 `beforeNum` / `afterNum`，库存账可追溯。
- **时区统一**：Node 固定 `Asia/Shanghai`，MySQL 连接会话固定 `+08:00`，避免「今日」统计和单号日期在部署后偏移。

### 3.5 业务规则落地位置

| 规则 | 位置 |
|------|------|
| 职位 → 角色映射（管理员→admin，其余→operator） | `utils/role.js` |
| 个人中心敏感字段（salary/joinDate/position/role）忽略传值 | `userController.updateProfile` |
| 禁止删除自己 / 删除或禁用内置管理员 | `userController.remove` / `userController.update` |
| 分类下有商品禁止删除 | `categoryController.remove` |
| 供应商被商品引用禁止删除 | `supplierController.remove` |
| 商品有流水或销售明细禁止删除 | `productController.remove` |
| 条码为空自动生成 `690` + 10 位序号 | `productModel.generateProductCode` |
| 库存为 0 自动下架 | `productModel.changeStock` / `productController.buildPayload` |
| 预警判定（缺货 / 低于预警值，缺货不受预警值影响） | `stockModel.buildWarnWhere` |
| 销售统计仅计 status=1 的正常单据 | `saleModel.statsWhere` |
| 统计按当前商品/分类名归并、售价取加权均价 | `saleModel.statsByProduct` |
| 日期参数校验（真实日期 + 开始不晚于结束） | `utils/validate.assertDateRange` |
| 金额/毛利率计算 | `saleModel.statsSummary` / `statsByProduct` |

### 3.6 两处实现口径说明

以下两点文档中未完全明确，实现时的取舍如下，如需调整改动量都很小：

1. **操作人姓名**：`operator` 字段统一取「姓名，缺省则取登录账号」（`realName || username`），出库流水与销售单保持一致口径。
   注：`api.md` 示例中流水写 `admin`、销售单写 `张敏`，此处按统一口径处理。
2. **扩展接口**：额外提供了 `GET /api/product/options`（在售商品精简列表，供收银开单选品）与 `GET /api/health`（健康检查）。二者为增量接口，不影响既有契约。

---

## 四、接口清单

完整字段与示例见 [`api.md`](api.md)，共 43 个接口：

| 模块 | 前缀 | 数量 | 接口 |
|------|------|------|------|
| 用户 | `/api/user` | 10 | login、logout、info、password、profile、list、新增、编辑、删除、reset-password |
| 分类 | `/api/category` | 4 | list、新增、编辑、删除 |
| 商品 | `/api/product` | 5(+1) | list、detail、新增、编辑、删除、options* |
| 供应商 | `/api/supplier` | 5 | list、options、新增、编辑、删除 |
| 库存 | `/api/stock` | 7 | inbound/list、inbound、outbound/list、outbound、warn/list、log/list、statistics |
| 销售 | `/api/sale` | 7 | record/list、record/:id、record、record/return、record/void、item/list、statistics |
| 仪表盘 | `/api/dashboard` | 5 | overview、sale-trend、stock-top、category-stock、hot-products |

自测用的 curl 示例见 [`API-TEST.md`](API-TEST.md)。

---

## 五、已知事项

- `index.js` 是本项目原有的 todo 练手 demo，已被 `app.js` 取代，确认后可删除。
- `db/seed.sql` 中不含用户数据：密码需 bcrypt 加密，无法用纯 SQL 预置，由 `db/init.js` 运行期写入。
- 内存版 token 黑名单在服务重启后失效；账号状态与 `token_version` 存在数据库中，重启不影响这部分失效逻辑。生产环境建议把黑名单替换为 Redis。
- 已有数据库升级到 `token_version` 版本需执行 `db/migrations/001_add_token_version.sql`（增量 `ALTER TABLE`，不会清空数据）。
- 操作日志按需求文档属「建议项」，当前通过控制台访问日志体现，未单独建表。

---

*配套文档：[api.md](api.md) 接口契约 · [backend-requirements.md](backend-requirements.md) 后端功能需求*
