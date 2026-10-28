# 超市管家商品管理后台 · 接口契约文档

| 项目名称 | 超市管家商品管理后台 |
|----------|----------------------|
| 后端技术 | Node.js + Express + MySQL |
| 前端技术 | Vue 3 + Element Plus |
| 文档用途 | 前后端联调契约，后端按本文档实现，前端按本文档对接 |

---

## 一、项目概述

本系统是面向超市日常运营的商品管理后台，覆盖**商品档案、商品分类、供应商、库存（出入库）、销售（收银/退货/作废）、系统用户、运营仪表盘**七大模块，支持多角色权限。

前端为 Vue3 + Element Plus 单页应用，通过 Axios 调用后端 REST 接口；后端基于 Node.js + Express 提供接口，MySQL 持久化存储。

**核心业务约束：**

1. 库存增减（入库、出库、销售结账、退货回补）与流水生成必须在**同一 MySQL 事务**内完成。
2. 销售结账时后端负责：校验商品在售状态、库存充足性、扣减库存、自动生成出库流水、汇总销售金额。
3. 所有写操作由后端做最终业务校验，前端仅做轻量校验（非空、格式）。

---

## 二、全局规范

### 2.1 接口前缀

所有接口统一前缀 `/api`，完整地址示例：`http://localhost:3000/api/user/login`。

### 2.2 统一响应体

所有接口返回统一 JSON 结构：

```json
{ "code": 200, "msg": "success", "data": {} }
```

| 字段 | 类型 | 说明 |
|------|------|------|
| code | number | 200 成功；401 登录失效；其余非 200 为业务失败 |
| msg  | string | 提示信息，业务失败时前端直接弹窗展示 |
| data | any    | 业务数据，成功时返回 |

**约定：**

- 前端 Axios 响应拦截器已统一解包 `data`，业务失败（code ≠ 200）时自动 `ElMessage.error(msg)`。
- 后端业务校验失败时，`msg` 需给出可直接展示给用户的明确文案（如「出库数量大于当前库存」）。

### 2.3 Token 鉴权

- 登录成功后返回 `token`，前端存于 localStorage 并在请求头携带：

```http
Authorization: Bearer <token>
```

- 后端校验 token 无效或过期时，统一返回 `{ "code": 401, "msg": "登录已失效，请重新登录" }`。
- 除「用户登录」接口外，其余接口均需携带有效 token。
- 后端每次请求都会校验账号当前状态：账号被禁用/删除、修改或重置密码、变更职位后，旧 token 会立即返回 401，无需等待过期；前端按 401 逻辑清除登录态即可。

### 2.4 角色与职位

系统用户存在两个相关字段，**职责分离**：

| 字段 | 取值 | 用途 |
|------|------|------|
| `role`（英文） | `admin` / `operator` | 后端鉴权判定 |
| `position`（中文） | 管理员 / 仓管 / 收银员 / 后勤 / 采购 / 会计 | 前端展示与职位管理 |

**映射规则（后端维护）：**

- `position = '管理员'` → `role = 'admin'`
- 其余职位（仓管/收银员/后勤/采购/会计）→ `role = 'operator'`

**岗位权限矩阵：**

| 岗位 | 销售开单 | 销售单查看 | 销售统计 | 入库 | 出库 | 库存查看 | 商品/分类/供应商 | 用户管理 |
|------|----------|------------|----------|------|------|----------|------------------|----------|
| 管理员 | 是 | 全部 | 是 | 是 | 是 | 是 | 读写 | 是 |
| 仓管   | 否 | 否 | 否 | 是 | 是 | 是 | 只读 | 否 |
| 收银员 | 是 | 仅本人 | 否 | 否 | 否 | 否 | 只读 | 否 |
| 采购   | 否 | 否 | 否 | 是 | 否 | 是 | 只读 | 否 |
| 后勤   | 否 | 否 | 否 | 否 | 否 | 是 | 只读 | 否 |
| 会计   | 否 | 全部 | 否 | 否 | 否 | 是 | 只读 | 否 |

> 管理员（`role = admin` 或 `position = 管理员`）拥有全部权限（`*`）。
> 登录 / 获取用户信息接口返回 `permissions` 权限码数组，前端用它控制菜单、路由和按钮；后端接口按同一矩阵再校验一次。
> 收银员的「销售单查看」只限本人；会计/管理员可看全部。

**财务字段脱敏：**

- 非管理员响应会剔除商品 `costPrice`、销售明细 `costPrice`、仪表盘利润字段、库存统计 `totalStockValue`、出入库流水 `inboundPrice`。
- `/api/sale/statistics` 仅管理员可访问，其他角色返回 `code=403`。

### 2.5 字段命名

接口返回 JSON **统一使用 camelCase**（如 `productName`、`stockNum`、`createTime`）。数据库列仍用 snake_case，后端查询后做映射（可在 SQL 里用 `AS` 别名）。

### 2.6 分页约定

所有分页接口统一入参与返回结构。

**入参：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pageNum  | number | 是 | 当前页码，从 1 开始 |
| pageSize | number | 是 | 每页条数 |

**返回（`data` 结构）：**

```json
{ "list": [], "total": 0, "pageNum": 1, "pageSize": 10 }
```

### 2.7 通用枚举

| 枚举 | 取值 | 含义 |
|------|------|------|
| 商品状态 status | 1 / 0 | 在售 / 下架 |
| 用户状态 status | 1 / 0 | 启用 / 禁用 |
| 流水类型 changeType | 1 / 2 | 入库 / 出库 |
| 流水业务类型 bizType | 1 / 2 / 3 / 4 / 5 / 6 / 7 | 采购入库 / 销售出库 / 销售退货 / 盘点盘盈 / 盘点盘亏 / 期初入库 / 手工调整 |
| 支付方式 payType | 1 / 2 / 3 / 4 | 现金 / 微信 / 支付宝 / 会员卡 |
| 销售状态 status | 1 / 2 / 3 | 正常 / 已退货 / 已作废 |
| 预警状态 warnStatus | 1 / 2 | 低于预警值 / 已缺货 |

### 2.8 时间格式

- 时间字段：`YYYY-MM-DD HH:mm:ss`
- 日期字段：`YYYY-MM-DD`
- 查询参数中的 `startTime` / `endTime` 按 `YYYY-MM-DD` 校验：必须是真实存在的日期（如 `2026-02-30` 会被拒绝），且开始日期不能晚于结束日期，否则返回 `code=400`。
- 业务时区统一为东八区：Node 侧 `TZ=Asia/Shanghai`，MySQL 会话时区 `+08:00`。「今日」统计与销售单号日期均按该时区计算。

### 2.9 头像

头像字段 `avatar` 为**图片 URL 字符串**（前端当前使用 Element Plus 默认头像的 URL，无需上传接口）。如后续需要本地上传，可另行补充上传接口。

---

## 三、数据库设计

### 3.1 建表 SQL

