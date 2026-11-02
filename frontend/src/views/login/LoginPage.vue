<script setup>
/**
 * 登录页
 * - 左侧深色品牌展示区（桌面端），右侧登录表单
 * - 提交调用 POST /api/user/login，成功后写入 token 与用户资料并跳转
 * - 进页面时静默探测 GET /api/health，后端未启动时给出连通性提示
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { checkHealth } from '@/api/modules/auth'
import { useUserStore } from '@/store/user'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const loginFormRef = ref()
const passwordInputRef = ref()
const loading = ref(false)

/** 后端连通性：null 检测中 / true 正常 / false 异常 */
const backendOnline = ref(null)

const loginForm = reactive({
  username: '',
  password: '',
})

/** 轻量表单校验规则：仅非空，业务校验一律交给后端 */
const loginRules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

/** 品牌区特性条目 */
const features = [
  { icon: 'Warning', title: '库存实时预警', desc: '低于阈值自动提醒，缺货早知道' },
  { icon: 'Tickets', title: '出入库自动留痕', desc: '每一笔变动生成可追溯流水' },
  { icon: 'UserFilled', title: '多角色协同', desc: '管理员与仓管权限分明' },
]

/** 时间问候语：按打开页面时刻静态计算一次，不做时钟轮询 */
const hour = new Date().getHours()
const greeting =
  hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'

/** 品牌数据速览（品牌宣传口径，非实时业务数据） */
const brandStats = [
  { value: '5', unit: '', label: '大品类全覆盖' },
  { value: '100', unit: '%', label: '变动可追溯' },
]

/**
 * 品牌区漂浮粒子：进页面时随机生成一次，纯装饰。
 * 约 2/3 粒子偏置到左下与下部黑场区域，其余散布全屏
 */
const particles = Array.from({ length: 22 }, (_, i) => {
  const isWhite = i % 5 === 0
  const inVoid = i < 14
  const x = inVoid ? Math.round(Math.random() * 58 + 4) : Math.round(Math.random() * 88 + 5)
  const y = inVoid ? Math.round(Math.random() * 44 + 50) : Math.round(Math.random() * 84 + 8)
  return {
    id: i,
    x,
    y,
    s: isWhite ? 4.5 : Math.random() > 0.5 ? 3.5 : 2.5,
    c: isWhite ? 'rgba(255, 255, 255, 0.8)' : 'rgba(94, 224, 176, 0.8)',
    g: isWhite ? 'rgba(255, 255, 255, 0.5)' : 'rgba(79, 208, 162, 0.6)',
    dur: Math.round((7 + Math.random() * 8) * 10) / 10,
    delay: Math.round(Math.random() * 10 * 10) / 10,
    amp: Math.round(18 + Math.random() * 30),
  }
})

/** 演示账号快捷入口：只填用户名，密码由用户输入，改密后不会填入旧密码 */
const DEMO_ACCOUNTS = [
  { username: 'admin', label: '管理员', icon: 'User' },
  { username: 'cangku01', label: '仓管', icon: 'Box' },
  { username: 'shouyin01', label: '收银员', icon: 'Tickets' },
]

/** 一键填入演示账号用户名，清空密码并聚焦密码框 */
function fillAccount(account) {
  loginForm.username = account.username
  loginForm.password = ''
  passwordInputRef.value?.focus()
}

/** 探测后端是否可用 */
async function probeBackend() {
  try {
    await checkHealth()
    backendOnline.value = true
  } catch {
    backendOnline.value = false
  }
}

/** 品牌区系统状态徽标（复用后端探测结果） */
const sysStatus = computed(() =>
  backendOnline.value === null
    ? { text: '检测中', cls: '' }
    : backendOnline.value
      ? { text: '系统运行中', cls: 'is-online' }
      : { text: '后端离线', cls: 'is-offline' },
)

onMounted(probeBackend)

