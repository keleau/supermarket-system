<script setup>
/**
 * 个人中心页（系统管理）
 * 结构：左侧身份卡片（头像选择器 + 账号信息）+ 修改密码 → 右侧资料编辑表单
 * 数据来源：
 * - GET  /api/user/info      刷新页面后恢复本人资料
 * - PUT  /api/user/profile   保存资料（后端白名单字段，salary/职位/角色由后端忽略）
 * - POST /api/user/password  修改本人密码
 * 说明：后端不在 info 接口返回 salary / joinDate 等敏感字段，因此表单不提供这两项输入
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { changePassword, getUserInfo, updateAvatar, updateProfile } from '@/api/modules/auth'
import { EditPen, Hide, View } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'

const userStore = useUserStore()

/** 内置 6 张本地扁平头像（public/avatars，个人中心 / 用户管理共用，无外网依赖） */
const AVATAR_OPTIONS = [
  '/avatars/a1.svg',
  '/avatars/a2.svg',
  '/avatars/a3.svg',
  '/avatars/a4.svg',
  '/avatars/a5.svg',
  '/avatars/a6.svg',
]

/* ---------------- 本人资料 ---------------- */

const loading = ref(false)

const profile = reactive({
  id: null,
  username: '',
  realName: '',
  role: '',
  position: '',
  avatar: '',
  gender: '',
  birthday: '',
  idCard: '',
  phone: '',
  address: '',
  remark: '',
})

async function loadProfile() {
  loading.value = true
  try {
    const info = await getUserInfo()
    Object.assign(profile, {
      id: info.id,
      username: info.username,
      realName: info.realName || '',
      role: info.role,
      position: info.position,
      avatar: info.avatar || AVATAR_OPTIONS[0],
      phone: info.phone || '',
    })
  } finally {
    loading.value = false
  }
}

onMounted(loadProfile)

/* ---------------- 资料表单 ---------------- */

const formRef = ref(null)
const submitting = ref(false)

/** 展示/编辑模式：进入页面与保存成功后均为展示页，点「修改资料」进入编辑 */
const editing = ref(false)

/** 身份证号脱敏显示开关（仅展示页生效） */
const showIdCard = ref(false)

/** 身份证脱敏：保留前 6 后 4，中间打码 */
const maskedIdCard = computed(() => {
  const id = profile.idCard || ''
  if (!id) return ''
  if (id.length <= 10) return id.replace(/.(?=.{2})/g, '*')
  return id.slice(0, 6) + '*'.repeat(id.length - 10) + id.slice(-4)
})

function startEdit() {
  editing.value = true
}

/* ---------------- 头像即时更换（独立于资料保存） ---------------- */

/** 正在更换中的头像选项（防重复点击） */
const avatarChanging = ref('')

/** 点选头像立即保存并同步顶栏，不经过「修改资料」表单 */
async function changeAvatar(url) {
  if (profile.avatar === url || avatarChanging.value) return
  avatarChanging.value = url
  try {
    await updateAvatar(url)
    profile.avatar = url
    // 同步全局登录态：顶栏头像、用户管理页立即生效
    userStore.applyUser({ avatar: url })
    ElMessage.success('头像已更新')
  } catch {
    /* 失败文案由 request 拦截器统一弹出 */
  } finally {
    avatarChanging.value = ''
  }
}

const rules = {
  realName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  gender: [{ required: true, message: '请选择性别', trigger: 'change' }],
  birthday: [{ required: true, message: '请选择出生日期', trigger: 'change' }],
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    {
      validator: (_rule, v, cb) => (/^1[3-9]\d{9}$/.test(v) ? cb() : cb(new Error('手机号格式不正确'))),
      trigger: 'blur',
    },
  ],
  idCard: [
    { required: true, message: '请输入身份证号', trigger: 'blur' },
    {
      validator: (_rule, v, cb) => (/^\d{17}[\dXx]$/.test(v) ? cb() : cb(new Error('身份证号格式不正确'))),
      trigger: 'blur',
    },
  ],
  address: [{ required: true, message: '请输入家庭住址', trigger: 'blur' }],
  remark: [{ required: true, message: '请填写个人简介', trigger: 'blur' }],
}