```sql
-- ==================== 系统用户表 ====================
CREATE TABLE `sys_user` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`    VARCHAR(20)  NOT NULL COMMENT '登录账号',
  `password`    VARCHAR(100) NOT NULL COMMENT '密码（加密存储）',
  `real_name`   VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '姓名',
  `role`        VARCHAR(10)  NOT NULL DEFAULT 'operator' COMMENT '角色：admin/operator',
  `position`    VARCHAR(20)  NOT NULL DEFAULT '仓管' COMMENT '职位（中文）',
  `avatar`      VARCHAR(255) NOT NULL DEFAULT '' COMMENT '头像 URL',
  `id_card`     VARCHAR(18)  NOT NULL DEFAULT '' COMMENT '身份证号',
  `phone`       VARCHAR(11)  NOT NULL DEFAULT '' COMMENT '手机号',
  `address`     VARCHAR(100) NOT NULL DEFAULT '' COMMENT '住址',
  `gender`      VARCHAR(2)   NOT NULL DEFAULT '' COMMENT '性别：男/女',
  `birthday`    DATE         NULL COMMENT '出生日期',
  `join_date`   DATE         NULL COMMENT '入职时间',
  `salary`      DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '工资',
  `remark`      VARCHAR(200) NOT NULL DEFAULT '' COMMENT '备注',
  `status`      TINYINT      NOT NULL DEFAULT 1 COMMENT '1 启用 / 0 禁用',
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统用户表';

-- ==================== 商品分类表 ====================
CREATE TABLE `category` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(20)  NOT NULL COMMENT '分类名称',
  `color_token` VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '图表色标令牌',
  `description` VARCHAR(60)  NOT NULL DEFAULT '' COMMENT '分类描述',
  `sort`        INT          NOT NULL DEFAULT 0 COMMENT '排序值（越小越靠前）',
  `status`      TINYINT      NOT NULL DEFAULT 1 COMMENT '1 启用 / 0 禁用',
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品分类表';

-- ==================== 供应商表 ====================
CREATE TABLE `supplier` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `supplier_name`  VARCHAR(40)  NOT NULL COMMENT '供应商名称',
  `contact_person` VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '联系人',
  `phone`          VARCHAR(11)  NOT NULL DEFAULT '' COMMENT '联系电话',
  `address`        VARCHAR(80)  NOT NULL DEFAULT '' COMMENT '地址',
  `remark`         VARCHAR(100) NOT NULL DEFAULT '' COMMENT '备注',
  `create_time`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_supplier_name` (`supplier_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='供应商表';

-- ==================== 商品档案表 ====================
CREATE TABLE `product` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_code` VARCHAR(13)   NOT NULL COMMENT '商品条码',
  `product_name` VARCHAR(50)   NOT NULL COMMENT '商品名称',
  `category_id`  BIGINT UNSIGNED NOT NULL COMMENT '分类 id',
  `spec`         VARCHAR(20)   NOT NULL DEFAULT '' COMMENT '规格',
  `unit`         VARCHAR(6)    NOT NULL DEFAULT '个' COMMENT '单位',
  `cost_price`   DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '加权平均成本（4 位小数，入库自动更新）',
  `sale_price`   DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '销售价',
  `stock_num`    INT           NOT NULL DEFAULT 0 COMMENT '当前库存',
  `warn_num`     INT           NOT NULL DEFAULT 0 COMMENT '预警阈值',
  `supplier_id`  BIGINT UNSIGNED NULL COMMENT '供应商 id',
  `image_url`    VARCHAR(255)  NOT NULL DEFAULT '' COMMENT '商品图片',
  `status`       TINYINT       NOT NULL DEFAULT 1 COMMENT '1 在售 / 0 下架',
  `create_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_product_code` (`product_code`),
  KEY `idx_category` (`category_id`),
  KEY `idx_supplier` (`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品档案表';

-- ==================== 出入库流水表 ====================
CREATE TABLE `stock_log` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_id`    BIGINT UNSIGNED NOT NULL COMMENT '商品 id',
  `change_type`   TINYINT      NOT NULL COMMENT '1 入库 / 2 出库',
  `biz_type`      TINYINT      NOT NULL DEFAULT 1 COMMENT '业务类型：1采购入库/2销售出库/3销售退货/4盘点盘盈/5盘点盘亏/6期初入库/7手工调整',
  `quantity`      INT          NOT NULL COMMENT '变动数量（正数）',
  `before_num`    INT          NOT NULL COMMENT '变动前库存',
  `after_num`     INT          NOT NULL COMMENT '变动后库存',
  `supplier_name` VARCHAR(40)  NOT NULL DEFAULT '' COMMENT '入库供应商（仅入库）',
  `inbound_price` DECIMAL(10,2) NULL COMMENT '入库单价（仅入库）',
  `operator`      VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '操作人',
  `remark`        VARCHAR(100) NOT NULL DEFAULT '' COMMENT '备注',
  `create_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_product` (`product_id`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='出入库流水表';

-- ==================== 销售记录表 ====================
CREATE TABLE `sale_record` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sale_no`        VARCHAR(30)   NOT NULL COMMENT '销售单号',
  `total_quantity` INT           NOT NULL DEFAULT 0 COMMENT '商品总件数',
  `total_amount`   DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '实收总金额',
  `pay_type`       TINYINT       NOT NULL DEFAULT 1 COMMENT '支付方式 1-4',
  `operator`       VARCHAR(20)   NOT NULL DEFAULT '' COMMENT '收银员',
  `status`         TINYINT       NOT NULL DEFAULT 1 COMMENT '1 正常 / 2 已退货 / 3 已作废',
  `remark`         VARCHAR(100)  NOT NULL DEFAULT '' COMMENT '备注',
  `create_time`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sale_no` (`sale_no`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='销售记录表';

-- ==================== 销售明细表 ====================
CREATE TABLE `sale_item` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sale_record_id` BIGINT UNSIGNED NOT NULL COMMENT '销售单 id',
  `product_id`     BIGINT UNSIGNED NOT NULL COMMENT '商品 id',
  `product_name`   VARCHAR(50)   NOT NULL DEFAULT '' COMMENT '商品名称（冗余快照）',
  `category_name`  VARCHAR(20)   NOT NULL DEFAULT '' COMMENT '分类名称（冗余快照）',
  `quantity`       INT           NOT NULL COMMENT '销售数量',
  `sale_price`     DECIMAL(10,2) NOT NULL COMMENT '销售单价',
  `cost_price`     DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '成本快照（销售时加权平均成本）',
  `amount`         DECIMAL(12,2) NOT NULL COMMENT '小计金额',
  PRIMARY KEY (`id`),
  KEY `idx_sale_record` (`sale_record_id`),
  KEY `idx_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='销售明细表';
```

### 3.2 字段 → 接口映射

数据库列名为 snake_case，接口返回 camelCase。映射示例（其余类推）：

| 数据库列 | 接口字段 |
|----------|----------|
| product_name | productName |
| category_id  | categoryId |
| stock_num    | stockNum |
| warn_num     | warnNum |
| create_time  | createTime |

关联查询返回的附加字段（非本表列，来自 JOIN）：如商品列表返回 `categoryName`、`supplierName`。

---

## 四、接口清单

> 访问权限说明：`公开` 表示无需 token；`admin` 表示仅管理员；`admin/operator` 表示管理员和操作员均可。

---

### 4.1 用户模块

#### 4.1.1 用户登录

| 项 | 内容 |
|----|------|
| 名称 | 用户登录 |
| URL | `/api/user/login` |
| Method | POST |
| 访问权限 | 公开 |

