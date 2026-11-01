-- ============================================================
--  超市管家商品管理后台 · 建表脚本
--  字符集 utf8mb4 / 引擎 InnoDB
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ==================== 系统用户表 ====================
DROP TABLE IF EXISTS `sys_user`;
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
  `token_version` INT        NOT NULL DEFAULT 0 COMMENT '登录令牌版本号，自增后旧 token 立即失效',
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统用户表';

-- ==================== 商品分类表 ====================
DROP TABLE IF EXISTS `category`;
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
DROP TABLE IF EXISTS `supplier`;
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
DROP TABLE IF EXISTS `product`;
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
DROP TABLE IF EXISTS `stock_log`;
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
DROP TABLE IF EXISTS `sale_record`;
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
DROP TABLE IF EXISTS `sale_item`;
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

-- ==================== 库存盘点单 ====================
DROP TABLE IF EXISTS `stocktake_order`;
CREATE TABLE `stocktake_order` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `take_no`           VARCHAR(30)   NOT NULL COMMENT '盘点单号',
  `status`            TINYINT       NOT NULL DEFAULT 0 COMMENT '0 草稿 / 1 已提交 / 2 已审核 / 3 已取消',
  `operator`          VARCHAR(20)   NOT NULL DEFAULT '' COMMENT '制单人',
  `auditor`           VARCHAR(20)   NOT NULL DEFAULT '' COMMENT '审核人',
  `audit_time`        DATETIME      NULL COMMENT '审核时间',
  `total_gain_qty`    INT           NOT NULL DEFAULT 0 COMMENT '盘盈总数量',
  `total_loss_qty`    INT           NOT NULL DEFAULT 0 COMMENT '盘亏总数量',
  `total_gain_amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '盘盈总金额',
  `total_loss_amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '盘亏总金额',
  `remark`            VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '备注',
  `create_time`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_take_no` (`take_no`),
  KEY `idx_status` (`status`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库存盘点单';

-- ==================== 库存盘点明细 ====================
DROP TABLE IF EXISTS `stocktake_item`;
CREATE TABLE `stocktake_item` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id`     BIGINT UNSIGNED NOT NULL COMMENT '盘点单 id',
  `product_id`   BIGINT UNSIGNED NOT NULL COMMENT '商品 id',
  `product_name` VARCHAR(50)   NOT NULL DEFAULT '' COMMENT '商品名称快照',
  `unit`         VARCHAR(6)    NOT NULL DEFAULT '个' COMMENT '单位快照',
  `book_qty`     INT           NOT NULL DEFAULT 0 COMMENT '账面数（审核时更新为审核时库存）',
  `actual_qty`   INT           NOT NULL DEFAULT 0 COMMENT '实盘数',
  `diff_qty`     INT           NOT NULL DEFAULT 0 COMMENT '实盘数 - 账面数',
  `cost_price`   DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '审核时加权成本快照',
  `diff_amount`  DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '盈亏金额',
  `reason`       VARCHAR(20)   NOT NULL DEFAULT '' COMMENT '盈亏原因：破损/丢失/赠品/计量误差/其他',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_product` (`order_id`, `product_id`),
  KEY `idx_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库存盘点明细';

-- ==================== 操作日志 ====================
DROP TABLE IF EXISTS `operation_log`;
CREATE TABLE `operation_log` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       BIGINT UNSIGNED NULL COMMENT '操作人 id',
  `username`      VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '操作人账号',
  `role`          VARCHAR(10)  NOT NULL DEFAULT '' COMMENT '角色',
  `position`      VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '职位',
  `module`        VARCHAR(20)  NOT NULL COMMENT '模块：product/stock/sale/stocktake',
  `action`        VARCHAR(30)  NOT NULL COMMENT '动作：create/update/inbound/audit...',
  `biz_no`        VARCHAR(40)  NOT NULL DEFAULT '' COMMENT '业务单号或对象标识',
  `before_status` TINYINT      NULL COMMENT '变更前状态',
  `after_status`  TINYINT      NULL COMMENT '变更后状态',
  `detail`        VARCHAR(500) NOT NULL DEFAULT '' COMMENT '操作摘要',
  `ip`            VARCHAR(45)  NOT NULL DEFAULT '' COMMENT '操作 IP',
  `create_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_module_action` (`module`, `action`),
  KEY `idx_username` (`username`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作日志';

-- ==================== 采购单 ====================
DROP TABLE IF EXISTS `purchase_order`;
CREATE TABLE `purchase_order` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no`       VARCHAR(30)   NOT NULL COMMENT '采购单号',
  `supplier_id`    BIGINT UNSIGNED NOT NULL COMMENT '供应商 id',
  `supplier_name`  VARCHAR(40)   NOT NULL DEFAULT '' COMMENT '供应商名称快照',
  `status`         TINYINT       NOT NULL DEFAULT 0 COMMENT '0 草稿 / 1 已提交 / 2 已入库 / 3 已取消',
  `total_amount`   DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '采购总金额',
  `payable_amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '应付金额（入库后生成）',
  `paid_amount`    DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '已付金额',
  `operator`       VARCHAR(20)   NOT NULL DEFAULT '' COMMENT '制单人',
  `submit_time`    DATETIME      NULL COMMENT '提交时间',
  `receiver`       VARCHAR(20)   NOT NULL DEFAULT '' COMMENT '收货人',
  `receive_time`   DATETIME      NULL COMMENT '收货时间',
  `remark`         VARCHAR(200)  NOT NULL DEFAULT '',
  `create_time`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_supplier` (`supplier_id`),
  KEY `idx_status` (`status`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='采购单';

-- ==================== 采购明细 ====================
DROP TABLE IF EXISTS `purchase_item`;
CREATE TABLE `purchase_item` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id`     BIGINT UNSIGNED NOT NULL COMMENT '采购单 id',
  `product_id`   BIGINT UNSIGNED NOT NULL COMMENT '商品 id',
  `product_name` VARCHAR(50)   NOT NULL DEFAULT '' COMMENT '商品名称快照',
  `unit`         VARCHAR(6)    NOT NULL DEFAULT '个' COMMENT '单位快照',
  `quantity`     INT           NOT NULL COMMENT '采购数量',
  `price`        DECIMAL(10,2) NOT NULL COMMENT '采购单价',
  `amount`       DECIMAL(12,2) NOT NULL COMMENT '小计金额',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_product` (`order_id`, `product_id`),
  KEY `idx_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='采购明细';

SET FOREIGN_KEY_CHECKS = 1;
