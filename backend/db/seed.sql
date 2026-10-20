-- ============================================================
--  超市管家商品管理后台 · 预置基础数据
--  说明：用户表（sys_user）不在此脚本中插入，因为密码需 bcrypt 加密，
--        由 db/init.js 在运行期生成哈希后写入（见 npm run db:init）。
--  时间统一使用 NOW() 相对表达式，保证演示数据（近 7 日趋势等）始终新鲜。
-- ============================================================

SET NAMES utf8mb4;

-- ==================== 商品分类（5 个）====================
INSERT INTO `category` (`id`, `name`, `color_token`, `description`, `sort`, `status`) VALUES
(1, '饮料乳品', 'var(--chart-1)', '矿泉水、乳制品、碳酸饮料等', 1, 1),
(2, '休闲零食', 'var(--chart-2)', '膨化食品、饼干、方便面等', 2, 1),
(3, '粮油调味', 'var(--chart-3)', '食用油、大米、酱油等调味品', 3, 1),
(4, '日用百货', 'var(--chart-4)', '纸巾、洗护、清洁用品等', 4, 1),
(5, '生鲜果蔬', 'var(--chart-5)', '水果、蔬菜等生鲜商品', 5, 1);

-- ==================== 供应商（5 家）====================
INSERT INTO `supplier` (`id`, `supplier_name`, `contact_person`, `phone`, `address`, `remark`) VALUES
(1, '农夫山泉股份有限公司', '王经理', '13800000001', '浙江省杭州市建德市', '饮料乳品主供'),
(2, '百事食品中国', '李经理', '13800000002', '上海市浦东新区', '碳酸饮料与膨化食品'),
(3, '康师傅控股有限公司', '张经理', '13800000003', '天津市经济技术开发区', '方便面、粮油调味'),
(4, '伊利实业集团', '刘经理', '13800000004', '内蒙古呼和浩特市', '乳制品主供'),
(5, '维达纸业', '陈经理', '13800000005', '广东省江门市', '日用百货主供');

-- ==================== 商品档案（16 个）====================
INSERT INTO `product`
(`id`, `product_code`, `product_name`, `category_id`, `spec`, `unit`, `cost_price`, `sale_price`, `stock_num`, `warn_num`, `supplier_id`, `image_url`, `status`) VALUES
(1,  '6900000000001', '农夫山泉 550ml',      1, '550ml', '瓶', 1.20,  2.00,  380,  10, 1, '', 1),
(2,  '6900000000002', '伊利纯牛奶 250ml',    1, '250ml', '盒', 2.50,  3.50,  260,  20, 4, '', 1),
(3,  '6900000000003', '可口可乐 330ml',      1, '330ml', '罐', 2.00,  3.00,   12,  15, 2, '', 1),
(4,  '6900000000004', '康师傅红烧牛肉面',    2, '105g',  '袋', 3.20,  4.50, 2740,  50, 3, '', 1),
(5,  '6900000000005', '乐事薯片 原味',       2, '70g',   '袋', 4.00,  6.00,  320,  30, 2, '', 1),
(6,  '6900000000006', '奥利奥夹心饼干',      2, '116g',  '盒', 5.50,  8.00,  180,  20, 2, '', 1),
(7,  '6900000000007', '金龙鱼调和油',        3, '5L',    '桶', 45.00, 59.90,  64,  10, 3, '', 1),
(8,  '6900000000008', '维达抽纸 3 层',       4, '130抽', '件', 12.00, 18.00,   0,  10, 5, '', 0),
(9,  '6900000000009', '蒙牛酸酸乳',          1, '250ml', '盒', 2.80,  4.00,   96,  20, 4, '', 1),
(10, '6900000000010', '五常大米 5kg',        3, '5kg',   '袋', 32.00, 45.00, 120,  15, 3, '', 1),
(11, '6900000000011', '洁柔卷纸 10 卷',      4, '10卷',  '提', 15.00, 22.00,  88,  12, 5, '', 1),
(12, '6900000000012', '蓝月亮洗衣液 2kg',    4, '2kg',   '瓶', 18.00, 28.00,   8,  10, 5, '', 1),
(13, '6900000000013', '山东红富士苹果',      5, '500g',  '斤', 3.00,  5.50,  240,  30, 1, '', 1),
(14, '6900000000014', '海南香蕉',            5, '500g',  '斤', 2.20,  4.00,  150,  25, 1, '', 1),
(15, '6900000000015', '有机西兰花',          5, '500g',  '斤', 4.50,  7.50,   40,  20, 1, '', 1),
(16, '6900000000016', '海天生抽 500ml',      3, '500ml', '瓶', 6.50,  9.90,    6,  10, 3, '', 1);