**请求参数（body）：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 登录账号 |
| password | string | 是 | 登录密码 |

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "role": "admin",
    "position": "管理员",
    "username": "admin",
    "avatar": "https://...png",
    "realName": "系统管理员",
    "permissions": ["*"]
  }
}
```

| data 字段 | 说明 |
|-----------|------|
| token    | 访问令牌（建议 JWT，含 userId、role） |
| role     | 英文角色，后端鉴权用 |
| permissions | 岗位权限码数组，`*` 表示全部权限 |
| position | 中文职位，前端存入 roleName 用于菜单/路由权限判断 |
| username | 登录账号 |
| avatar   | 头像 URL（可选） |
| realName | 姓名（可选） |

**业务校验规则：**

1. 账号或密码为空 → `{ code: 400, msg: "请输入账号和密码" }`。
2. 账号不存在或密码不匹配 → `{ code: 400, msg: "账号或密码错误" }`。
3. 用户被禁用（status=0）→ `{ code: 400, msg: "该账号已被禁用" }`。
4. 同一 IP 每分钟超过 5 次登录尝试 → `{ code: 429, msg: "登录尝试过于频繁，请 1 分钟后再试" }`（HTTP 状态仍为 200）。

---

#### 4.1.2 退出登录

| 项 | 内容 |
|----|------|
| 名称 | 退出登录 |
| URL | `/api/user/logout` |
| Method | POST |
| 访问权限 | admin/operator |

**请求参数：** 无。

**返回示例：** `{ "code": 200, "msg": "success", "data": null }`

**业务校验规则：** 后端使 token 失效（加入黑名单 / 删除缓存）。

---

#### 4.1.3 获取当前用户信息

| 项 | 内容 |
|----|------|
| 名称 | 获取当前用户信息 |
| URL | `/api/user/info` |
| Method | GET |
| 访问权限 | admin/operator |

**请求参数：** 无（从 token 解析当前用户）。

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "id": 1,
    "username": "admin",
    "realName": "系统管理员",
    "role": "admin",
    "position": "管理员",
    "avatar": "https://...png",
    "phone": "13900000001"
  }
}
```

**业务校验规则：** token 无效或用户不存在 → `{ code: 401, msg: "登录已失效，请重新登录" }`。

---

#### 4.1.4 修改密码

| 项 | 内容 |
|----|------|
| 名称 | 修改密码（本人） |
| URL | `/api/user/password` |
| Method | POST |
| 访问权限 | admin/operator |

**请求参数（body）：**

```json
{ "oldPassword": "123", "newPassword": "123456" }
```

**返回示例：** `{ "code": 200, "msg": "success", "data": null }`

**业务校验规则：**

1. 旧密码错误 → `{ code: 400, msg: "当前密码错误" }`。
2. 新密码长度 < 6 → `{ code: 400, msg: "新密码长度至少 6 位" }`。
3. 新密码与旧密码相同 → `{ code: 400, msg: "新密码不能与当前密码相同" }`。

---

#### 4.1.5 更新个人资料（个人中心）

| 项 | 内容 |
|----|------|
| 名称 | 更新个人资料 |
| URL | `/api/user/profile` |
| Method | PUT |
| 访问权限 | admin/operator |

**请求参数（body）：**

```json
{
  "avatar": "https://...png",
  "realName": "系统管理员",
  "gender": "男",
  "birthday": "1990-01-01",
  "phone": "13900000001",
  "idCard": "330100199001011234",
  "address": "浙江省杭州市西湖区",
  "remark": "系统最高权限"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| avatar   | string | 否 | 头像 URL |
| realName | string | 否 | 姓名 |
| gender   | string | 否 | 性别（男/女） |
| birthday | string | 否 | 出生日期 YYYY-MM-DD |
| phone    | string | 否 | 手机号 |
| idCard   | string | 否 | 身份证号 |
| address  | string | 否 | 住址 |
| remark   | string | 否 | 个人简介 |

**返回示例：** `{ "code": 200, "msg": "success", "data": null }`

**业务校验规则：**

1. 手机号非空且格式不符 → `{ code: 400, msg: "手机号格式不正确" }`。
2. 身份证号非空且格式不符 → `{ code: 400, msg: "身份证号格式不正确" }`。
3. **敏感字段（工资 salary、入职时间 joinDate、职位 position、角色 role）不允许通过本接口修改**，后端忽略这些字段的传值，仅允许管理员在「编辑用户」接口修改。
4. 生日 `birthday` 非空时必须为 `YYYY-MM-DD` 且是真实存在的日期。

> ⚠️ 前端个人中心的「提交」含两次提示 + 密码分级校验，但**密码校验属于前端交互逻辑**，后端本接口只做 token 鉴权与字段校验，不重复校验登录密码。

---

#### 4.1.6 用户分页列表

| 项 | 内容 |
|----|------|
| 名称 | 用户分页列表 |
| URL | `/api/user/list` |
| Method | GET |
| 访问权限 | admin（仅管理员） |

**请求参数（query）：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pageNum  | number | 是 | 页码 |
| pageSize | number | 是 | 每页条数 |
| username | string | 否 | 登录账号（模糊） |
| position | string | 否 | 职位（精确） |
| status   | number | 否 | 1 启用 / 0 禁用 |

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "list": [
      {
        "id": 1,
        "username": "admin",
        "realName": "系统管理员",
        "role": "admin",
        "position": "管理员",
        "avatar": "https://...png",
        "idCard": "330100199001011234",
        "phone": "13900000001",
        "address": "浙江省杭州市西湖区",
        "gender": "男",
        "birthday": "1990-01-01",
        "joinDate": "2023-06-01",
        "salary": 15000,
        "remark": "系统最高权限",
        "status": 1,
        "createTime": "2026-09-01 09:00:00"
      }
    ],
    "total": 6,
    "pageNum": 1,
    "pageSize": 10
  }
}
```

**业务校验规则：** 列表**不得返回 password 字段**；按 createTime 倒序。

---

#### 4.1.7 新增用户

| 项 | 内容 |
|----|------|
| 名称 | 新增用户 |
| URL | `/api/user` |
| Method | POST |
| 访问权限 | admin |

**请求参数（body）：**

```json
{
  "username": "zhaoliu",
  "realName": "赵六",
  "position": "收银员",
  "avatar": "https://...png",
  "idCard": "330100199707077890",
  "phone": "13900000007",
  "address": "浙江省杭州市",
  "gender": "男",
  "birthday": "1997-07-07",
  "joinDate": "2025-01-01",
  "salary": 5500,
  "remark": "",
  "status": 1
}
```

> 注：`role` 字段**不由前端传**，后端根据 `position` 自动映射（管理员→admin，其余→operator）。

**返回示例：** `{ "code": 200, "msg": "success", "data": { "id": 7 } }`

**业务校验规则：**

1. username 为空或格式不符（3-20 位字母/数字/下划线）→ `{ code: 400, msg: "账号格式不正确" }`。
2. username 已存在 → `{ code: 400, msg: "登录账号已存在" }`。
3. 手机号非空且格式不符 → `{ code: 400, msg: "手机号格式不正确" }`。
4. 身份证号非空且格式不符 → `{ code: 400, msg: "身份证号格式不正确" }`。
5. 初始密码由后端设置（默认 `123456`），可经「重置密码」接口修改。
6. `birthday` / `joinDate` 非空时必须为 `YYYY-MM-DD` 且是真实存在的日期，否则 `{ code: 400, msg: "出生日期格式不正确（YYYY-MM-DD）" }`。

