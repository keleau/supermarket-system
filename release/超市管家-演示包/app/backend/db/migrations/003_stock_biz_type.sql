-- 库存流水增加业务类型，区分采购、销售、退货、盘点、期初和手工调整。
-- 已有数据按 change_type + remark 做一次归类；后续全部由代码显式写入。
ALTER TABLE `stock_log`
  ADD COLUMN `biz_type` TINYINT NOT NULL DEFAULT 1
  COMMENT '业务类型：1采购入库/2销售出库/3销售退货/4盘点盘盈/5盘点盘亏/6期初入库/7手工调整'
  AFTER `change_type`;

UPDATE `stock_log`
SET `biz_type` = CASE
  WHEN `remark` LIKE '销售出库%' THEN 2
  WHEN `remark` LIKE '销售退货%' THEN 3
  WHEN `remark` LIKE '%期初%' THEN 6
  WHEN `change_type` = 1 AND `before_num` = 0 THEN 6
  WHEN `change_type` = 1 THEN 1
  ELSE 7
END;
