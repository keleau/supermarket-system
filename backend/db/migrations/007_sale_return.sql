-- 独立整单退货单（红字）+ 作废回补库存流水类型
-- 已有数据库升级：mysql -u root -p supermarket_admin < db/migrations/007_sale_return.sql

CREATE TABLE IF NOT EXISTS `sale_return_order` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `return_no`      VARCHAR(30)   NOT NULL COMMENT '退货单号',
  `sale_record_id` BIGINT UNSIGNED NOT NULL COMMENT '原销售单 id',
  `sale_no`        VARCHAR(30)   NOT NULL COMMENT '原销售单号快照',
  `status`         TINYINT       NOT NULL DEFAULT 0 COMMENT '0 待确认 / 1 已确认 / 2 已拒绝 / 3 已取消',
  `total_quantity` INT           NOT NULL DEFAULT 0 COMMENT '退货总件数',
  `total_amount`   DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '冲减营收金额',
  `operator`       VARCHAR(20)   NOT NULL DEFAULT '' COMMENT '申请人',
  `auditor`        VARCHAR(20)   NOT NULL DEFAULT '' COMMENT '确认人',
  `audit_time`     DATETIME      NULL COMMENT '确认时间',
  `remark`         VARCHAR(200)  NOT NULL DEFAULT '' COMMENT '备注',
  `create_time`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_return_no` (`return_no`),
  KEY `idx_sale_record` (`sale_record_id`),
  KEY `idx_status` (`status`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='销售退货单（整单退货）';

CREATE TABLE IF NOT EXISTS `sale_return_item` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `return_id`     BIGINT UNSIGNED NOT NULL COMMENT '退货单 id',
  `product_id`    BIGINT UNSIGNED NOT NULL COMMENT '商品 id',
  `product_name`  VARCHAR(50)   NOT NULL DEFAULT '' COMMENT '商品名称快照',
  `category_name` VARCHAR(20)   NOT NULL DEFAULT '' COMMENT '分类名称快照',
  `quantity`      INT           NOT NULL COMMENT '退货数量',
  `sale_price`    DECIMAL(10,2) NOT NULL COMMENT '原销售单价快照',
  `cost_price`    DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '原销售成本快照',
  `amount`        DECIMAL(12,2) NOT NULL COMMENT '小计金额（原成交金额）',
  PRIMARY KEY (`id`),
  KEY `idx_return` (`return_id`),
  KEY `idx_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='销售退货明细';

-- 库存流水业务类型扩展：8 = 作废回补
ALTER TABLE `stock_log`
  MODIFY COLUMN `biz_type` TINYINT NOT NULL DEFAULT 1
  COMMENT '业务类型：1采购入库/2销售出库/3销售退货/4盘点盘盈/5盘点盘亏/6期初入库/7手工调整/8作废回补';