---

#### 4.1.8 编辑用户

| 项 | 内容 |
|----|------|
| 名称 | 编辑用户 |
| URL | `/api/user` |
| Method | PUT |
| 访问权限 | admin |

**请求参数（body）：**

```json
{
  "id": 7,
  "realName": "赵六",
  "position": "后勤",
  "avatar": "https://...png",
  "idCard": "330100199707077890",
  "phone": "13900000007",
  "address": "浙江省杭州市",
  "gender": "男",
  "birthday": "1997-07-07",
  "joinDate": "2025-01-01",
  "salary": 6000,
  "remark": "",
  "status": 1
}
```

**返回示例：** `{ "code": 200, "msg": "success", "data": null }`

**业务校验规则：**

1. 用户不存在 → `{ code: 400, msg: "用户不存在" }`。
2. username **不可修改**（后端忽略传入的 username）。
3. `role` 随 `position` 重新映射（管理员→admin，其余→operator）。
4. 系统内置管理员强制保持 `admin` / `管理员`，且禁止禁用 → `{ code: 400, msg: "系统管理员不可禁用" }`。
5. 其余校验同新增用户。

---

#### 4.1.9 删除用户

| 项 | 内容 |
|----|------|
| 名称 | 删除用户 |
| URL | `/api/user/:id` |
| Method | DELETE |
| 访问权限 | admin |

**返回示例：** `{ "code": 200, "msg": "success", "data": null }`

**业务校验规则：**

1. 用户不存在 → `{ code: 400, msg: "用户不存在" }`。
2. 禁止删除自己 → `{ code: 400, msg: "不能删除当前登录账号" }`。
3. 禁止删除系统内置管理员 → `{ code: 400, msg: "系统管理员不可删除" }`。

---

#### 4.1.10 重置用户密码

| 项 | 内容 |
|----|------|
| 名称 | 重置用户密码 |
| URL | `/api/user/reset-password` |
| Method | POST |
| 访问权限 | admin |

**请求参数（body）：**

```json
{ "id": 7, "newPassword": "123456" }
```

**返回示例：** `{ "code": 200, "msg": "success", "data": null }`

**业务校验规则：**

1. 用户不存在 → `{ code: 400, msg: "用户不存在" }`。
2. 新密码长度 < 6 → `{ code: 400, msg: "新密码长度至少 6 位" }`。

---

### 4.2 商品分类模块

#### 4.2.1 分类列表

| 项 | 内容 |
|----|------|
| 名称 | 分类列表（全量） |
| URL | `/api/category/list` |
| Method | GET |
| 访问权限 | admin/operator |

**请求参数：** 无（返回全部，不分页）。

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": [
    {
      "id": 1,
      "name": "饮料乳品",
      "colorToken": "var(--chart-1)",
      "description": "矿泉水、乳制品、碳酸饮料等",
      "sort": 1,
      "status": 1
    }
  ]
}
```

**业务校验规则：** 按 sort 升序返回。

---

#### 4.2.2 新增分类

| 项 | 内容 |
|----|------|
| 名称 | 新增分类 |
| URL | `/api/category` |
| Method | POST |
| 访问权限 | admin |

**请求参数（body）：**

```json
{
  "name": "母婴用品",
  "colorToken": "var(--chart-6)",
  "description": "奶粉、纸尿裤等",
  "sort": 6,
  "status": 1
}
```

**返回示例：** `{ "code": 200, "msg": "success", "data": { "id": 6 } }`

**业务校验规则：**

1. 名称为空 → `{ code: 400, msg: "请输入分类名称" }`。
2. 名称已存在 → `{ code: 400, msg: "分类名称已存在" }`。

---

#### 4.2.3 编辑分类

| 项 | 内容 |
|----|------|
| 名称 | 编辑分类 |
| URL | `/api/category` |
| Method | PUT |
| 访问权限 | admin |

**请求参数（body）：** 同新增，另含 `id`。

**返回示例：** `{ "code": 200, "msg": "success", "data": null }`

**业务校验规则：**

1. 分类不存在 → `{ code: 400, msg: "分类不存在" }`。
2. 名称已存在（排除自身）→ `{ code: 400, msg: "分类名称已存在" }`。

---

#### 4.2.4 删除分类

| 项 | 内容 |
|----|------|
| 名称 | 删除分类 |
| URL | `/api/category/:id` |
| Method | DELETE |
| 访问权限 | admin |

**返回示例：** `{ "code": 200, "msg": "success", "data": null }`

**业务校验规则：**

1. 分类不存在 → `{ code: 400, msg: "分类不存在" }`。
2. 分类下存在商品 → `{ code: 400, msg: "该分类下存在商品，无法删除" }`。

---

### 4.3 商品档案模块

#### 4.3.1 商品分页列表

| 项 | 内容 |
|----|------|
| 名称 | 商品分页列表 |
| URL | `/api/product/list` |
| Method | GET |
| 访问权限 | admin/operator |

> 非管理员返回时自动剔除 `costPrice`。

**请求参数（query）：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pageNum     | number | 是 | 页码 |
| pageSize    | number | 是 | 每页条数 |
| productName | string | 否 | 商品名称（模糊） |
| productCode | string | 否 | 商品条码（模糊） |
| categoryId  | number | 否 | 分类 id（精确） |
| status      | number | 否 | 1 在售 / 0 下架 |

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "list": [
      {
        "id": 1,
        "productCode": "6900000000001",
        "productName": "农夫山泉 550ml",
        "categoryId": 1,
        "categoryName": "饮料乳品",
        "spec": "550ml",
        "unit": "瓶",
        "costPrice": 1.2,
        "salePrice": 2,
        "stockNum": 380,
        "warnNum": 10,
        "supplierId": 1,
        "supplierName": "农夫山泉股份有限公司",
        "imageUrl": "",
        "status": 1,
        "createTime": "2026-09-15 10:00:00"
      }
    ],
    "total": 16,
    "pageNum": 1,
    "pageSize": 10
  }
}
```

**业务校验规则：** 列表需 JOIN 返回 `categoryName`、`supplierName`。

---

#### 4.3.2 商品详情

| 项 | 内容 |
|----|------|
| 名称 | 商品详情 |
| URL | `/api/product/:id` |
| Method | GET |
| 访问权限 | admin/operator |

> 非管理员返回时自动剔除 `costPrice`。

**返回示例：** 与列表项结构一致（单对象，含 categoryName、supplierName）。

**业务校验规则：** 商品不存在 → `{ code: 400, msg: "商品不存在" }`。

---

#### 4.3.3 新增商品

| 项 | 内容 |
|----|------|
| 名称 | 新增商品 |
| URL | `/api/product` |
| Method | POST |
| 访问权限 | admin |

**请求参数（body）：**

```json
{
  "productCode": "6900000000017",
  "productName": "农夫山泉 550ml",
  "categoryId": 1,
  "spec": "550ml",
  "unit": "瓶",
  "costPrice": 1.2,
  "salePrice": 2,
  "warnNum": 10,
  "supplierId": 1,
  "imageUrl": ""
}
```

