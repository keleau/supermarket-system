import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
// 开发服务器守护：启动前清理残留实例 + 关闭网页后自动停服
import { devServerGuard } from './scripts/devGuardPlugin.js'

// E2E 可以用独立端口 + 独立后端，不碰本地 5173/3000
const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), devServerGuard()],
  resolve: {
    // 路径别名：@ 指向 src 目录
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // 端口被占时直接报错退出（守护插件会先清理残留实例），保证不静默跳到 5174 等其他端口
    strictPort: true,
    proxy: {
      // 所有 /api 开头的请求代理到 Node 后端（后端端口按实际情况修改）
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})