async function handleLogin() {
  if (!loginFormRef.value) return
  const valid = await loginFormRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await userStore.login({
      username: loginForm.username.trim(),
      password: loginForm.password,
    })
    ElMessage.success(`登录成功，欢迎回来，${userStore.displayName}`)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    router.replace(redirect)
  } catch {
    // 失败文案由 request 拦截器统一弹出（如「账号或密码错误」「该账号已被禁用」）
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <!-- ========== 左侧品牌展示区（小屏隐藏） ========== -->
    <section class="brand-panel">
      <div class="brand-glow" aria-hidden="true"></div>
      <div class="brand-grid" aria-hidden="true"></div>
      <div class="brand-particles" aria-hidden="true">
        <span
          v-for="p in particles"
          :key="p.id"
          class="particle"
          :style="{
            left: p.x + '%',
            top: p.y + '%',
            width: p.s + 'px',
            height: p.s + 'px',
            background: p.c,
            boxShadow: '0 0 12px ' + p.g,
            '--dur': p.dur + 's',
            '--delay': p.delay + 's',
            '--amp': p.amp + 'px',
          }"
        ></span>
      </div>

      <div class="brand-content">
        <div class="brand-logo login-stagger" style="--stagger: 0">
          <div class="brand-mark">
            <el-icon :size="20"><Goods /></el-icon>
          </div>
          <span class="brand-name">超市管家</span>
          <span class="sys-status" :class="sysStatus.cls">
            <i class="sys-dot"></i>{{ sysStatus.text }}
          </span>
        </div>

        <h1 class="brand-headline login-stagger" style="--stagger: 1">
          让每一件商品的
          <br />
          <em>进出流转</em>都清晰可溯
        </h1>
        <p class="brand-subtitle login-stagger" style="--stagger: 2">
          面向超市日常运营的商品库存管理平台，覆盖商品、库存、供应商全链路。
        </p>

        <!-- 品牌数据速览：宣传口径大数字，替代原货架插画 -->
        <div class="brand-stats login-stagger" style="--stagger: 3">
          <div v-for="stat in brandStats" :key="stat.label" class="stat-item">
            <div class="stat-value">
              {{ stat.value }}<span v-if="stat.unit" class="stat-unit">{{ stat.unit }}</span>
            </div>
            <div class="stat-label">{{ stat.label }}</div>
          </div>
        </div>

        <ul class="feature-list">
          <li
            v-for="(item, index) in features"
            :key="item.title"
            class="feature-item login-stagger"
            :style="{ '--stagger': index + 4 }"
          >
            <div class="feature-icon">
              <el-icon :size="18"><component :is="item.icon" /></el-icon>
            </div>
            <div class="feature-text">
              <span class="feature-title">{{ item.title }}</span>
              <span class="feature-desc">{{ item.desc }}</span>
            </div>
          </li>
        </ul>
      </div>

      <div class="brand-footer login-stagger" :style="{ '--stagger': 7 }">
        © 2026 超市商品管理系统 · 毕业设计作品
      </div>
    </section>

    <!-- ========== 右侧登录表单区 ========== -->
    <section class="form-panel">
      <div class="card-zone">
        <!-- 收银小票装饰：纯装饰元素 -->
        <div class="receipt" aria-hidden="true">
          <div class="receipt-body">
            <p class="rcpt-store">超市管家 · POS</p>
            <p class="rcpt-meta">NO.20261013-088</p>
            <div class="rcpt-rule"></div>
            <p class="rcpt-row"><span>鲜牛奶 500ml</span><span>×2</span><span>¥8.00</span></p>
            <p class="rcpt-row"><span>全麦吐司</span><span>×1</span><span>¥6.50</span></p>
            <p class="rcpt-row"><span>红富士苹果</span><span>×3</span><span>¥9.90</span></p>
            <div class="rcpt-rule"></div>
            <p class="rcpt-row rcpt-total"><span>合计</span><span>¥24.40</span></p>
            <div class="rcpt-barcode"></div>
            <p class="rcpt-thanks">谢谢惠顾 · 欢迎再次光临</p>
          </div>
          <div class="receipt-zigzag"></div>
        </div>

        <div class="login-card login-card-rise">
        <!-- 移动端品牌行 -->
        <div class="mobile-brand">
          <div class="brand-mark">
            <el-icon :size="18"><Goods /></el-icon>
          </div>
          <span>超市管家</span>
        </div>

        <p class="login-eyebrow">{{ greeting }}</p>
        <h2 class="login-title">欢迎登录</h2>
        <p class="login-tip">请使用分配给您的账号登录系统</p>

        <el-form
          ref="loginFormRef"
          :model="loginForm"
          :rules="loginRules"
          size="large"
          class="login-form"
          @keyup.enter="handleLogin"
        >
          <el-form-item prop="username">
            <el-input
              v-model="loginForm.username"
              placeholder="请输入账号"
              clearable
              :prefix-icon="'User'"
            />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              ref="passwordInputRef"
              v-model="loginForm.password"
              type="password"
              placeholder="请输入密码"
              show-password
              :prefix-icon="'Lock'"
            />
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary"
              class="login-btn"
              :loading="loading"
              @click="handleLogin"
            >
              {{ loading ? '登录中…' : '登 录' }}
            </el-button>
          </el-form-item>
        </el-form>

        <el-alert
          v-if="backendOnline === false"
          type="error"
          :closable="false"
          show-icon
          class="backend-alert"
          title="未连接到后端服务"
          description="请确认后端已启动（默认 http://localhost:3000），然后再试。"
        />

        <p class="login-note">点击下方账号可快速填入用户名，默认密码 123456（修改后请用新密码）</p>

        <div class="demo-accounts">
          <button
            v-for="account in DEMO_ACCOUNTS"
            :key="account.username"
            type="button"
            class="demo-chip tactile"
            :class="{ 'is-active': loginForm.username === account.username }"
            @click="fillAccount(account)"
          >
            <span class="demo-role">
              <el-icon :size="13"><component :is="account.icon" /></el-icon>
              {{ account.label }}
            </span>
            <span class="demo-cred">{{ account.username }}</span>
          </button>
        </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  height: 100vh;
  /* 右侧浅色区：极浅冷灰渐变，避免大面积平涂 */
  background: linear-gradient(
    168deg,
    var(--login-side-bg-top) 0%,
    var(--bg-page) 48%,
    var(--login-side-bg-bottom) 100%
  );
}