**返回示例：** `{ "code": 200, "msg": "success", "data": { "id": 17 } }`

**业务校验规则：**

1. 商品名称为空 → `{ code: 400, msg: "请输入商品名称" }`。
2. 条码为空时后端自动生成（`690` 前缀 + 10 位序号）；条码已存在 → `{ code: 400, msg: "商品条码已存在" }`。
3. 销售价 ≤ 0 → `{ code: 400, msg: "销售单价必须大于 0" }`。
4. 期初成本 < 0 → `{ code: 400, msg: "成本价不能为负" }`。
5. 库存不能通过商品接口设置：`stockNum` 传了也会忽略，新建商品库存固定为 0、`status=0`。
6. 期初库存请调用 `POST /api/stock/inbound`（期初入库）；入库后库存 > 0 会自动上架。

> 成本口径：新增时可填期初成本；之后由入库按移动加权平均自动更新，商品编辑不能手工修改。
> 库存口径：商品新增/编辑都不改库存；库存只能由入库、出库、销售、退货、盘点等单据驱动。

---

#### 4.3.4 编辑商品

| 项 | 内容 |
|----|------|
| 名称 | 编辑商品 |
| URL | `/api/product` |
| Method | PUT |
| 访问权限 | admin |

**请求参数（body）：** 同新增，另含 `id`。`costPrice` 不能修改：不传或传原值可通过，传不同的值返回 400（成本只能由入库自动计算）。`stockNum` 不参与更新，库存只能由单据驱动。

**返回示例：** `{ "code": 200, "msg": "success", "data": null }`

**业务校验规则：**

1. 商品不存在 → `{ code: 400, msg: "商品不存在" }`。
2. 条码已存在（排除自身）→ `{ code: 400, msg: "商品条码已存在" }`。
3. 成本价与当前值不同 → `{ code: 400, msg: "成本价由入库自动计算，不能手工修改" }`。
4. 其余校验同新增商品。

---

#### 4.3.5 删除商品

| 项 | 内容 |
|----|------|
| 名称 | 删除商品 |
| URL | `/api/product/:id` |
| Method | DELETE |
| 访问权限 | admin |

**返回示例：** `{ "code": 200, "msg": "success", "data": null }`

**业务校验规则：**

1. 商品不存在 → `{ code: 400, msg: "商品不存在" }`。
2. 商品存在流水或销售明细记录 → `{ code: 400, msg: "该商品存在业务记录，无法删除" }`（建议软删除）。

---

### 4.4 供应商模块

#### 4.4.1 供应商分页列表

| 项 | 内容 |
|----|------|
| 名称 | 供应商分页列表 |
| URL | `/api/supplier/list` |
| Method | GET |
| 访问权限 | admin/operator |

**请求参数（query）：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pageNum        | number | 是 | 页码 |
| pageSize       | number | 是 | 每页条数 |
| supplierName   | string | 否 | 供应商名称（模糊） |
| contactPerson  | string | 否 | 联系人（模糊） |

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "list": [
      {
        "id": 1,
        "supplierName": "农夫山泉股份有限公司",
        "contactPerson": "王经理",
        "phone": "13800000001",
        "address": "浙江省杭州市建德市",
        "remark": "饮料乳品主供",
        "createTime": "2026-09-01 09:00:00"
      }
    ],
    "total": 5,
    "pageNum": 1,
    "pageSize": 10
  }
}
```

**业务校验规则：** 无特殊校验。

---

#### 4.4.2 供应商下拉选项

| 项 | 内容 |
|----|------|
| 名称 | 供应商下拉选项 |
| URL | `/api/supplier/options` |
| Method | GET |
| 访问权限 | admin/operator |

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": [
    { "id": 1, "supplierName": "农夫山泉股份有限公司" },
    { "id": 2, "supplierName": "百事食品中国" }
  ]
}
```

**业务校验规则：** 供入库单/商品选择供应商用，仅返回 id 与名称。

---

#### 4.4.3 新增供应商

| 项 | 内容 |
|----|------|
| 名称 | 新增供应商 |
| URL | `/api/supplier` |
| Method | POST |
| 访问权限 | admin |

**请求参数（body）：**

```json
{
  "supplierName": "统一企业",
  "contactPerson": "陈经理",
  "phone": "13800000008",
  "address": "上海市",
  "remark": ""
}
```

**返回示例：** `{ "code": 200, "msg": "success", "data": { "id": 6 } }`

**业务校验规则：**

1. 名称为空 → `{ code: 400, msg: "请输入供应商名称" }`。
2. 名称已存在 → `{ code: 400, msg: "供应商名称已存在" }`。
3. 手机号非空且格式不符 → `{ code: 400, msg: "手机号格式不正确" }`。

---

#### 4.4.4 编辑供应商

| 项 | 内容 |
|----|------|
| 名称 | 编辑供应商 |
| URL | `/api/supplier` |
| Method | PUT |
| 访问权限 | admin |

**请求参数（body）：** 同新增，另含 `id`。

**返回示例：** `{ "code": 200, "msg": "success", "data": null }`

**业务校验规则：**

1. 供应商不存在 → `{ code: 400, msg: "供应商不存在" }`。
2. 名称已存在（排除自身）→ `{ code: 400, msg: "供应商名称已存在" }`。

---

#### 4.4.5 删除供应商

| 项 | 内容 |
|----|------|
| 名称 | 删除供应商 |
| URL | `/api/supplier/:id` |
| Method | DELETE |
| 访问权限 | admin |

**返回示例：** `{ "code": 200, "msg": "success", "data": null }`

**业务校验规则：**

1. 供应商不存在 → `{ code: 400, msg: "供应商不存在" }`。
2. 供应商被商品引用 → `{ code: 400, msg: "该供应商下存在关联商品，无法删除" }`。

---

### 4.5 库存管理模块

> 本模块所有写操作（入库/出库）必须在**数据库事务**中完成：更新商品库存 + 写入流水，二者同时成功或同时回滚。

#### 4.5.1 入库明细分页列表

| 项 | 内容 |
|----|------|
| 名称 | 入库明细分页列表 |
| URL | `/api/stock/inbound/list` |
| Method | GET |
| 访问权限 | admin / 仓管 / 采购 / 后勤 / 会计（需 stock:read） |

