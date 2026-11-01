# 接口自测说明（curl）

前置：已完成 `npm run db:init` 并 `npm start`，服务运行在 `http://localhost:3000`。

> Windows CMD / PowerShell 下把行尾的 `\` 换成 `^` 或写成一行。

---

## 0. 健康检查与登录

```bash
# 健康检查（无需 token）
curl http://localhost:3000/api/health

# 登录
curl -X POST http://localhost:3000/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'
```

返回：

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "token": "eyJhbGciOi...",
    "role": "admin",
    "position": "管理员",
    "username": "admin",
    "avatar": "https://...",
    "realName": "系统管理员"
  }
}
```

后续请求统一携带该 token。为方便复制，先存成变量（bash）：

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
echo $TOKEN
```

### 关键校验用例（预期失败）

```bash
# 密码错误 → {"code":400,"msg":"账号或密码错误"}
curl -X POST http://localhost:3000/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"wrong"}'

# 缺参数 → {"code":400,"msg":"请输入账号和密码"}
curl -X POST http://localhost:3000/api/user/login \
  -H "Content-Type: application/json" -d '{"username":"admin"}'

# 无 token 访问受控接口 → {"code":401,"msg":"登录已失效，请重新登录"}
curl http://localhost:3000/api/product/list
```

---

## 1. 用户模块

```bash
# 当前用户信息
curl http://localhost:3000/api/user/info -H "Authorization: Bearer $TOKEN"

# 用户分页列表（仅管理员）
curl "http://localhost:3000/api/user/list?pageNum=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN"

# 按职位筛选
curl "http://localhost:3000/api/user/list?pageNum=1&pageSize=10&position=收银员" \
  -H "Authorization: Bearer $TOKEN"
```

**验证点：返回列表中不得出现 `password` 字段。**

```bash
# 新增用户（role 由 position 自动映射为 operator）
curl -X POST http://localhost:3000/api/user \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"username":"zhaoliu","realName":"赵六","position":"收银员","phone":"13900000007","salary":5500,"status":1}'

# 重复账号 → {"code":400,"msg":"登录账号已存在"}
curl -X POST http://localhost:3000/api/user \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"username":"zhaoliu","realName":"赵六","position":"收银员"}'

# 账号格式非法 → {"code":400,"msg":"账号格式不正确（3-20 位字母/数字/下划线）"}
curl -X POST http://localhost:3000/api/user \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"username":"ab","position":"仓管"}'

# 编辑用户（username 不可改，role 随 position 重映射）
curl -X PUT http://localhost:3000/api/user \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id":7,"realName":"赵六","position":"后勤","phone":"13900000007","salary":6000,"status":1}'

# 删除自己 → {"code":400,"msg":"不能删除当前登录账号"}
curl -X DELETE http://localhost:3000/api/user/1 -H "Authorization: Bearer $TOKEN"

# 重置密码
curl -X POST http://localhost:3000/api/user/reset-password \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id":7,"newPassword":"123456"}'

# 修改本人密码
curl -X POST http://localhost:3000/api/user/password \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"oldPassword":"123456","newPassword":"abc123"}'

# 更新个人资料（salary/position/role 会被忽略）
curl -X PUT http://localhost:3000/api/user/profile \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"realName":"系统管理员","gender":"男","phone":"13900000001","address":"浙江省杭州市西湖区","salary":99999,"position":"管理员"}'
```

---

## 2. 商品分类模块

```bash
# 全量列表（按 sort 升序）
curl http://localhost:3000/api/category/list -H "Authorization: Bearer $TOKEN"

# 新增
curl -X POST http://localhost:3000/api/category \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"母婴用品","colorToken":"var(--chart-6)","description":"奶粉、纸尿裤等","sort":6,"status":1}'

# 重名 → {"code":400,"msg":"分类名称已存在"}
curl -X POST http://localhost:3000/api/category \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"饮料乳品"}'

# 编辑
curl -X PUT http://localhost:3000/api/category \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id":6,"name":"母婴用品","colorToken":"var(--chart-6)","description":"奶粉、纸尿裤等","sort":6,"status":1}'

