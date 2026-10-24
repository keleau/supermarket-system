const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const loginRateLimit = require('../middleware/loginRateLimit');

test('同一 IP 每分钟第 6 次登录尝试返回 code 429', async (t) => {
  const app = express();
  app.use(express.json());
  app.post('/login', loginRateLimit, (req, res) => {
    res.json({ code: 200, msg: 'success', data: null });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const send = async () => {
    const res = await fetch(`http://127.0.0.1:${port}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return res.json();
  };

  for (let i = 0; i < 5; i += 1) {
    assert.equal((await send()).code, 200);
  }

  const blocked = await send();
  assert.equal(blocked.code, 429);
  assert.equal(blocked.data, null);
  assert.match(blocked.msg, /频繁/);
});
