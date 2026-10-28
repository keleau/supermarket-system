const test = require('node:test');
const assert = require('node:assert/strict');

const stockModel = require('../models/stockModel');
const { pool } = require('../db/pool');
const { STOCK_BIZ, STOCK_BIZ_LABELS } = require('../utils/stockBiz');

function fakeConn(rows = [{ affectedRows: 1 }]) {
  const calls = [];
  return {
    calls,
    async execute(sql, params) {
      calls.push({ sql, params });
      return [rows];
    },
  };
}

test.after(() => pool.end());

test('业务类型常量覆盖采购、销售、退货、盘点、期初和手工调整', () => {
  assert.equal(STOCK_BIZ.PURCHASE_IN, 1);
  assert.equal(STOCK_BIZ.SALE_OUT, 2);
  assert.equal(STOCK_BIZ.SALE_RETURN, 3);
  assert.equal(STOCK_BIZ.STOCKTAKE_GAIN, 4);
  assert.equal(STOCK_BIZ.STOCKTAKE_LOSS, 5);
  assert.equal(STOCK_BIZ.OPENING, 6);
  assert.equal(STOCK_BIZ.MANUAL_ADJUST, 7);
  assert.equal(STOCK_BIZ_LABELS[STOCK_BIZ.SALE_RETURN], '销售退货');
});

test('写入库存流水时带上业务类型', async () => {
  const conn = fakeConn();
  await stockModel.insertLog(conn, {
    productId: 7,
    changeType: 1,
    bizType: STOCK_BIZ.SALE_RETURN,
    quantity: 2,
    beforeNum: 10,
    afterNum: 12,
    operator: '测试',
    remark: '销售退货 XS001',
  });

  assert.equal(conn.calls.length, 1);
  assert.match(conn.calls[0].sql, /biz_type/);
  assert.equal(conn.calls[0].params[2], STOCK_BIZ.SALE_RETURN);
});

test('首次入库判断只查询入库流水', async () => {
  const conn = fakeConn([{ id: 1 }]);
  const result = await stockModel.hasInbound(conn, 7);

  assert.equal(result, true);
  assert.match(conn.calls[0].sql, /change_type = 1/);
  assert.deepEqual(conn.calls[0].params, [7]);
});