-- ==================== 出入库流水（预置历史）====================
-- 每个商品「最后一条流水的 after_num」与 product.stock_num 保持一致，账实相符
INSERT INTO `stock_log`
(`product_id`, `change_type`, `quantity`, `before_num`, `after_num`, `supplier_name`, `inbound_price`, `operator`, `remark`, `create_time`) VALUES
( 1, 1, 120,  260,  380, '农夫山泉股份有限公司',  1.20, 'admin', '常规补货',   DATE_SUB(NOW(), INTERVAL 6 DAY)),
( 2, 1, 300,    0,  300, '伊利实业集团',          2.50, 'admin', '新批次入库', DATE_SUB(NOW(), INTERVAL 6 DAY)),
( 2, 2,  40,  300,  260, '',                     NULL, 'admin', '门店调拨',   DATE_SUB(NOW(), INTERVAL 4 DAY)),
(16, 1, 200,    0,  200, '康师傅控股有限公司',    6.50, 'admin', '补货',       DATE_SUB(NOW(), INTERVAL 5 DAY)),
(16, 2, 194,  200,    6, '',                     NULL, 'admin', '促销出货',   DATE_SUB(NOW(), INTERVAL 3 DAY)),
(12, 2,  20,   28,    8, '',                     NULL, 'admin', '报损出库',   DATE_SUB(NOW(), INTERVAL 3 DAY)),
( 9, 2,  40,  136,   96, '',                     NULL, 'admin', '报损',       DATE_SUB(NOW(), INTERVAL 2 DAY)),
( 4, 1,2000,  740, 2740, '康师傅控股有限公司',    3.20, 'admin', '大批量补货', DATE_SUB(NOW(), INTERVAL 2 DAY)),
( 8, 2,  60,   60,    0, '',                     NULL, 'admin', '清仓出库',   DATE_SUB(NOW(), INTERVAL 1 DAY)),
( 3, 2,  10,   22,   12, '',                     NULL, 'admin', '报损出库',   DATE_SUB(NOW(), INTERVAL 1 DAY));

-- ==================== 销售记录 + 明细（预置历史）====================
-- 1001：1 天前，正常
INSERT INTO `sale_record` (`id`, `sale_no`, `total_quantity`, `total_amount`, `pay_type`, `operator`, `status`, `remark`, `create_time`) VALUES
(1001, CONCAT('XS', DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 DAY), '%Y%m%d'), '-001'), 5, 19.50, 1, '张敏', 1, '', DATE_SUB(NOW(), INTERVAL 1 DAY));
INSERT INTO `sale_item` (`sale_record_id`, `product_id`, `product_name`, `category_name`, `quantity`, `sale_price`, `cost_price`, `amount`) VALUES
(1001,  1, '农夫山泉 550ml',   '饮料乳品', 2, 2.00, 1.20,  4.00),
(1001,  2, '伊利纯牛奶 250ml', '饮料乳品', 1, 3.50, 2.50,  3.50),
(1001,  5, '乐事薯片 原味',    '休闲零食', 2, 6.00, 4.00, 12.00);