# 删除有商品的分类 → {"code":400,"msg":"该分类下存在商品，无法删除"}
curl -X DELETE http://localhost:3000/api/category/1 -H "Authorization: Bearer $TOKEN"

# 删除空分类（应成功）
curl -X DELETE http://localhost:3000/api/category/6 -H "Authorization: Bearer $TOKEN"
```

---

## 3. 商品档案模块

```bash
# 分页列表（含 categoryName / supplierName）
curl "http://localhost:3000/api/product/list?pageNum=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN"

# 带筛选
curl "http://localhost:3000/api/product/list?pageNum=1&pageSize=10&productName=农夫&categoryId=1&status=1" \
  -H "Authorization: Bearer $TOKEN"

# 详情
curl http://localhost:3000/api/product/1 -H "Authorization: Bearer $TOKEN"

# 新增（条码留空 → 后端自动生成 690 + 10 位序号）
# 注意：库存不能通过商品接口设置，新建商品库存固定为 0、status=0
curl -X POST http://localhost:3000/api/product \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"productName":"雀巢咖啡 268ml","categoryId":1,"spec":"268ml","unit":"罐","costPrice":4.0,"salePrice":6.5,"warnNum":20,"supplierId":1}'

# 销售价为 0 → {"code":400,"msg":"销售单价必须大于 0"}
curl -X POST http://localhost:3000/api/product \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"productName":"测试商品","categoryId":1,"salePrice":0,"stockNum":10}'

# 期初成本为负 → {"code":400,"msg":"成本价不能为负"}
curl -X POST http://localhost:3000/api/product \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"productName":"测试商品","categoryId":1,"salePrice":5,"costPrice":-1,"stockNum":10}'

# 期初入库（新建商品后再入库；入库后库存 > 0 自动上架）
curl -X POST http://localhost:3000/api/stock/inbound \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"productId":17,"quantity":100,"inboundPrice":4.0,"remark":"期初入库"}'

# 编辑（不传 costPrice，或传当前成本原值）
curl -X PUT http://localhost:3000/api/product \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id":17,"productCode":"6900000000017","productName":"雀巢咖啡 268ml","categoryId":1,"spec":"268ml","unit":"罐","salePrice":7.0,"warnNum":20,"supplierId":1,"status":1}'

# 编辑时修改成本 → {"code":400,"msg":"成本价由入库自动计算，不能手工修改"}
curl -X PUT http://localhost:3000/api/product \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id":17,"productCode":"6900000000017","productName":"雀巢咖啡 268ml","categoryId":1,"spec":"268ml","unit":"罐","costPrice":5.0,"salePrice":7.0,"warnNum":20,"supplierId":1,"status":1}'

# 删除有业务记录的商品 → {"code":400,"msg":"该商品存在业务记录，无法删除"}
curl -X DELETE http://localhost:3000/api/product/1 -H "Authorization: Bearer $TOKEN"
```

---

## 4. 供应商模块

```bash
# 分页列表
curl "http://localhost:3000/api/supplier/list?pageNum=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN"

# 下拉选项
curl http://localhost:3000/api/supplier/options -H "Authorization: Bearer $TOKEN"

# 新增
curl -X POST http://localhost:3000/api/supplier \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"supplierName":"统一企业","contactPerson":"陈经理","phone":"13800000008","address":"上海市","remark":""}'

# 手机号格式错误 → {"code":400,"msg":"手机号格式不正确"}
curl -X POST http://localhost:3000/api/supplier \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"supplierName":"测试供应商","phone":"123"}'

# 删除被商品引用的供应商 → {"code":400,"msg":"该供应商下存在关联商品，无法删除"}
curl -X DELETE http://localhost:3000/api/supplier/1 -H "Authorization: Bearer $TOKEN"
```

---

## 5. 库存管理模块（核心）

```bash
# 库存统计
curl http://localhost:3000/api/stock/statistics -H "Authorization: Bearer $TOKEN"

# 预警商品（缺货在前）
curl http://localhost:3000/api/stock/warn/list -H "Authorization: Bearer $TOKEN"
curl "http://localhost:3000/api/stock/warn/list?warnStatus=2" -H "Authorization: Bearer $TOKEN"

