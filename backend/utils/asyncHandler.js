/**
 * 异步 Controller 包装器
 * Express 5 已能自动捕获 async 抛错，此处显式包装以兼容并让意图更清晰。
 */
module.exports = function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