**请求参数（query）：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pageNum     | number | 是 | 页码 |
| pageSize    | number | 是 | 每页条数 |
| productName | string | 否 | 商品名称（模糊） |
| startTime   | string | 否 | 开始时间 YYYY-MM-DD |
| endTime     | string | 否 | 结束时间 YYYY-MM-DD |

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "list": [
      {
        "id": 2001,
        "productId": 1,
        "productName": "农夫山泉 550ml",
        "changeType": 1,
        "quantity": 120,
        "supplierName": "农夫山泉股份有限公司",
        "inboundPrice": 1.2,
        "operator": "admin",
        "remark": "",
        "createTime": "2026-10-06 09:30:00"
      }
    ],
    "total": 8,
    "pageNum": 1,
    "pageSize": 10
  }
}
```

**业务校验规则：** 仅返回 changeType=1 的记录，按 createTime 倒序。

---

#### 4.5.2 提交入库

| 项 | 内容 |
|----|------|
| 名称 | 提交入库 |
| URL | `/api/stock/inbound` |
| Method | POST |
| 访问权限 | admin / 仓管 / 采购（需 stock:in） |

**请求参数（body）：**

```json
{
  "productId": 1,
  "supplierId": 1,
  "quantity": 100,
  "inboundPrice": 1.2,
  "remark": "补货"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| productId    | number | 是 | 商品 id |
| supplierId   | number | 否 | 供应商 id |
| quantity     | number | 是 | 入库数量，必须 > 0 |
| inboundPrice | number | 否 | 入库单价；填写后按移动加权平均更新商品成本，留空则维持原均价 |
| remark       | string | 否 | 备注 |

**返回示例：** `{ "code": 200, "msg": "success", "data": { "id": 2002 } }`

**业务校验规则（事务内执行）：**

1. 商品不存在 → `{ code: 400, msg: "商品不存在" }`。
2. quantity ≤ 0 → `{ code: 400, msg: "入库数量必须大于 0" }`。
3. **事务**：`product.stock_num += quantity`；写入 stock_log（changeType=1，记录 beforeNum/afterNum，若传 supplierId 则回填 supplierName）。
4. 若商品原为缺货（stockNum=0）且下架，入库后可自动上架（status=1）。

---

#### 4.5.3 出库明细分页列表

| 项 | 内容 |
|----|------|
| 名称 | 出库明细分页列表 |
| URL | `/api/stock/outbound/list` |
| Method | GET |
| 访问权限 | admin / 仓管 / 采购 / 后勤 / 会计（需 stock:read） |

**请求参数（query）：** 同入库列表（4.5.1）。

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "list": [
      {
        "id": 2003,
        "productId": 3,
        "productName": "可口可乐 330ml",
        "changeType": 2,
        "quantity": 40,
        "operator": "admin",
        "remark": "报损",
        "createTime": "2026-10-05 14:20:00"
      }
    ],
    "total": 6,
    "pageNum": 1,
    "pageSize": 10
  }
}
```

**业务校验规则：** 仅返回 changeType=2 的记录，按 createTime 倒序。

---

#### 4.5.4 提交出库

| 项 | 内容 |
|----|------|
| 名称 | 提交出库 |
| URL | `/api/stock/outbound` |
| Method | POST |
| 访问权限 | admin / 仓管（需 stock:out） |

**请求参数（body）：**

```json
{
  "productId": 3,
  "quantity": 10,
  "remark": "报损出库"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| productId | number | 是 | 商品 id |
| quantity  | number | 是 | 出库数量，必须 > 0 |
| remark    | string | 否 | 备注 |

**返回示例：** `{ "code": 200, "msg": "success", "data": { "id": 2004 } }`

**业务校验规则（事务内执行）：**

1. 商品不存在 → `{ code: 400, msg: "商品不存在" }`。
2. quantity ≤ 0 → `{ code: 400, msg: "出库数量必须大于 0" }`。
3. **库存不足** → `{ code: 400, msg: "出库数量大于当前库存" }`（不回滚，直接返回）。
4. **事务**：`product.stock_num -= quantity`；写入 stock_log（changeType=2，记录 beforeNum/afterNum）。

---

#### 4.5.5 预警商品列表

| 项 | 内容 |
|----|------|
| 名称 | 预警商品列表 |
| URL | `/api/stock/warn/list` |
| Method | GET |
| 访问权限 | admin / 仓管 / 采购 / 后勤 / 会计（需 stock:read） |

**请求参数（query）：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| productName | string | 否 | 商品名称（模糊） |
| warnStatus  | number | 否 | 1 低于预警值 / 2 已缺货 |

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": [
    {
      "productId": 8,
      "productName": "维达抽纸 3 层",
      "productCode": "6900000000008",
      "unit": "件",
      "stockNum": 0,
      "warnNum": 10,
      "warnStatus": 2
    },
    {
      "productId": 16,
      "productName": "海天生抽 500ml",
      "productCode": "6900000000016",
      "unit": "瓶",
      "stockNum": 6,
      "warnNum": 10,
      "warnStatus": 1
    }
  ]
}
```

**业务校验规则：**

1. 预警判定：`stockNum <= 0` → warnStatus=2（已缺货）；`0 < stockNum < warnNum` → warnStatus=1（低于预警值）。
2. 缺货商品（`stockNum <= 0`）即使 `warnNum = 0` 也必须返回，不能漏掉。
3. 按 stockNum 升序（缺货在前）。

---

#### 4.5.6 出入库流水分页列表

| 项 | 内容 |
|----|------|
| 名称 | 出入库流水分页列表 |
| URL | `/api/stock/log/list` |
| Method | GET |
| 访问权限 | admin / 仓管 / 采购 / 后勤 / 会计（需 stock:read） |

**请求参数（query）：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pageNum     | number | 是 | 页码 |
| pageSize    | number | 是 | 每页条数 |
| productName | string | 否 | 商品名称（模糊） |
| productId   | number | 否 | 商品 id（精确，商品详情抽屉用） |
| changeType  | number | 否 | 1 入库 / 2 出库 |
| bizType     | number | 否 | 业务类型 1-7，见 2.7 通用枚举 |
| startTime   | string | 否 | 开始时间 |
| endTime     | string | 否 | 结束时间 |

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "list": [
      {
        "id": 2004,
        "productId": 3,
        "productName": "可口可乐 330ml",
        "changeType": 2,
        "bizType": 7,
        "bizTypeName": "手工调整",
        "quantity": 10,
        "beforeNum": 86,
        "afterNum": 76,
        "operator": "admin",
        "remark": "报损出库",
        "createTime": "2026-10-11 10:00:00"
      }
    ],
    "total": 15,
    "pageNum": 1,
    "pageSize": 10
  }
}
```

**业务校验规则：** 按 createTime 倒序（最新在前）。

---

#### 4.5.7 库存统计

| 项 | 内容 |
|----|------|
| 名称 | 库存统计 |
| URL | `/api/stock/statistics` |
| Method | GET |
| 访问权限 | admin / 仓管 / 采购 / 后勤 / 会计（需 stock:read） |

**请求参数：** 无。

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "totalStock": 1160,
    "warnProductCount": 3,
    "outProductCount": 1,
    "pendingProductCount": 4,
    "totalStockValue": 5286.4
  }
}
```

| 字段 | 说明 |
|------|------|
| totalStock          | 库存总量（Σ stockNum） |
| warnProductCount    | 预警商品数（0 < stockNum < warnNum） |
| outProductCount     | 缺货商品数（stockNum = 0） |
| pendingProductCount | 待盘点商品数（stockNum < warnNum，含缺货） |
| totalStockValue     | 库存总价值（Σ costPrice × stockNum） |

**业务校验规则：** 实时聚合，无特殊校验。

---

### 4.6 销售管理模块

> 销售结账、退货、作废均涉及库存与流水变更，必须在**数据库事务**中完成。

#### 4.6.1 销售记录分页列表

| 项 | 内容 |
|----|------|
| 名称 | 销售记录分页列表 |
| URL | `/api/sale/record/list` |
| Method | GET |
| 访问权限 | admin / 收银员 / 会计（收银员仅本人单据） |

**请求参数（query）：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pageNum   | number | 是 | 页码 |
| pageSize  | number | 是 | 每页条数 |
| saleNo    | string | 否 | 单据编号（模糊） |
| operator  | string | 否 | 收银员（精确） |
| payType   | number | 否 | 支付方式 1-4 |
| startTime | string | 否 | 开始时间 |
| endTime   | string | 否 | 结束时间 |

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "list": [
      {
        "id": 1001,
        "saleNo": "XS20261011-001",
        "totalQuantity": 5,
        "totalAmount": 23.5,
        "payType": 1,
        "operator": "张敏",
        "status": 1,
        "remark": "",
        "createTime": "2026-10-11 09:42:00"
      }
    ],
    "total": 18,
    "pageNum": 1,
    "pageSize": 10
  }
}
```