/* ==================== 左侧品牌区 ==================== */
.brand-panel {
  position: relative;
  width: 46%;
  min-width: 460px;
  padding: 36px 52px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  color: #fff;
  /* 墨青 → 深翠对角渐变底：告别纯黑，双色域自然过渡 */
  background-color: var(--sidebar-bg);
  background-image: linear-gradient(
    152deg,
    var(--login-brand-ink) 0%,
    var(--login-brand-teal) 34%,
    var(--login-brand-emerald-deep) 66%,
    var(--login-brand-emerald) 100%
  );
}

/* 翡翠光晕：四角氛围光（左上主光 + 右下地平线 + 左下补光 + 右上弱光）
   + 短程斜向光束，慢速呼吸（登录页专属例外，仅 opacity） */
.brand-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(
      118deg,
      transparent 30%,
      rgba(79, 208, 162, 0.04) 40%,
      rgba(79, 208, 162, 0.07) 46%,
      rgba(79, 208, 162, 0.03) 50%,
      transparent 56%
    ),
    radial-gradient(90% 46% at 12% -10%, rgba(10, 133, 94, 0.3), transparent 62%),
    radial-gradient(76% 44% at 100% 112%, rgba(10, 133, 94, 0.22), transparent 62%),
    radial-gradient(52% 36% at 4% 106%, rgba(53, 193, 149, 0.18), transparent 66%),
    radial-gradient(38% 26% at 98% 2%, var(--login-brand-cyan), transparent 70%);
  animation: glow-breathe 9s ease-in-out infinite alternate;
}

@keyframes glow-breathe {
  from {
    opacity: 0.75;
  }
  to {
    opacity: 1;
  }
}

/* 漂浮粒子：负延迟让粒子开场即处于相位中 */
.brand-particles {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.particle {
  position: absolute;
  border-radius: var(--radius-pill);
  opacity: 0;
  /* both：降级模式（单次播放）下粒子停在可见终态，不会闪没 */
  animation: particle-float var(--dur, 10s) ease-in-out calc(-1 * var(--delay, 0s)) infinite both;
}

@keyframes particle-float {
  0%,
  100% {
    transform: translateY(0) scale(0.85);
    opacity: 0.25;
  }
  50% {
    transform: translateY(calc(-1 * var(--amp, 20px))) scale(1.2);
    opacity: 0.95;
  }
}

/* 细网格纹理 */
.brand-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
  background-size: 36px 36px;
  mask-image: radial-gradient(110% 95% at 38% 42%, #000 35%, transparent 100%);
}

.brand-content {
  position: relative;
  z-index: 1;
}

.brand-logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-mark {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-control);
  color: #fff;
  background: linear-gradient(145deg, #0f9c6d, #086a4b);
  box-shadow: 0 6px 14px -3px rgba(10, 133, 94, 0.55);
}

.brand-name {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.brand-headline {
  margin: 28px 0 18px;
  font-size: 34px;
  line-height: 1.38;
  font-weight: 700;
  letter-spacing: 0.01em;
}

/* 强调字：翡翠色 + 荧光笔下划（入场时从左向右扫入） */
.brand-headline em {
  position: relative;
  z-index: 0;
  font-style: normal;
  color: #35c195;
  padding: 0 2px;
  border-radius: 2px;
}

.brand-headline em::after {
  content: '';
  position: absolute;
  z-index: -1;
  left: 0;
  right: 0;
  bottom: 3px;
  height: 40%;
  border-radius: 2px;
  background: rgba(53, 193, 149, 0.24);
  transform: scaleX(0);
  transform-origin: left center;
  animation: highlight-sweep 0.7s var(--ease-decel) 1.05s both;
}

@keyframes highlight-sweep {
  to {
    transform: scaleX(1);
  }
}

.brand-subtitle {
  max-width: 380px;
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: #93a0b7;
}

/* ==================== 品牌数据速览 ==================== */
.brand-stats {
  display: flex;
  align-items: stretch;
  margin-top: 30px;
  padding: 18px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-item + .stat-item {
  padding-left: 24px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
  color: #35c195;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
}

.stat-unit {
  margin-left: 2px;
  font-size: 12px;
  font-weight: 400;
  color: #93a0b7;
}

.stat-label {
  font-size: 12.5px;
  color: #93a0b7;
}

/* ==================== 系统状态徽标 ==================== */
.sys-status {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.75);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-pill);
}

.sys-dot {
  position: relative;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--text-disabled);
}

