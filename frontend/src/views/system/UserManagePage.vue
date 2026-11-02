<script setup>
/**
 * 用户管理页（系统管理，仅管理员可访问）
 * 结构：筛选卡片 → 用户表格（服务端分页）→ 新增/编辑弹窗 + 重置密码弹窗
 * 权限：仅管理员（路由层 meta.roles 已限制）
 * 业务：账号唯一且创建后只读；新增用户初始密码统一为 123456（后端固定）；
 *       职位由后端映射为角色（管理员 → admin，其余 → operator），前端不传 role
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh, Edit, Delete, Key } from '@element-plus/icons-vue'
import { POSITIONS, ROLE_ADMIN, useUserStore } from '@/store/user'
import PagePagination from '@/components/PagePagination.vue'
import { usePagination } from '@/composables/usePagination'
import {
  addUser,
  deleteUser,
  getUserList,
  resetUserPassword,
  updateUser,
} from '@/api/modules/system'

const userStore = useUserStore()
const currentUsername = computed(() => userStore.username)

/** 内置 6 张本地扁平头像（public/avatars，个人中心 / 用户管理共用，无外网依赖） */
const AVATAR_OPTIONS = [
  '/avatars/a1.svg',
  '/avatars/a2.svg',
  '/avatars/a3.svg',
  '/avatars/a4.svg',
  '/avatars/a5.svg',
  '/avatars/a6.svg',
]

/* ---------------- 列表（服务端分页） ---------------- */

const loading = ref(false)
const list = ref([])
const total = ref(0)
const { pagination, handlePageChange, handleSizeChange } = usePagination(loadList)

const filterForm = reactive({
  username: '',
  position: '',
  status: '',
})

const appliedFilters = reactive({
  username: '',
  position: '',
  status: '',
})

async function loadList() {
  loading.value = true
  try {
    const res = await getUserList({
      pageNum: pagination.pageNum,
      pageSize: pagination.pageSize,
      username: appliedFilters.username || undefined,
      position: appliedFilters.position || undefined,
      status: appliedFilters.status === '' ? undefined : appliedFilters.status,
    })
    list.value = res?.list || []
    total.value = res?.total || 0
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  appliedFilters.username = filterForm.username.trim()
  appliedFilters.position = filterForm.position
  appliedFilters.status = filterForm.status
  pagination.pageNum = 1
  loadList()
}

function handleReset() {
  filterForm.username = ''
  filterForm.position = ''
  filterForm.status = ''
  handleQuery()
}

onMounted(loadList)

/* ---------------- 新增 / 编辑弹窗 ---------------- */

const dialogVisible = ref(false)
const isEdit = ref(false)
const editingId = ref(null)
const submitLoading = ref(false)
const formRef = ref(null)

const defaultForm = () => ({
  username: '',
  realName: '',
  position: '仓管',
  avatar: AVATAR_OPTIONS[0],
  idCard: '',
  phone: '',
  address: '',
  gender: '',
  birthday: '',
  joinDate: '',
  salary: 0,
  remark: '',
  status: 1,
})

const form = reactive(defaultForm())

const rules = {
  username: [
    { required: true, message: '请输入登录账号', trigger: 'blur' },
    {
      validator: (_rule, value, callback) =>
        /^[a-zA-Z0-9_]{3,20}$/.test((value || '').trim())
          ? callback()
          : callback(new Error('账号需为 3-20 位字母/数字/下划线')),
      trigger: 'blur',
    },
  ],
  realName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  position: [{ required: true, message: '请选择职位', trigger: 'change' }],
  phone: [
    {
      validator: (_rule, v, cb) => {
        if (!v) return cb()
        return /^1[3-9]\d{9}$/.test(v) ? cb() : cb(new Error('手机号格式不正确'))
      },
      trigger: 'blur',
    },
  ],
  idCard: [
    {
      validator: (_rule, v, cb) => {
        if (!v) return cb()
        return /^\d{17}[\dXx]$/.test(v) ? cb() : cb(new Error('身份证号格式不正确'))
      },
      trigger: 'blur',
    },
  ],
}

function openCreate() {
  isEdit.value = false
  editingId.value = null
  Object.assign(form, defaultForm())
  dialogVisible.value = true
}

function openEdit(row) {
  isEdit.value = true
  editingId.value = row.id
  Object.assign(form, {
    username: row.username,
    realName: row.realName || '',
    position: row.position || '仓管',
    avatar: row.avatar || AVATAR_OPTIONS[0],
    idCard: row.idCard || '',
    phone: row.phone || '',
    address: row.address || '',
    gender: row.gender || '',
    birthday: row.birthday || '',
    joinDate: row.joinDate || '',
    salary: Number(row.salary) || 0,
    remark: row.remark || '',
    status: row.status,
  })
  dialogVisible.value = true
}

async function handleSubmit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  submitLoading.value = true
  try {
    const payload = {
      username: form.username.trim(),
      realName: form.realName.trim(),
      position: form.position,
      avatar: form.avatar,
      idCard: form.idCard?.trim() || '',
      phone: form.phone?.trim() || '',
      address: form.address?.trim() || '',
      gender: form.gender || '',
      birthday: form.birthday || '',
      joinDate: form.joinDate || '',
      salary: Number(form.salary) || 0,
      remark: form.remark?.trim() || '',
      status: Number(form.status),
    }
    if (isEdit.value) {
      await updateUser({ id: editingId.value, ...payload })
      ElMessage.success('用户信息已更新')
    } else {
      await addUser(payload)
      ElMessage.success('用户已新增，初始密码为 123456')
    }
    dialogVisible.value = false
    await loadList()
  } catch {
    /* 失败文案（如「登录账号已存在」）由 request 拦截器统一弹出 */
  } finally {
    submitLoading.value = false
  }
}

