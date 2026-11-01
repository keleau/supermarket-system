-- 库存盘点单 + 明细
CREATE TABLE IF NOT EXISTS `stocktake_order` (
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

CREATE TABLE IF NOT EXISTS `stocktake_item` (
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
  `reason`       VARCHAR(20)   NOT NULL DEFAULT '' COMMENT '盈亏原因',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_product` (`order_id`, `product_id`),
  KEY `idx_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库存盘点明细';