# 入库明细
curl "http://localhost:3000/api/stock/inbound/list?pageNum=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN"

# 出库明细
curl "http://localhost:3000/api/stock/outbound/list?pageNum=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN"

# 出入库流水（可按商品 / 类型 / 时间筛选）
# 只看销售退货流水（bizType=3）
curl "http://localhost:3000/api/stock/log/list?pageNum=1&pageSize=10&bizType=3" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:3000/api/stock/log/list?pageNum=1&pageSize=10&productId=1&changeType=1" \
  -H "Authorization: Bearer $TOKEN"
```

### 入库（事务：加库存 + 写流水）

```bash
# 记录入库前库存
curl http://localhost:3000/api/product/1 -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:3000/api/stock/inbound \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"productId":1,"supplierId":1,"quantity":100,"inboundPrice":1.2,"remark":"补货"}'

# 验证：商品 1 库存 +100；流水新增一条 changeType=1，
#      beforeNum/afterNum 与前后库存一致，supplierName 已回填
curl http://localhost:3000/api/product/1 -H "Authorization: Bearer $TOKEN"
curl "http://localhost:3000/api/stock/log/list?pageNum=1&pageSize=1&productId=1" \
  -H "Authorization: Bearer $TOKEN"

# 数量为 0 → {"code":400,"msg":"入库数量必须大于 0"}
curl -X POST http://localhost:3000/api/stock/inbound \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"productId":1,"quantity":0}'

# 商品不存在 → {"code":400,"msg":"商品不存在"}
curl -X POST http://localhost:3000/api/stock/inbound \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"productId":99999,"quantity":10}'
```

### 出库（事务：校验库存 → 减库存 + 写流水）

```bash
# 正常出库
curl -X POST http://localhost:3000/api/stock/outbound \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"productId":3,"quantity":5,"remark":"报损出库"}'

# 库存不足 → {"code":400,"msg":"出库数量大于当前库存"}
# 验证：报错后商品库存与流水均无变化（事务回滚）
curl -X POST http://localhost:3000/api/stock/outbound \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"productId":3,"quantity":999999,"remark":"超量测试"}'
curl http://localhost:3000/api/product/3 -H "Authorization: Bearer $TOKEN"
```

---

## 6. 销售管理模块（核心）

### 提交销售（一个事务写 4 张表）

```bash
# 记录结账前库存
curl http://localhost:3000/api/product/1 -H "Authorization: Bearer $TOKEN"
curl http://localhost:3000/api/product/2 -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:3000/api/sale/record \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"items":[{"productId":1,"quantity":2,"salePrice":2},{"productId":2,"quantity":1,"salePrice":3.5}],"payType":1,"remark":""}'
```

预期返回：

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

**验证点：**
1. 商品 1 库存 -2、商品 2 库存 -1；
2. `sale_record` 新增一张单（status=1），`sale_item` 新增两行明细（含 productName / categoryName / costPrice 冗余快照）；
3. `stock_log` 新增两条 changeType=2 的流水；
4. `totalAmount` = 2×2 + 3.5×1 = 7.5；
5. 请求体里的 `salePrice` 不参与计价：即使传 0.01，`sale_item.sale_price` 与 `totalAmount` 仍取商品表 `sale_price`。

```bash
# 收银价篡改：salePrice 传 0.01，后端仍按商品表价格计价
curl -X POST http://localhost:3000/api/sale/record \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"items":[{"productId":1,"quantity":1,"salePrice":0.01}],"payType":1}'
# 预期 data.totalAmount = 商品 1 在 product 表中的 sale_price
```

```bash
# 库存不足 → {"code":400,"msg":"商品 山东红富士苹果 库存不足"}
# 验证：整单回滚，不产生部分扣减
curl -X POST http://localhost:3000/api/sale/record \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"items":[{"productId":1,"quantity":1},{"productId":13,"quantity":999999}],"payType":1}'

# 商品已下架 → {"code":400,"msg":"商品 维达抽纸 3 层 已下架"}
curl -X POST http://localhost:3000/api/sale/record \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"items":[{"productId":8,"quantity":1}],"payType":1}'

