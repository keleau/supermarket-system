# 超市管家 — 超市商品后台管理系统

[![Backend Tests](https://github.com/keleau/supermarket/actions/workflows/backend-test.yml/badge.svg?branch=main)](https://github.com/keleau/supermarket/actions/workflows/backend-test.yml)

基于 **Vue 3 + Express + MySQL** 的前后端分离超市商品后台管理系统，提供商品、库存、供应商、销售的统一管理，并通过数据看板辅助经营决策。

## 技术栈

| 端 | 技术 |
| --- | --- |
| 前端 | Vue 3、Vite、Element Plus、Pinia、Vue Router、Axios、ECharts |
| 后端 | Node.js、Express 5、MySQL（mysql2）、JWT、bcryptjs |

## 功能模块

- **登录认证**：JWT 登录鉴权，bcrypt 密码加密，管理员 / 仓管 / 收银员 / 采购 / 后勤 / 会计岗位权限隔离，成本与毛利仅管理员可见
- **数据看板**：销售额、订单量等核心指标展示，ECharts 图表可视化
- **商品管理**：商品分类、商品档案、条码生成/扫码、加权平均成本；商品表单不允许直接改库存，新建商品库存为 0，通过入库/期初入库增加
- **供应商管理**：供应商信息维护
- **库存管理**：商品入库（自动更新加权平均成本）、期初入库、出入库日志（区分采购/销售/退货/期初/手工调整）、库存统计与低库存预警
- **库存盘点**：生成盘点任务、录入实盘、盈亏汇总、审核后自动修正库存并生成盘盈/盘亏流水
- **经营分析**：积压商品、供应商进货金额排行（仅管理员）
- **操作日志**：商品、入库、销售、退货、盘点等关键动作留痕，仅管理员可查
- **销售管理**：收银结算（自动扣减库存）、销售记录（收银员只能看自己的）、销售统计（仅管理员）
- **系统管理**：用户管理、个人中心

## 目录结构

```
超市后端管理系统
├── frontend/            # Vue 3 前端项目（Vite 构建）
│   └── src/
│       ├── api/         # 接口封装
│       ├── components/  # 公共组件
│       ├── layout/      # 页面布局
│       ├── router/      # 路由（含登录守卫）
│       ├── store/       # Pinia 状态管理
│       ├── views/       # 业务页面（dashboard / product / stock / sale / supplier / system / login）
│       └── utils/       # 工具函数
└── backend/             # Express 后端服务
    ├── config/          # 数据库连接配置
    ├── routers/         # 路由层
    ├── controllers/     # 控制层（业务逻辑）
    ├── models/          # 数据访问层
    ├── middleware/      # JWT 鉴权、统一错误处理
    ├── db/              # 建库建表与初始化脚本（init.js、schema.sql、seed.sql）
    └── utils/           # 统一响应、参数校验、角色工具
```

## 快速开始

### 1. 环境要求

- Node.js ≥ 18
- MySQL ≥ 8.0

### 2. 启动后端

```bash
cd backend
npm install
# 复制环境变量模板并填入数据库连接信息、JWT密钥
copy .env.example .env
# 初始化数据库（建库建表 + 测试数据）
npm run db:init
# 开发模式启动（默认端口见 .env 配置）
npm run dev
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

浏览器访问终端提示的地址（默认 `http://localhost:5173`）即可进入登录页。

## 质量保障

- 后端使用 Node.js 原生测试运行器，88 个用例覆盖加权平均成本、库存流水业务类型、盘点差异计算、操作日志、岗位权限矩阵、成本/毛利字段脱敏、销售明细归一化、库存预警、鉴权失效、日期校验与登录限流。
- GitHub Actions 在每次 push / PR 时自动执行单元测试，并启动临时 MySQL 8.0 完成 `db:init` 与真实接口冒烟测试（登录、结账、库存扣减、退货、统计）。
- 前端提供连续点击 E2E：`cd frontend && npm run test:e2e`。脚本会自动创建临时库、启动独立后端（3100）和前端预览（4173），用本机 Edge/Chrome 依次走完商品新增→期初入库→入库/出库切换→收银→退货→盘点→操作日志→积压/供应商排行→收银员/仓管/会计权限，共 11 步；不污染本地演示数据，失败截图保存在 `frontend/test-results/`。

## 相关文档

- [前端接口对接文档](./frontend/前端接口对接文档.md)
- [后端接口文档](./backend/api.md)
- [Apifox 开放接口定义](./backend/apifox-openapi.json)