.sys-status.is-online .sys-dot {
  background: var(--color-success);
  box-shadow: 0 0 0 3px rgba(47, 158, 110, 0.18);
}

/* 在线状态：低频 ping 扩散（登录页专属例外，仅 transform/opacity） */
.sys-status.is-online .sys-dot::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--color-success);
  animation: dot-ping 2.6s cubic-bezier(0, 0, 0.2, 1) infinite;
}

@keyframes dot-ping {
  0% {
    transform: scale(1);
    opacity: 0.55;
  }
  70%,
  100% {
    transform: scale(3);
    opacity: 0;
  }
}

.sys-status.is-offline .sys-dot {
  background: var(--color-danger);
  box-shadow: 0 0 0 3px rgba(220, 90, 78, 0.16);
}

.feature-list {
  list-style: none;
  margin: 28px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 功能条目：玻璃卡质感，hover 轻微上浮 + 翡翠描边 */
.feature-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  transition:
    transform var(--motion-fast) var(--ease-standard),
    background-color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard);
}

.feature-item:hover {
  transform: translateY(-2px);
  background-color: rgba(255, 255, 255, 0.06);
  border-color: rgba(79, 208, 162, 0.4);
}

.feature-item:hover .feature-icon {
  color: #7fe0bd;
  background-color: rgba(10, 133, 94, 0.26);
  border-color: rgba(79, 208, 162, 0.5);
}

.feature-icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  color: #4fd0a2;
  background-color: rgba(10, 133, 94, 0.14);
  border: 1px solid rgba(10, 133, 94, 0.28);
  transition:
    color var(--motion-fast) var(--ease-standard),
    background-color var(--motion-fast) var(--ease-standard),
    border-color var(--motion-fast) var(--ease-standard);
}

.feature-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.feature-title {
  font-size: 14.5px;
  font-weight: 600;
}

.feature-desc {
  font-size: 12.5px;
  color: #7e8ba3;
}

.brand-footer {
  position: relative;
  z-index: 1;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  font-size: 12px;
  color: #5d6a82;
}

/* ==================== 右侧表单区 ==================== */
.form-panel {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(560px 300px at 84% 6%, rgba(10, 133, 94, 0.07), transparent 62%),
    radial-gradient(520px 320px at 10% 98%, rgba(64, 128, 184, 0.06), transparent 62%),
    var(--bg-page);
}

/* 浅点阵底纹 */
.form-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(28, 36, 48, 0.055) 1px, transparent 1.2px);
  background-size: 24px 24px;
}

.card-zone {
  position: relative;
  width: 100%;
  max-width: 448px;
}

/* ==================== 收银小票装饰 ==================== */
.receipt {
  position: absolute;
  top: -50px;
  right: -20px;
  z-index: 0;
  width: 182px;
  transform: rotate(7deg);
  filter: drop-shadow(0 12px 20px rgba(15, 22, 35, 0.16));
  animation: receipt-in 1.15s var(--ease-standard) 0.85s both;
}

/* 小票入场：初始藏在登录卡片后面（z-index 更低且位移入卡片范围），
   像从 POS 打印口缓缓升出 → 升过头轻微回摆 → 落定到倾斜位 */
@keyframes receipt-in {
  0% {
    opacity: 0;
    transform: translate(-30px, 100px) rotate(3deg);
  }
  45% {
    opacity: 1;
    transform: translate(-30px, 26px) rotate(4deg);
  }
  72% {
    transform: translate(6px, -8px) rotate(8.5deg);
  }
  100% {
    opacity: 1;
    transform: translate(0, 0) rotate(7deg);
  }
}

.receipt-body {
  padding: 12px 12px 10px;
  background: #fff;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.rcpt-store {
  margin: 0;
  font-size: 11.5px;
  font-weight: 700;
  text-align: center;
  color: var(--text-primary);
}