# 空明细 → {"code":400,"msg":"销售商品不能为空"}
curl -X POST http://localhost:3000/api/sale/record \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"items":[],"payType":1}'
```

### 销售记录查询

```bash
# 分页列表（不含明细）
curl "http://localhost:3000/api/sale/record/list?pageNum=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN"

# 带筛选
curl "http://localhost:3000/api/sale/record/list?pageNum=1&pageSize=10&payType=1&saleNo=XS" \
  -H "Authorization: Bearer $TOKEN"

# 详情（含 items）
curl http://localhost:3000/api/sale/record/1001 -H "Authorization: Bearer $TOKEN"

# 单据不存在 → {"code":400,"msg":"销售单据不存在"}
curl http://localhost:3000/api/sale/record/99999 -H "Authorization: Bearer $TOKEN"

# 按商品查销售明细
curl "http://localhost:3000/api/sale/item/list?productId=1&pageNum=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN"
```

### 退货 / 作废

```bash
OPTOKEN=$(curl -s -X POST http://localhost:3000/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"shouyin01","password":"123456"}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

# ---- 独立整单退货单（收银员申请 → 管理员确认）----
# 1) 收银员发起退货申请：只生成退货单，不动库存 / 营收
curl -X POST http://localhost:3000/api/sale/return \
  -H "Authorization: Bearer $OPTOKEN" -H "Content-Type: application/json" \
  -d '{"saleNo":"XS20261011-003","remark":"顾客整单退货"}'
# → {"code":200,"data":{"id":1,"returnNo":"TH20261011-001",...}}

# 2) 收银员不能确认 → {"code":403,"msg":"无权限执行该操作"}
curl -X POST http://localhost:3000/api/sale/return/1/confirm \
  -H "Authorization: Bearer $OPTOKEN"

# 3) 管理员确认：回补库存 + 原单置为已退货（冲减营收）+ 写 bizType=3 流水
curl -X POST http://localhost:3000/api/sale/return/1/confirm \
  -H "Authorization: Bearer $TOKEN"

# 4) 退货单详情 / 列表
curl http://localhost:3000/api/sale/return/1 -H "Authorization: Bearer $TOKEN"
curl "http://localhost:3000/api/sale/return/list?status=1&pageNum=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN"

# 5) 重复申请 → {"code":400,"msg":"该单据已退货"}
curl -X POST http://localhost:3000/api/sale/return \
  -H "Authorization: Bearer $OPTOKEN" -H "Content-Type: application/json" \
  -d '{"saleNo":"XS20261011-003"}'

# ---- 兼容入口：管理员直接退货（内部创建退货单并立即确认）----
curl -X POST http://localhost:3000/api/sale/record/return \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"saleNo":"XS20261011-001"}'

# ---- 销售作废：回补库存 + 写 bizType=8「作废回补」流水 ----
curl -X POST http://localhost:3000/api/sale/record/void \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"saleNo":"XS20261011-002"}'

# 已退货/已作废再作废 → {"code":400,"msg":"该单据已作废"}
curl -X POST http://localhost:3000/api/sale/record/void \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"saleNo":"XS20261011-002"}'

# 操作员调用作废 → {"code":403,"msg":"无权限执行该操作"}
curl -X POST http://localhost:3000/api/sale/record/void \
  -H "Authorization: Bearer $OPTOKEN" -H "Content-Type: application/json" \
  -d '{"saleNo":"XS20261011-003"}'
```

> 流水区分：销售退货 `bizType=3`（销售退货）、销售作废 `bizType=8`（作废回补）。

### 销售统计聚合

```bash
# 默认近 7 天
curl http://localhost:3000/api/sale/statistics -H "Authorization: Bearer $TOKEN"

# 指定区间与筛选
curl "http://localhost:3000/api/sale/statistics?startTime=2026-10-01&endTime=2026-10-12&categoryId=1" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:3000/api/sale/statistics?productName=农夫山泉 550ml" \
  -H "Authorization: Bearer $TOKEN"
```

**验证点：**
1. `dailyTrend` 补齐区间内每一天，无销售日为 0；
2. `summary.totalAmount = Σ amount`，`totalProfit = totalAmount - totalCost`；
3. 已退货（status=2）、已作废（status=3）的单据不计入；
4. `productStats[].rate` = `profit / amount × 100`，amount 为 0 时为 0。

---

## 7. 仪表盘模块

```bash
# 运营总览
curl http://localhost:3000/api/dashboard/overview -H "Authorization: Bearer $TOKEN"

# 近 7 日销售趋势（date 为 MM-DD，按日期升序）
curl "http://localhost:3000/api/dashboard/sale-trend?days=7" -H "Authorization: Bearer $TOKEN"

# 库存余量 TOP5
curl http://localhost:3000/api/dashboard/stock-top -H "Authorization: Bearer $TOKEN"

# 各分类库存占比
curl http://localhost:3000/api/dashboard/category-stock -H "Authorization: Bearer $TOKEN"

# 热销商品 TOP5（近 30 天）
curl http://localhost:3000/api/dashboard/hot-products -H "Authorization: Bearer $TOKEN"
```

**验证点：**
1. `overview` 的 `*-Trend` 均为 8 个采样点；环比可为负值；
2. `productKindCount` = 商品表总记录数；
3. `warnProductCount` = `0 < stockNum < warnNum` 的商品数，`pendingStockCount` = `stockNum < warnNum` 的商品数。

---

## 8. 退出登录（token 立即失效）

```bash
curl -X POST http://localhost:3000/api/user/logout -H "Authorization: Bearer $TOKEN"

# 再次使用同一 token → {"code":401,"msg":"登录已失效，请重新登录"}
curl http://localhost:3000/api/user/info -H "Authorization: Bearer $TOKEN"
```

---

## 9. 权限矩阵快速自测

```bash
# 以收银员（operator）身份登录
OPTOKEN=$(curl -s -X POST http://localhost:3000/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"shouyin01","password":"123456"}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

# ✅ 可以：商品只读
curl "http://localhost:3000/api/product/list?pageNum=1&pageSize=5" -H "Authorization: Bearer $OPTOKEN"
# ✅ 可以：销售结账
curl -X POST http://localhost:3000/api/sale/record \
  -H "Authorization: Bearer $OPTOKEN" -H "Content-Type: application/json" \
  -d '{"items":[{"productId":1,"quantity":1}],"payType":1}'
# ✅ 可以：入库 / 出库
curl -X POST http://localhost:3000/api/stock/inbound \
  -H "Authorization: Bearer $OPTOKEN" -H "Content-Type: application/json" \
  -d '{"productId":1,"quantity":5}'

# ❌ 403：商品增删改
curl -X POST http://localhost:3000/api/product \
  -H "Authorization: Bearer $OPTOKEN" -H "Content-Type: application/json" \
  -d '{"productName":"越权测试","categoryId":1,"salePrice":5,"stockNum":10}'
# ❌ 403：用户管理
curl "http://localhost:3000/api/user/list?pageNum=1&pageSize=5" -H "Authorization: Bearer $OPTOKEN"
# ❌ 403：销售退货
curl -X POST http://localhost:3000/api/sale/record/return \
  -H "Authorization: Bearer $OPTOKEN" -H "Content-Type: application/json" \
  -d '{"saleNo":"XS20261011-001"}'
```

---

## 10. 数据库层核验

若需直接核对「库存 + 流水」一致性，可执行：

```sql
-- 每个商品的最后一条流水 after_num 应与当前库存一致（账实相符）
SELECT p.id, p.product_name, p.stock_num,
       (SELECT l.after_num FROM stock_log l
        WHERE l.product_id = p.id
        ORDER BY l.create_time DESC, l.id DESC LIMIT 1) AS last_after_num
FROM product p
HAVING last_after_num IS NOT NULL AND last_after_num <> p.stock_num;
-- 预期：本次操作涉及的商品该查询应返回空集

-- 流水变动量自洽性检查：after_num - before_num 应等于 ±quantity
SELECT * FROM stock_log
WHERE (change_type = 1 AND after_num - before_num <> quantity)
   OR (change_type = 2 AND before_num - after_num <> quantity);
-- 预期：空集
```