**业务校验规则：** 列表不含明细 items（明细走详情接口），按 createTime 倒序。

---

#### 4.6.2 销售记录详情

| 项 | 内容 |
|----|------|
| 名称 | 销售记录详情 |
| URL | `/api/sale/record/:id` |
| Method | GET |
| 访问权限 | admin / 收银员（仅本人）/ 会计 |

> 非管理员返回时，明细 items 中的 `costPrice` 会被剔除。

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "id": 1001,
    "saleNo": "XS20261011-001",
    "totalQuantity": 5,
    "totalAmount": 23.5,
    "payType": 1,
    "operator": "张敏",
    "status": 1,
    "remark": "",
    "createTime": "2026-10-11 09:42:00",
    "items": [
      {
        "productId": 1,
        "productName": "农夫山泉 550ml",
        "categoryName": "饮料乳品",
        "quantity": 2,
        "salePrice": 2,
        "costPrice": 1.2,
        "amount": 4
      }
    ]
  }
}
```

**业务校验规则：** 单据不存在 → `{ code: 400, msg: "销售单据不存在" }`。

---

#### 4.6.3 提交销售（收银结账）

| 项 | 内容 |
|----|------|
| 名称 | 提交销售 |
| URL | `/api/sale/record` |
| Method | POST |
| 访问权限 | admin / 收银员（需 sale:create） |

**请求参数（body）：**

```json
{
  "items": [
    { "productId": 1, "quantity": 2, "salePrice": 2 },
    { "productId": 2, "quantity": 1, "salePrice": 3.5 }
  ],
  "payType": 1,
  "remark": ""
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| items[].productId | number | 是 | 商品 id |
| items[].quantity  | number | 是 | 销售数量，必须 > 0 |
| items[].salePrice | number | 否 | 兼容字段：后端忽略此值，始终按商品表当前售价计价 |
| payType           | number | 否 | 支付方式 1-4，默认 1 |
| remark            | string | 否 | 备注 |

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "id": 1019,
    "saleNo": "XS20261011-019",
    "totalQuantity": 3,
    "totalAmount": 7.5
  }
}
```

**业务校验规则（事务内执行）：**

1. items 为空 → `{ code: 400, msg: "销售商品不能为空" }`。
2. 任一商品不存在 → `{ code: 400, msg: "商品不存在" }`。
3. 任一商品已下架（status=0）→ `{ code: 400, msg: "商品 xxx 已下架" }`。
4. **库存不足** → `{ code: 400, msg: "商品 xxx 库存不足" }`（整个事务回滚，不扣任何库存）。
5. **事务内依次执行**：
   - 生成销售单号（`XS` + yyyymmdd + `-` + 3 位当日序号）。
   - 写入 sale_record 与 sale_item（含 productName、categoryName、costPrice 冗余快照）。
   - 逐项扣减库存 `stock_num -= quantity`。
   - 逐项写入 stock_log（changeType=2 出库流水，beforeNum/afterNum）。
   - 汇总 totalQuantity 与 totalAmount（商品表当前售价 × quantity，保留两位小数）。
6. 请求体中的 `salePrice` 不参与计价；售价以商品表 `sale_price` 为准，防止收银价篡改。

---

#### 4.6.4 销售退货

| 项 | 内容 |
|----|------|
| 名称 | 销售退货（整单退款） |
| URL | `/api/sale/record/return` |
| Method | POST |
| 访问权限 | admin |

**请求参数（body）：**

```json
{ "saleNo": "XS20261011-001" }
```

**返回示例：** `{ "code": 200, "msg": "success", "data": null }`

**业务校验规则（事务内执行）：**

1. 单据不存在 → `{ code: 400, msg: "销售单据不存在" }`。
2. 单据已退货 → `{ code: 400, msg: "该单据已退货" }`。
3. 单据已作废 → `{ code: 400, msg: "该单据已作废，无法退货" }`。
4. **事务内依次执行**：
   - `sale_record.status = 2`。
   - 逐项回补库存 `stock_num += quantity`。
   - 逐项写入 stock_log（changeType=1 入库流水，remark 注明「销售退货」）。

---

#### 4.6.5 销售作废

| 项 | 内容 |
|----|------|
| 名称 | 销售作废 |
| URL | `/api/sale/record/void` |
| Method | POST |
| 访问权限 | admin |

**请求参数（body）：**

```json
{ "saleNo": "XS20261011-001" }
```

**返回示例：** `{ "code": 200, "msg": "success", "data": null }`

**业务校验规则（事务内执行）：**

1. 单据不存在 → `{ code: 400, msg: "销售单据不存在" }`。
2. 单据已退货或已作废 → `{ code: 400, msg: "该单据状态异常，无法作废" }`。
3. **事务内执行**：`sale_record.status = 3`（作废**不恢复库存**，用于误录冲正）。

---

#### 4.6.6 销售明细按商品查询

| 项 | 内容 |
|----|------|
| 名称 | 销售明细按商品查询 |
| URL | `/api/sale/item/list` |
| Method | GET |
| 访问权限 | admin / 收银员（仅本人）/ 会计 |

**用途：** 商品详情抽屉的「销售历史」展示。

**请求参数（query）：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| productId | number | 是 | 商品 id |
| pageNum   | number | 是 | 页码 |
| pageSize  | number | 是 | 每页条数 |

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "list": [
      {
        "saleNo": "XS20261011-001",
        "createTime": "2026-10-11 09:42:00",
        "productName": "农夫山泉 550ml",
        "categoryName": "饮料乳品",
        "quantity": 2,
        "salePrice": 2,
        "amount": 4
      }
    ],
    "total": 5,
    "pageNum": 1,
    "pageSize": 10
  }
}
```

**业务校验规则：** 按 createTime 倒序。关联 sale_record 取 saleNo、createTime。

---

#### 4.6.7 销售统计（聚合）

| 项 | 内容 |
|----|------|
| 名称 | 销售统计聚合 |
| URL | `/api/sale/statistics` |
| Method | GET |
| 访问权限 | admin（含成本/毛利，operator 返回 403） |