/** 提交个人资料：二次确认后保存 */
async function handleSubmit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  try {
    await ElMessageBox.confirm('确认提交以上个人资料吗？', '提交确认', {
      confirmButtonText: '确认提交',
      cancelButtonText: '再检查一下',
      type: 'info',
    })
  } catch {
    return
  }

  submitting.value = true
  try {
    await updateProfile({
      avatar: profile.avatar,
      realName: profile.realName.trim(),
      gender: profile.gender || '',
      birthday: profile.birthday || '',
      phone: profile.phone || '',
      idCard: profile.idCard || '',
      address: profile.address || '',
      remark: profile.remark || '',
    })
    // 同步刷新全局登录态，顶部头像与姓名立即生效
    userStore.applyUser({
      avatar: profile.avatar,
      realName: profile.realName.trim(),
      phone: profile.phone,
    })
    ElMessage.success('个人资料已保存')
    // 回到展示页，并重置身份证脱敏开关
    showIdCard.value = false
    editing.value = false
  } catch {
    /* 失败文案（如「手机号格式不正确」）由 request 拦截器统一弹出 */
  } finally {
    submitting.value = false
  }
}

/* ---------------- 修改密码 ---------------- */

const pwdFormRef = ref(null)
const pwdSubmitting = ref(false)

const pwdForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const pwdRules = {
  oldPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 20, message: '密码长度为 6-20 位', trigger: 'blur' },
    {
      validator: (_rule, v, cb) =>
        v !== pwdForm.oldPassword ? cb() : cb(new Error('新密码不能与当前密码相同')),
      trigger: 'blur',
    },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, v, cb) => (v === pwdForm.newPassword ? cb() : cb(new Error('两次输入的密码不一致'))),
      trigger: 'blur',
    },
  ],
}

async function handleChangePassword() {
  if (!pwdFormRef.value) return
  try {
    await pwdFormRef.value.validate()
  } catch {
    return
  }
  pwdSubmitting.value = true
  try {
    await changePassword({
      oldPassword: pwdForm.oldPassword,
      newPassword: pwdForm.newPassword,
    })
    ElMessage.success('密码修改成功')
    pwdForm.oldPassword = ''
    pwdForm.newPassword = ''
    pwdForm.confirmPassword = ''
  } catch {
    /* 失败文案（如「当前密码错误」）由 request 拦截器统一弹出 */
  } finally {
    pwdSubmitting.value = false
  }
}

/** 身份卡片标题：优先姓名，其次账号 */
const displayName = computed(() => profile.realName || profile.username || '未命名用户')
</script>

