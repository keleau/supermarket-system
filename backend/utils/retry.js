/**
 * 单号生成重试
 *
 * 当日单号由「查询最大序号 + 1」生成，并发下可能撞唯一索引；
 * 捕获 MySQL ER_DUP_ENTRY 后重新执行整个事务（handler 内部会重新生成单号）。
 */
const { BizError } = require('./result');

async function retryOnDuplicate(handler, conflictMessage, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await handler();
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        if (attempt < retries) continue;
        throw new BizError(conflictMessage);
      }
      throw err;
    }
  }
}

module.exports = { retryOnDuplicate };
