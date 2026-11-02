/**
 * 当前操作人
 * 一律从 token 解析，不接受前端传值（防伪造）。
 */
function operatorName(req) {
  return req.user.realName || req.user.username || '';
}

module.exports = { operatorName };