-- 1002：2 天前，正常
INSERT INTO `sale_record` (`id`, `sale_no`, `total_quantity`, `total_amount`, `pay_type`, `operator`, `status`, `remark`, `create_time`) VALUES
(1002, CONCAT('XS', DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 2 DAY), '%Y%m%d'), '-001'), 12, 135.00, 2, '张敏', 1, '', DATE_SUB(NOW(), INTERVAL 2 DAY));
INSERT INTO `sale_item` (`sale_record_id`, `product_id`, `product_name`, `category_name`, `quantity`, `sale_price`, `cost_price`, `amount`) VALUES
(1002,  4, '康师傅红烧牛肉面', '休闲零食', 10, 4.50,  3.20,  45.00),
(1002, 10, '五常大米 5kg',     '粮油调味',  2, 45.00, 32.00, 90.00);

-- 1003：3 天前，正常
INSERT INTO `sale_record` (`id`, `sale_no`, `total_quantity`, `total_amount`, `pay_type`, `operator`, `status`, `remark`, `create_time`) VALUES
(1003, CONCAT('XS', DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 3 DAY), '%Y%m%d'), '-001'), 10, 24.00, 3, '李强', 1, '', DATE_SUB(NOW(), INTERVAL 3 DAY));
INSERT INTO `sale_item` (`sale_record_id`, `product_id`, `product_name`, `category_name`, `quantity`, `sale_price`, `cost_price`, `amount`) VALUES
(1003,  1, '农夫山泉 550ml', '饮料乳品', 6, 2.00, 1.20, 12.00),
(1003,  3, '可口可乐 330ml', '饮料乳品', 4, 3.00, 2.00, 12.00);

-- 1004：5 天前，已退货（status=2，不计入统计）
INSERT INTO `sale_record` (`id`, `sale_no`, `total_quantity`, `total_amount`, `pay_type`, `operator`, `status`, `remark`, `create_time`) VALUES
(1004, CONCAT('XS', DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 5 DAY), '%Y%m%d'), '-001'), 3, 24.00, 4, '李强', 2, '顾客退货', DATE_SUB(NOW(), INTERVAL 5 DAY));
INSERT INTO `sale_item` (`sale_record_id`, `product_id`, `product_name`, `category_name`, `quantity`, `sale_price`, `cost_price`, `amount`) VALUES
(1004,  6, '奥利奥夹心饼干', '休闲零食', 3, 8.00, 5.50, 24.00);

-- 1005：今天，正常
INSERT INTO `sale_record` (`id`, `sale_no`, `total_quantity`, `total_amount`, `pay_type`, `operator`, `status`, `remark`, `create_time`) VALUES
(1005, CONCAT('XS', DATE_FORMAT(CURDATE(), '%Y%m%d'), '-001'), 13, 64.00, 1, '张敏', 1, '', DATE_SUB(NOW(), INTERVAL 2 HOUR));
INSERT INTO `sale_item` (`sale_record_id`, `product_id`, `product_name`, `category_name`, `quantity`, `sale_price`, `cost_price`, `amount`) VALUES
(1005, 13, '山东红富士苹果', '生鲜果蔬', 8, 5.50, 3.00, 44.00),
(1005, 14, '海南香蕉',       '生鲜果蔬', 5, 4.00, 2.20, 20.00);

-- 1006：今天，已作废（status=3，不计入统计）
INSERT INTO `sale_record` (`id`, `sale_no`, `total_quantity`, `total_amount`, `pay_type`, `operator`, `status`, `remark`, `create_time`) VALUES
(1006, CONCAT('XS', DATE_FORMAT(CURDATE(), '%Y%m%d'), '-002'), 2, 44.00, 1, '张敏', 3, '误录冲正', DATE_SUB(NOW(), INTERVAL 1 HOUR));
INSERT INTO `sale_item` (`sale_record_id`, `product_id`, `product_name`, `category_name`, `quantity`, `sale_price`, `cost_price`, `amount`) VALUES
(1006, 11, '洁柔卷纸 10 卷', '日用百货', 2, 22.00, 15.00, 44.00);