<template>
  <div v-loading="loading" class="profile-page">
    <!-- ============ 左侧：身份卡片 ============ -->
    <div class="left-col">
      <section class="page-card identity-card">
        <div class="identity-head">
          <el-avatar :size="80" class="identity-avatar" :src="profile.avatar">
            {{ displayName.charAt(0) }}
          </el-avatar>
          <div class="identity-meta">
            <h3 class="identity-name">{{ displayName }}</h3>
            <el-tag :type="userStore.isAdmin ? 'success' : 'info'" effect="light" round size="small" class="identity-role">
              {{ profile.position || profile.role }}
            </el-tag>
          </div>
        </div>

        <!-- 更换头像选择器 -->
        <div class="avatar-picker">
          <span class="picker-label">更换头像</span>
          <div class="avatar-options">
            <button
              v-for="avatar in AVATAR_OPTIONS"
              :key="avatar"
              type="button"
              class="avatar-option"
              :class="{ active: profile.avatar === avatar }"
              :disabled="avatarChanging === avatar"
              @click="changeAvatar(avatar)"
            >
              <el-avatar :size="40" :src="avatar" />
            </button>
          </div>
        </div>

        <el-descriptions :column="1" border class="identity-desc">
          <el-descriptions-item label="登录账号">{{ profile.username }}</el-descriptions-item>
          <el-descriptions-item label="登录状态">
            <span class="status-online"><i class="status-dot" aria-hidden="true"></i>已登录</span>
          </el-descriptions-item>
        </el-descriptions>
      </section>

      <!-- 修改密码卡片 -->
      <section class="page-card pwd-card">
        <header class="card-head">
          <h3 class="card-title">修改密码</h3>
          <p class="card-sub">定期更换密码有助于保障账号安全</p>
        </header>

        <el-form ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" label-position="top" class="pwd-form">
          <el-form-item label="当前密码" prop="oldPassword">
            <el-input v-model="pwdForm.oldPassword" type="password" show-password placeholder="请输入当前密码" />
          </el-form-item>
          <el-form-item label="新密码" prop="newPassword">
            <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="6-20 位新密码" />
          </el-form-item>
          <el-form-item label="确认新密码" prop="confirmPassword">
            <el-input v-model="pwdForm.confirmPassword" type="password" show-password placeholder="再次输入新密码" />
          </el-form-item>
          <el-button type="primary" :loading="pwdSubmitting" class="pwd-submit" @click="handleChangePassword">
            确认修改
          </el-button>
        </el-form>
      </section>
    </div>

    <!-- ============ 右侧：资料展示 / 编辑 ============ -->
    <section class="page-card form-card">
      <header class="card-head">
        <h3 class="card-title">个人资料</h3>
        <p class="card-sub">
          {{ editing ? '所有字段均为必填；姓名、头像与手机号会同步更新到顶部账号信息' : '以下资料仅本人可见，身份证号默认脱敏显示' }}
        </p>
      </header>

      <!-- 展示页：只读信息 + 修改入口 -->
      <div v-if="!editing" class="info-panel">
        <div class="form-row">
          <div class="info-item">
            <span class="info-label">姓名</span>
            <p class="info-value" :class="{ empty: !profile.realName }">{{ profile.realName || '未填写' }}</p>
          </div>
          <div class="info-item">
            <span class="info-label">性别</span>
            <p class="info-value" :class="{ empty: !profile.gender }">{{ profile.gender || '未填写' }}</p>
          </div>
        </div>
        <div class="form-row">
          <div class="info-item">
            <span class="info-label">出生日期</span>
            <p class="info-value" :class="{ empty: !profile.birthday }">{{ profile.birthday || '未填写' }}</p>
          </div>
          <div class="info-item">
            <span class="info-label">手机号</span>
            <p class="info-value" :class="{ empty: !profile.phone }">{{ profile.phone || '未填写' }}</p>
          </div>
        </div>
        <div class="info-item">
          <span class="info-label">身份证号</span>
          <p v-if="profile.idCard" class="info-value">
            <span class="num">{{ showIdCard ? profile.idCard : maskedIdCard }}</span>
            <el-button type="primary" text size="small" class="idcard-toggle" @click="showIdCard = !showIdCard">
              <el-icon><component :is="showIdCard ? Hide : View" /></el-icon>
              {{ showIdCard ? '隐藏' : '显示' }}
            </el-button>
          </p>
          <p v-else class="info-value empty">未填写</p>
        </div>
        <div class="info-item">
          <span class="info-label">家庭住址</span>
          <p class="info-value" :class="{ empty: !profile.address }">{{ profile.address || '未填写' }}</p>
        </div>
        <div class="info-item">
          <span class="info-label">个人简介</span>
          <p class="info-value" :class="{ empty: !profile.remark }">{{ profile.remark || '未填写' }}</p>
        </div>

        <div class="form-actions">
          <el-button type="primary" class="submit-btn" @click="startEdit">
            <el-icon class="btn-icon"><EditPen /></el-icon>
            修改资料
          </el-button>
        </div>
      </div>

      <!-- 编辑表单 -->
      <el-form v-else ref="formRef" :model="profile" :rules="rules" label-position="top" class="profile-form">
        <div class="form-row">
          <el-form-item label="姓名" prop="realName">
            <el-input v-model="profile.realName" placeholder="真实姓名" maxlength="20" />
          </el-form-item>
          <el-form-item label="性别" prop="gender">
            <el-select v-model="profile.gender" placeholder="请选择" style="width: 100%">
              <el-option label="男" value="男" />
              <el-option label="女" value="女" />
            </el-select>
          </el-form-item>
        </div>
        <div class="form-row">
          <el-form-item label="出生日期" prop="birthday">
            <el-date-picker v-model="profile.birthday" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
          </el-form-item>
          <el-form-item label="手机号" prop="phone">
            <el-input v-model="profile.phone" placeholder="11 位手机号" maxlength="11" />
          </el-form-item>
        </div>
        <el-form-item label="身份证号" prop="idCard">
          <el-input v-model="profile.idCard" placeholder="18 位身份证号" maxlength="18" />
        </el-form-item>
        <el-form-item label="家庭住址" prop="address">
          <el-input v-model="profile.address" placeholder="详细住址" maxlength="80" />
        </el-form-item>
        <el-form-item label="个人简介" prop="remark">
          <el-input v-model="profile.remark" type="textarea" :rows="3" placeholder="简单介绍一下自己" maxlength="200" show-word-limit />
        </el-form-item>

        <div class="form-actions">
          <el-button class="cancel-btn" :disabled="submitting" @click="editing = false">取消</el-button>
          <el-button type="primary" :loading="submitting" class="submit-btn" @click="handleSubmit">
            保存资料
          </el-button>
        </div>
      </el-form>
    </section>
  </div>
