# 超市管家 · 前端

Vue 3 + Vite + Element Plus + Pinia + Vue Router + Axios + ECharts 实现的超市后台管理前端。

## 启动

```bash
npm install
npm run dev      # 默认 http://localhost:5173
npm run build    # 生产构建
```

后端需先按根目录 README 启动，并在 `.env` 中配置接口代理目标（默认 `http://localhost:3000`）。

## 测试

```bash
npm run test:e2e   # 连续点击 E2E，自动创建临时数据库与独立端口
```

## 文档

- [项目总览与启动说明](../README.md)
- [接口契约（唯一权威）](../backend/api.md)
- [前端接口对接指南](./前端接口对接文档.md)