.rcpt-meta {
  margin: 2px 0 0;
  font-size: 9.5px;
  text-align: center;
  color: var(--text-disabled);
}

.rcpt-rule {
  margin: 7px 0;
  border-top: 1px dashed var(--border-color);
}

.rcpt-row {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  margin: 3px 0;
}

.rcpt-row span:first-child {
  flex: 1;
}

.rcpt-total {
  color: var(--brand-primary);
  font-weight: 700;
}

.rcpt-barcode {
  height: 18px;
  margin: 8px 4px 0;
  background:
    repeating-linear-gradient(90deg, var(--text-primary) 0 1px, transparent 1px 3px),
    repeating-linear-gradient(90deg, var(--text-primary) 0 2px, transparent 2px 7px);
}

.rcpt-thanks {
  margin: 6px 0 0;
  font-size: 9.5px;
  text-align: center;
  color: var(--text-disabled);
}

/* 小票锯齿底边（conic 楔形三角） */
.receipt-zigzag {
  height: 7px;
  background: conic-gradient(from -45deg at 50% 100%, #fff 90deg, transparent 0) 0 0 / 14px 7px repeat-x;
}

.login-card {
  position: relative;
  z-index: 1;
  width: 100%;
  padding: 48px 44px 40px;
  background-color: #fff;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-lg);
}

.mobile-brand {
  display: none;
  align-items: center;
  gap: 10px;
  margin-bottom: 28px;
  font-size: 16px;
  font-weight: 600;
}

.mobile-brand .brand-mark {
  width: 34px;
  height: 34px;
}

.login-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--brand-primary);
}

.login-eyebrow::before {
  content: '';
  width: 18px;
  height: 2px;
  border-radius: 1px;
  background: var(--brand-primary);
}

.login-title {
  margin: 0;
  font-size: 27px;
  font-weight: 700;
  color: var(--text-primary);
}

.login-tip {
  margin: 10px 0 34px;
  font-size: 13px;
  color: var(--text-secondary);
}

.login-form :deep(.el-input__wrapper) {
  padding: 4px 12px;
  border-radius: var(--radius-control);
}

.login-btn {
  width: 100%;
  height: 46px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.3em;
  text-indent: 0.3em;
  border: none;
  background: linear-gradient(145deg, #0f9c6d, #0a855e);
  box-shadow: 0 8px 18px -6px rgba(10, 133, 94, 0.5);
  transition:
    transform var(--motion-fast) var(--ease-standard),
    box-shadow var(--motion-fast) var(--ease-standard),
    filter var(--motion-fast) var(--ease-standard);
}

.login-btn:hover {
  filter: brightness(1.06);
  box-shadow: 0 10px 22px -6px rgba(10, 133, 94, 0.55);
}

.login-btn:active {
  transform: translateY(1px);
}

.login-note {
  margin: 6px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-disabled);
}

.backend-alert {
  margin-bottom: 16px;
}

/* 演示账号快捷入口 */
.demo-accounts {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.demo-chip {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 9px 8px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-control);
  background: var(--bg-muted);
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--ease-standard),
    background-color var(--motion-fast) var(--ease-standard);
}

.demo-chip:hover {
  border-color: var(--brand-primary-light-5);
  background: var(--brand-primary-light-9);
}

/* 已填入的演示账号高亮联动 */
.demo-chip.is-active {
  border: 1px solid var(--brand-primary-light-5);
  background: var(--brand-primary-light-9);
}

.demo-role {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.demo-role .el-icon {
  color: var(--brand-primary);
}

.demo-cred {
  font-size: 10.5px;
  color: var(--text-secondary);
  font-family: 'SF Mono', 'Consolas', monospace;
  white-space: nowrap;
}

/* ==================== 入场动效 ==================== */
/* 品牌区：逐条上浮淡入（通过 --stagger 控制级联延迟） */
.login-stagger {
  opacity: 0;
  animation: item-enter 0.55s var(--ease-decel) forwards;
  animation-delay: calc(var(--stagger, 0) * 90ms + 120ms);
}

@keyframes item-enter {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 登录卡片：上浮淡入 */
.login-card-rise {
  animation: card-enter 0.6s var(--ease-decel) both;
}

@keyframes card-enter {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ==================== 响应式：窄屏隐藏品牌区与小票 ==================== */
@media (max-width: 900px) {
  .brand-panel {
    display: none;
  }

  .receipt {
    display: none;
  }

  .login-card {
    padding: 36px 28px 30px;
    box-shadow: none;
    border: none;
  }

  .mobile-brand {
    display: flex;
  }
}
</style>
