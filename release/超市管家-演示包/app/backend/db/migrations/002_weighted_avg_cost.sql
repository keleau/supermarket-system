-- 加权平均成本：成本价从「手工填写的进货价」改为「入库自动计算的移动加权平均」
-- 已有数据不需要回填：原 cost_price 直接作为初始均价继续参与后续入库计算。
ALTER TABLE `product`
  MODIFY COLUMN `cost_price` DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '加权平均成本（4 位小数，入库自动更新）';

ALTER TABLE `sale_item`
  MODIFY COLUMN `cost_price` DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT '成本快照（销售时加权平均成本）';
