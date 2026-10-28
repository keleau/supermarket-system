const test = require('node:test');
const assert = require('node:assert/strict');

const { writeLog } = require('../utils/operationLog');
const { pool } = require('../db/pool');

function fakeConn() {
  const calls = [];
  return {
    calls,
    async execute(sql, params) {
      calls.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  };
}

test.after(() => pool.end());

test('写入操作日志包含操作人、模块、动作和业务单号', async () => {
  const conn = fakeConn();
  const req = {
    user: { id: 7, username: 'cashier', role: 'operator', position: '收银员' },
    ip: '127.0.0.1',
  };

  await writeLog(conn, req, {
    module: 'sale',
    action: 'create',
    bizNo: 'XS20261028-001',
    afterStatus: 1,
    detail: '销售开单',
  });

  assert.equal(conn.calls.length, 1);
  assert.match(conn.calls[0].sql, /operation_log/);
  assert.equal(conn.calls[0].params[0], 7);
  assert.equal(conn.calls[0].params[1], 'cashier');
  assert.equal(conn.calls[0].params[4], 'sale');
  assert.equal(conn.calls[0].params[5], 'create');
  assert.equal(conn.calls[0].params[6], 'XS20261028-001');
  assert.equal(conn.calls[0].params[10], '127.0.0.1');
});