</template>

<style scoped>
.profile-page {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 16px;
  align-items: start;
}

.left-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ==================== 身份卡片 ==================== */
.identity-card {
  padding: 24px;
}

.identity-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-light);
}

.identity-avatar {
  flex-shrink: 0;
  background: var(--brand-primary-light-9);
  color: var(--brand-primary);
  font-size: 28px;
  font-weight: 600;
}

.identity-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.identity-name {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.identity-desc {
  margin-top: 20px;
}

.status-online {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-success);
  font-weight: 500;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--color-success);
}

/* ==================== 头像选择器 ==================== */
.avatar-picker {
  margin-top: 20px;
}

.picker-label {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.avatar-options {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.avatar-option {
  padding: 3px;
  border: 2px solid var(--border-color);
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}

.avatar-option:hover {
  transform: scale(1.08);
}

.avatar-option.active {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px var(--brand-primary-light-9);
}

/* ==================== 卡片通用头 ==================== */
.card-head {
  margin-bottom: 20px;
}

.card-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}

/* ==================== 修改密码卡片 ==================== */
.pwd-card {
  padding: 24px;
}

.pwd-form :deep(.el-form-item__label) {
  font-size: 13px;
  color: var(--text-regular);
  padding-bottom: 4px;
}

.pwd-submit {
  width: 100%;
}

/* ==================== 资料表单卡片 ==================== */
.form-card {
  padding: 24px;
}

/* ==================== 资料展示页 ==================== */
.info-panel {
  padding-top: 4px;
}

.info-item {
  margin-bottom: 20px;
}

.info-label {
  display: block;
  font-size: 13px;
  color: var(--text-regular);
  margin-bottom: 6px;
}

.info-value {
  margin: 0;
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.6;
  word-break: break-all;
}

.info-value.empty {
  color: var(--text-disabled);
}

.idcard-toggle {
  height: auto;
  padding: 0;
}

.btn-icon {
  margin-right: 6px;
}

.profile-form :deep(.el-form-item__label) {
  font-size: 13px;
  color: var(--text-regular);
  padding-bottom: 4px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 20px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.submit-btn {
  min-width: 140px;
}

/* ==================== 响应式 ==================== */
@media (max-width: 991px) {
  .profile-page {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767px) {
  .identity-card,
  .pwd-card,
  .form-card {
    padding: 16px;
  }
  .form-row {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
