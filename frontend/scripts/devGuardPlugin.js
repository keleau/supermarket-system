/**
 * 开发服务器守护插件（仅 npm run dev 生效，生产构建不受影响）
 *
 * 解决两个痛点：
 * 1. 【单实例】启动前自动清理残留 node 进程对开发端口的占用，保证始终只有一个服务器、固定 5173 端口
 * 2. 【随页关闭】仅统计"本项目页面"：页面打开时与服务器建立一条 SSE 长连接，
 *    当且仅当本项目（localhost:5173）的全部标签页关闭/跳走后，连接归零，约 8 秒后服务器自动退出。
 *    浏览器里开着其他网站（百度、文档等）与本机制完全无关，不会影响判断。
 *
 * 为什么用 SSE 长连接而不是定时心跳：
 * - 浏览器对后台标签页的定时器有激进节流（挂起数分钟后 setInterval 可能被压到 1 分钟 1 次，
 *   Web Worker 也不能完全幸免），8 秒心跳超时在"切到别的标签看资料"时会误杀；
 * - SSE 是已建立的 TCP 长连接，后台标签不会断开，服务器可直接感知连接的建立与关闭，
 *   既精确（只数本项目页面）又不需要客户端定时器。
 *
 * 多标签页：服务器对连接做引用计数，必须是最后一个本项目页面离线才进入关停倒计时；
 * 页面刷新导致的瞬断在 8 秒宽限窗口内，新连接到达即取消倒计时，不会误杀。
 */
import { execSync } from 'node:child_process'

/** 开发服务器固定端口（与 vite.config.js 的 server.port 保持一致） */
const DEV_PORT = 5173

/** 本项目页面保活长连接地址（SSE） */
const GUARD_URL = '/__dev-guard'

/** 本项目全部页面离线后，等待多久自动退出（容忍页面刷新的瞬断） */
const SHUTDOWN_DELAY = 8000

/** 长连接保活帧间隔：周期性写入，顺便探测半开连接 */
const KEEPALIVE_INTERVAL = 20000

/** 注入到每个本项目页面的保活脚本（挂到 head） */
const guardClientCode = `
// 【dev 守护】与开发服务器保持长连接，标记"本项目页面在线"；
// 本项目的全部标签页关闭后，服务器会自动停止（其他网站页面不受影响、也不参与计数）
try {
  var __devGuard = new EventSource('${GUARD_URL}')
} catch (e) {}
`

/**
 * 清理占用开发端口的残留 node 进程（排除当前进程自身）。
 * 只杀 node.exe，端口被其他程序占用时仅提示、不误杀。
 */
function cleanStalePort(port) {
  // 仅 Windows 处理；其他系统 vite 自身能正确复用/提示端口
  if (process.platform !== 'win32') return
  try {
    const output = execSync('netstat -ano -p tcp', { encoding: 'utf8' })
    const stalePids = new Set()

    for (const line of output.split('\n')) {
      // 行格式：TCP    0.0.0.0:5173    0.0.0.0:0    LISTENING    12345
      const cols = line.trim().split(/\s+/)
      if (cols.length >= 5 && cols[3] === 'LISTENING' && cols[1].endsWith(`:${port}`)) {
        const pid = Number(cols[4])
        // 排除当前进程自身（防止配置热重启时误杀自己）
        if (pid && pid !== process.pid) stalePids.add(pid)
      }
    }

    for (const pid of stalePids) {
      try {
        const info = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' })
        const imageName = (info.split(',')[0] || '').replace(/"/g, '').trim().toLowerCase()
        if (imageName === 'node.exe') {
          execSync(`taskkill /PID ${pid} /F`)
          console.log(`[dev-guard] 已自动停止残留的旧开发服务器进程 (PID ${pid})`)
        } else {
          console.log(`[dev-guard] 端口 ${port} 被非 node 程序占用 (${imageName || '未知'})，跳过清理`)
        }
      } catch {
        /* 目标进程可能恰好已退出，忽略 */
      }
    }
  } catch {
    /* netstat 执行失败时交给 vite 自身的端口冲突逻辑兜底 */
  }
}

/** Vite 插件：开发服务器守护 */
export function devServerGuard() {
  return {
    name: 'dev-server-guard',
    // 只在 dev server 生效，build/preview 完全不受影响
    apply: 'serve',

    config() {
      // 启动前清理旧实例，保证固定端口、单实例
      cleanStalePort(DEV_PORT)
    },

    // 往本项目页面注入保活长连接脚本
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: guardClientCode,
          injectTo: 'head',
        },
      ]
    },

    configureServer(server) {
      /** 当前在线的本项目页面连接数（引用计数：多标签全部关闭才允许停服） */
      let clientCount = 0
      /** 关停倒计时句柄；宽限期内有新页面连入则取消 */
      let shutdownTimer = null

      function clearShutdownTimer() {
        if (shutdownTimer) {
          clearTimeout(shutdownTimer)
          shutdownTimer = null
        }
      }

      function scheduleShutdown() {
        if (shutdownTimer) return
        shutdownTimer = setTimeout(() => {
          shutdownTimer = null
          // 倒计时结束时仍无任何本项目页面连接，才真正退出
          if (clientCount === 0) {
            console.log('\n[dev-guard] 本项目的页面已全部关闭，开发服务器已自动停止。')
            console.log('[dev-guard] 需要继续开发请重新执行 npm run dev')
            process.exit(0)
          }
        }, SHUTDOWN_DELAY)
      }

      server.middlewares.use((req, res, next) => {
        // 仅响应本项目页面的保活长连接，其他请求原样放行
        if (!req.url || !req.url.startsWith(GUARD_URL)) {
          next()
          return
        }

        // 一个本项目页面上线：计数 +1，若正在关停倒计时则取消（页面刷新/新开场景）
        clientCount += 1
        clearShutdownTimer()

        // 建立 SSE 长连接
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        })
        res.write(': connected\n\n')

        // 周期保活帧：保持链路活跃并探测半开连接
        const keepalive = setInterval(() => {
          try {
            res.write(': ping\n\n')
          } catch {
            /* 写入失败交给 close 事件统一清理 */
          }
        }, KEEPALIVE_INTERVAL)

        // 页面关闭 / 跳走 / 刷新时浏览器断开底层连接。
        // 注意：必须监听 res 的 close —— GET 请求没有请求体，req（读取流）在接收完成后
        // 会自然触发 close，与连接是否断开无关；而 SSE 响应从不 res.end()，
        // 因此 res 的 close 只可能在底层连接真正终止时触发。
        let closed = false
        const onClose = () => {
          if (closed) return
          closed = true
          clearInterval(keepalive)
          clientCount = Math.max(0, clientCount - 1)
          // 最后一个本项目页面离线 → 进入宽限倒计时
          if (clientCount === 0) scheduleShutdown()
        }
        res.on('close', onClose)
        res.on('error', onClose)
        req.on('error', onClose)
      })

      // 服务器正常关闭（Ctrl+C / 配置热重启）时无需额外处理，进程退出即清理一切

      // 内部中间件安装完成后打印使用提示
      return () => {
        console.log(
          `[dev-guard] 关闭本项目（localhost:${DEV_PORT}）的全部页面后约 ${SHUTDOWN_DELAY / 1000} 秒，本服务器会自动停止`,
        )
        console.log('[dev-guard] 其他网站的标签页不参与判断；多标签页需全部关闭才会停止')
      }
    },
  }
}