/* ---------------- 删除 ---------------- */

async function handleDelete(row) {
  if (row.username === currentUsername.value) {
    ElMessage.warning('不能删除当前登录账号')
    return
  }
  try {
    await ElMessageBox.confirm(`确认删除用户「${row.username}」吗？删除后不可恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  try {
    await deleteUser(row.id)
    ElMessage.success('用户已删除')
    if (list.value.length === 1 && pagination.pageNum > 1) pagination.pageNum -= 1
    await loadList()
  } catch {
    /* 失败文案（如「系统管理员不可删除」）由 request 拦截器统一弹出 */
  }
}

/* ---------------- 重置密码 ---------------- */

const resetVisible = ref(false)
const resetTarget = ref(null)
const resetLoading = ref(false)
const resetFormRef = ref(null)
const resetForm = reactive({ newPassword: '', confirmPassword: '' })

const resetRules = {
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 20, message: '密码长度为 6-20 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, v, cb) => (v === resetForm.newPassword ? cb() : cb(new Error('两次输入的密码不一致'))),
      trigger: 'blur',
    },
  ],
}

function openReset(row) {
  resetTarget.value = row
  resetForm.newPassword = ''
  resetForm.confirmPassword = ''
  resetVisible.value = true
}

async function handleResetSubmit() {
  if (!resetFormRef.value) return
  try {
    await resetFormRef.value.validate()
  } catch {
    return
  }
  resetLoading.value = true
  try {
    await resetUserPassword(resetTarget.value.id, resetForm.newPassword)
    ElMessage.success(`用户「${resetTarget.value.username}」密码已重置`)
    resetVisible.value = false
  } catch {
    /* 失败文案由 request 拦截器统一弹出 */
  } finally {
    resetLoading.value = false
  }
}

/** 头像首字 */
function nameInitial(name) {
  return name ? name.slice(0, 1) : '？'
}
</script>

<template>
  <div class="user-page">
    <!-- ============ 筛选卡片 ============ -->
    <section class="page-card filter-card">
      <el-form :model="filterForm" inline class="filter-form" @submit.prevent>
        <el-form-item label="登录账号">
          <el-input
            v-model="filterForm.username"
            placeholder="如 admin"
            clearable
            :prefix-icon="Search"
            style="width: 180px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item label="职位">
          <el-select v-model="filterForm.position" placeholder="全部" clearable style="width: 130px">
            <el-option v-for="p in POSITIONS" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filterForm.status" placeholder="全部" clearable style="width: 110px">
            <el-option label="启用" :value="1" />
            <el-option label="禁用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item class="filter-actions">
          <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
      <div class="filter-extra">
        <el-button type="primary" :icon="Plus" @click="openCreate">新增用户</el-button>
      </div>
    </section>

    <!-- ============ 用户表格卡片 ============ -->
    <section class="page-card table-card">
      <header class="table-head">
        <h3 class="table-title">系统用户</h3>
        <span class="table-sub">共 {{ total }} 个用户</span>
      </header>

      <el-table v-loading="loading" :data="list" class="user-table">
        <el-table-column label="用户" min-width="190">
          <template #default="{ row }">
            <div class="user-cell">
              <el-avatar :size="36" class="user-avatar" :src="row.avatar">
                {{ nameInitial(row.realName || row.username) }}
              </el-avatar>
              <div class="user-meta">
                <span class="user-name">{{ row.realName || row.username }}</span>
                <span class="user-account">{{ row.username }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="职位" width="100">
          <template #default="{ row }">
            <el-tag :type="row.role === ROLE_ADMIN ? 'success' : 'info'" effect="light" round size="small">
              {{ row.position || row.username }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" min-width="130">
          <template #default="{ row }">
            <span class="num">{{ row.phone || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'" effect="light" round size="small">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createTime" label="创建时间" min-width="160" />
        <el-table-column label="操作" fixed="right" width="200" align="center">
          <template #default="{ row }">
            <el-button text type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
            <el-button text type="warning" :icon="Key" @click="openReset(row)">重置密码</el-button>
            <el-button text type="danger" :icon="Delete" :disabled="row.username === currentUsername" @click="handleDelete(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="table-empty">
            <el-icon :size="32" class="empty-icon"><User /></el-icon>
            <p>暂无用户数据</p>
          </div>
        </template>
      </el-table>

      <div class="table-foot">
        <PagePagination
          :page-num="pagination.pageNum"
          :page-size="pagination.pageSize"
          :total="total"
          @page-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </section>

    <!-- ============ 新增 / 编辑弹窗 ============ -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑用户' : '新增用户'"
      width="640"
      class="user-dialog"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="user-form">
        <!-- 头像选择 -->
        <el-form-item label="头像">
          <div class="avatar-picker">
            <button
              v-for="avatar in AVATAR_OPTIONS"
              :key="avatar"
              type="button"
              class="avatar-option"
              :class="{ active: form.avatar === avatar }"
              @click="form.avatar = avatar"
            >
              <el-avatar :size="44" :src="avatar" />
            </button>
          </div>
        </el-form-item>

        <div class="form-row">
          <el-form-item label="登录账号" prop="username">
            <el-input v-model="form.username" :disabled="isEdit" placeholder="3-20 位字母/数字/下划线" maxlength="20" />
          </el-form-item>
          <el-form-item label="姓名" prop="realName">
            <el-input v-model="form.realName" placeholder="真实姓名" maxlength="20" />
          </el-form-item>
        </div>
        <div class="form-row">
          <el-form-item label="职位" prop="position">
            <el-select v-model="form.position" style="width: 100%">
              <el-option v-for="p in POSITIONS" :key="p" :label="p" :value="p" />
            </el-select>
          </el-form-item>
          <el-form-item label="手机号" prop="phone">
            <el-input v-model="form.phone" placeholder="11 位手机号" maxlength="11" />
          </el-form-item>
        </div>
        <div class="form-row">
          <el-form-item label="身份证号" prop="idCard">
            <el-input v-model="form.idCard" placeholder="18 位身份证号" maxlength="18" />
          </el-form-item>
          <el-form-item label="性别" prop="gender">
            <el-select v-model="form.gender" placeholder="请选择" style="width: 100%">
              <el-option label="男" value="男" />
              <el-option label="女" value="女" />
            </el-select>
          </el-form-item>
        </div>
        <div class="form-row">
          <el-form-item label="出生日期" prop="birthday">
            <el-date-picker v-model="form.birthday" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
          </el-form-item>
          <el-form-item label="入职时间" prop="joinDate">
            <el-date-picker v-model="form.joinDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
          </el-form-item>
        </div>
        <div class="form-row">
          <el-form-item label="工资(元)" prop="salary">
            <el-input-number v-model="form.salary" :min="0" :precision="2" :step="100" controls-position="right" style="width: 100%" />
          </el-form-item>
          <el-form-item label="状态" prop="status">
            <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="禁用" inline-prompt />
          </el-form-item>
        </div>
        <el-form-item label="家庭住址" prop="address">
          <el-input v-model="form.address" placeholder="详细住址" maxlength="80" />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="选填" maxlength="100" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- ============ 重置密码弹窗 ============ -->
    <el-dialog
      v-model="resetVisible"
      :title="`重置密码 - ${resetTarget?.username || ''}`"
      width="440"
      class="reset-dialog"
      :close-on-click-modal="false"
    >
      <el-form ref="resetFormRef" :model="resetForm" :rules="resetRules" label-position="top" class="reset-form">
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="resetForm.newPassword" type="password" show-password placeholder="6-20 位" />
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirmPassword">
          <el-input v-model="resetForm.confirmPassword" type="password" show-password placeholder="再次输入新密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetVisible = false">取消</el-button>
        <el-button type="primary" :loading="resetLoading" @click="handleResetSubmit">确定重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.user-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ==================== 筛选卡片 ==================== */
.filter-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  padding: 18px 20px;
}

.filter-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 20px;
  flex: 1;
}

.filter-form :deep(.el-form-item) {
  margin-bottom: 0;
  margin-right: 0;
}

.filter-form :deep(.el-form-item__label) {
  font-size: 13px;
  color: var(--text-regular);
}

.filter-actions {
  margin-left: auto !important;
}

.filter-extra {
  display: flex;
  gap: 8px;
}

/* ==================== 表格卡片 ==================== */
.table-card {
  padding: 20px;
}

.table-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 16px;
}

.table-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.table-sub {
  font-size: 13px;
  color: var(--text-secondary);
}

.user-table :deep(.el-table th.el-table__cell) {
  background: var(--bg-muted);
  color: var(--text-regular);
  font-weight: 500;
}

.user-table :deep(.el-table__row:hover > td) {
  background: var(--bg-muted) !important;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar {
  flex-shrink: 0;
  background: var(--brand-primary-light-9);
  color: var(--brand-primary);
  font-weight: 600;
  font-size: 14px;
}

.user-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.user-account {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: 'SF Mono', 'Consolas', monospace;
}

.num {
  font-variant-numeric: tabular-nums;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 13px;
  color: var(--text-regular);
}

.table-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.empty-icon {
  color: var(--text-disabled);
}

/* ==================== 弹窗 ==================== */
.user-dialog :deep(.el-dialog),
.reset-dialog :deep(.el-dialog) {
  border-radius: var(--radius-card);
}

.user-form :deep(.el-form-item__label),
.reset-form :deep(.el-form-item__label) {
  font-size: 13px;
  color: var(--text-regular);
  padding-bottom: 4px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 20px;
}

/* 头像选择器 */
.avatar-picker {
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

/* ==================== 响应式 ==================== */
@media (max-width: 1199px) {
  .filter-card {
    gap: 8px;
  }
  .filter-extra {
    width: 100%;
    justify-content: flex-end;
  }
}

@media (max-width: 767px) {
  .filter-card {
    padding: 12px;
  }
  .filter-form {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .filter-form :deep(.el-form-item) {
    width: 100%;
    margin: 0;
  }
  .filter-form :deep(.el-input),
  .filter-form :deep(.el-select) {
    width: 100% !important;
  }
  .filter-actions {
    width: 100%;
    margin-left: 0 !important;
    justify-content: flex-end;
  }
  .table-card {
    padding: 12px;
  }
  .form-row {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