**请求参数（query）：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| startTime   | string | 否 | 开始日期 YYYY-MM-DD |
| endTime     | string | 否 | 结束日期 YYYY-MM-DD |
| categoryId  | number | 否 | 分类 id（精确） |
| productName | string | 否 | 商品名称（精确） |

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "summary": {
      "totalQuantity": 320,
      "totalAmount": 4520.5,
      "totalCost": 2980.2,
      "totalProfit": 1540.3
    },
    "dailyTrend": [
      { "date": "2026-10-05", "sale": 6240, "cost": 4120, "profit": 2120 },
      { "date": "2026-10-06", "sale": 7180, "cost": 4740, "profit": 2440 }
    ],
    "categoryStats": [
      { "categoryName": "饮料乳品", "amount": 8620 },
      { "categoryName": "休闲零食", "amount": 6240 }
    ],
    "productStats": [
      {
        "productId": 1,
        "productName": "农夫山泉 550ml",
        "categoryName": "饮料乳品",
        "salePrice": 2,
        "quantity": 96,
        "amount": 192,
        "cost": 115.2,
        "profit": 76.8,
        "rate": 40
      }
    ]
  }
}
```

| 字段 | 说明 |
|------|------|
| summary.totalQuantity | 销售总件数 |
| summary.totalAmount   | 销售总金额 |
| summary.totalCost     | 总成本（Σ costPrice × quantity） |
| summary.totalProfit   | 总毛利（totalAmount - totalCost） |
| dailyTrend[]          | 每日销售额/成本/毛利（区间内每天补齐，无销售日为 0） |
| categoryStats[]       | 各分类销售额占比（按 amount 降序） |
| productStats[]        | 各商品销售统计（quantity/amount/cost/profit/rate，rate 为毛利率百分比） |

**业务校验规则：**

1. 日期区间缺省时默认近 7 天；`startTime` / `endTime` 必须是真实日期且开始不晚于结束，否则返回 `code=400`。
2. 金额保留两位小数；毛利率 `rate = profit / amount × 100`（amount 为 0 时 rate=0）。
3. 仅统计 status=1（正常）的销售单据，已退货/已作废单据不计入。
4. 商品/分类按**当前主数据**归并：商品或分类改名后，同一商品/分类仍只出一行，不会因历史名称快照被拆开。
5. `productStats[].salePrice` 为区间**加权均价**（总金额 ÷ 总数量），不是区间内最高价。

---

### 4.7 仪表盘模块（运营总览）

> 均为只读统计接口，供首页运营总览使用。

#### 4.7.1 运营总览指标

| 项 | 内容 |
|----|------|
| 名称 | 运营总览指标 |
| URL | `/api/dashboard/overview` |
| Method | GET |
| 访问权限 | 所有已登录岗位（需 dashboard:read） |

> 非管理员不返回利润字段：`todayProfitAmount` / `todayProfitRate` / `todayProfitTrend` / `monthProfitAmount` / `monthProfitRate` / `monthTrend`。

**请求参数：** 无。

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "todaySaleAmount": 8642.5,
    "todayCompareRate": 12.6,
    "todayTrend": [420, 360, 300, 480, 620, 760, 690, 820],
    "todayProfitAmount": 1420.6,
    "todayProfitRate": -3.8,
    "todayProfitTrend": [86, 72, 60, 95, 128, 152, 138, 166],
    "monthSaleAmount": 268430.6,
    "monthSaleRate": 9.4,
    "monthSaleTrend": [6820, 7240, 6980, 7560, 7380, 8120, 7840, 8460],
    "monthProfitAmount": 38650.8,
    "monthProfitRate": 8.2,
    "monthTrend": [1820, 2140, 1960, 2480, 2320, 2760, 2540, 2980],
    "monthInboundQuantity": 12860,
    "inboundCompareRate": -4.2,
    "productKindCount": 1268,
    "warnProductCount": 23,
    "pendingStockCount": 47
  }
}
```

| 字段 | 说明 |
|------|------|
| todaySaleAmount / todayCompareRate / todayTrend | 今日销售额 / 环比(%) / 迷你趋势线序列 |
| todayProfitAmount / todayProfitRate / todayProfitTrend | 今日利润 / 环比(%) / 迷你趋势线序列 |
| monthSaleAmount / monthSaleRate / monthSaleTrend | 本月销售额 / 环比(%) / 迷你趋势线序列 |
| monthProfitAmount / monthProfitRate / monthTrend | 本月利润 / 环比(%) / 迷你趋势线序列 |
| monthInboundQuantity / inboundCompareRate | 本月收货总数量（仅采购入库/期初入库，不含销售退货）/ 环比(%) |
| productKindCount | 商品总种类（SKU 数） |
| warnProductCount | 库存预警商品数量 |
| pendingStockCount | 待盘点商品数量 |

**业务校验规则：** 环比可为负值（正增负减）；趋势线序列为等间隔采样点数组。

---

#### 4.7.2 近 N 日销售趋势

| 项 | 内容 |
|----|------|
| 名称 | 近 N 日销售趋势 |
| URL | `/api/dashboard/sale-trend` |
| Method | GET |
| 访问权限 | admin/operator |

**请求参数（query）：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| days | number | 否 | 天数，默认 7 |

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": [
    { "date": "10-05", "amount": 6240 },
    { "date": "10-06", "amount": 7180 }
  ]
}
```

**业务校验规则：** 返回近 N 日每日销售金额（date 格式 `MM-DD`），按日期升序。

---

#### 4.7.3 库存余量 TOP5

| 项 | 内容 |
|----|------|
| 名称 | 库存余量 TOP5 |
| URL | `/api/dashboard/stock-top` |
| Method | GET |
| 访问权限 | admin/operator |

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": [
    { "productId": 1, "productName": "农夫山泉 550ml", "stockNum": 3860 },
    { "productId": 4, "productName": "康师傅红烧牛肉面", "stockNum": 2740 }
  ]
}
```

**业务校验规则：** 按 stockNum 降序取前 5。

---

#### 4.7.4 各分类库存占比

| 项 | 内容 |
|----|------|
| 名称 | 各分类库存占比 |
| URL | `/api/dashboard/category-stock` |
| Method | GET |
| 访问权限 | admin/operator |

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": [
    { "categoryId": 1, "categoryName": "饮料乳品", "stockNum": 8620 },
    { "categoryId": 2, "categoryName": "休闲零食", "stockNum": 6240 }
  ]
}
```

**业务校验规则：** 按分类聚合库存总量。

---

#### 4.7.5 热销商品 TOP5

| 项 | 内容 |
|----|------|
| 名称 | 热销商品 TOP5 |
| URL | `/api/dashboard/hot-products` |
| Method | GET |
| 访问权限 | admin/operator |

**返回示例：**

```json
{
  "code": 200,
  "msg": "success",
  "data": [
    { "productId": 1, "productName": "农夫山泉 550ml", "saleAmount": 4280, "saleQuantity": 960 },
    { "productId": 2, "productName": "伊利纯牛奶 250ml", "saleAmount": 3860, "saleQuantity": 720 }
  ]
}
```

**业务校验规则：** 按售出数量 saleQuantity 降序取前 5（区间可取近 30 天）。

---

## 五、附：错误码约定

| code | 含义 | 前端处理 |
|------|------|----------|
| 200  | 成功 | 解包 data |
| 400  | 业务校验失败 | 弹出 msg |
| 401  | 登录失效 | 清除 token 跳登录页 |
| 403  | 无权限 | 弹出 msg |
| 429  | 登录尝试过于频繁 | 弹出 msg，稍后重试 |
| 500  | 服务异常 | 弹出「服务异常」 |

---

*本文档为前后端接口契约，仅描述接口行为与数据结构，不包含后端业务代码实现。*
