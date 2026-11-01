-- 简单版采购：采购单 + 明细；应付金额挂在采购单上，暂不做独立应付/付款流水表
CREATE TABLE IF NOT EXISTS `purchase_order` (
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

CREATE TABLE IF NOT EXISTS `purchase_item` (
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
