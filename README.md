# 超市管家 — 超市商品后台管理系统

基于 **Vue 3 + Express + MySQL** 的前后端分离超市商品后台管理系统，提供商品、库存、供应商、销售的统一管理，并通过数据看板辅助经营决策。

## 技术栈

| 端 | 技术 |
| --- | --- |
| 前端 | Vue 3、Vite、Element Plus、Pinia、Vue Router、Axios、ECharts |
| 后端 | Node.js、Express 5、MySQL（mysql2）、JWT、bcryptjs |

## 功能模块

- **登录认证**：JWT 登录鉴权，bcrypt 密码加密，管理员 / 普通员工角色权限区分
- **数据看板**：销售额、订单量等核心指标展示，ECharts 图表可视化
- **商品管理**：商品分类、商品列表（增删改查）
- **供应商管理**：供应商信息维护
- **库存管理**：商品入库、出入库日志、库存统计与低库存预警
- **销售管理**：收银结算（自动扣减库存）、销售记录、销售统计
- **系统管理**：用户管理、个人中心

## 目录结构

```
超市后端管理系统
├── 前端/                # Vue 3 前端项目（Vite 构建）
│   └── src/
│       ├── api/         # 接口封装
│       ├── components/  # 公共组件
│       ├── layout/      # 页面布局
│       ├── router/      # 路由（含登录守卫）
│       ├── store/       # Pinia 状态管理
│       ├── views/       # 业务页面（dashboard / product / stock / sale / supplier / system / login）
│       └── utils/       # 工具函数
└── 后端/
    └── express demo/    # Express 后端服务
        ├── config/      # 数据库连接配置
        ├── routers/     # 路由层
        ├── controllers/ # 控制层（业务逻辑）
        ├── models/      # 数据访问层
        ├── middleware/  # JWT 鉴权、统一错误处理
        ├── db/          # 建库建表与初始化脚本（init.js、schema.sql、seed.sql）
        └── utils/       # 统一响应、参数校验、角色工具
```

## 快速开始

### 1. 环境要求

- Node.js ≥ 18
- MySQL ≥ 8.0

### 2. 启动后端

```bash
cd 后端/express demo
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
cd 前端
npm install
npm run dev
```

浏览器访问终端提示的地址（默认 `http://localhost:5173`）即可进入登录页。

## 相关文档

- [前端接口对接文档](./前端/前端接口对接文档.md)
- [后端接口文档](./后端/express%20demo/api.md)
- [Apifox 开放接口定义](./后端/express%20demo/apifox-openapi.json)
