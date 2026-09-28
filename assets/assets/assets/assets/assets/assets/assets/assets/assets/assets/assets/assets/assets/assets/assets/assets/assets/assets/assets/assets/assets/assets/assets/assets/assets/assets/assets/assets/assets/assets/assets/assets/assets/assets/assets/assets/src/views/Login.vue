<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <div class="logo">CF</div>
        <h1>CFDI 发票管理系统</h1>
        <p>墨西哥税务发票在线台账</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="0" @submit.prevent="handleLogin">
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            placeholder="用户名"
            size="large"
            prefix-icon="User"
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            size="large"
            prefix-icon="Lock"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item prop="role">
          <el-radio-group v-model="form.role" style="width: 100%">
            <el-radio-button label="admin" style="flex: 1">管理员</el-radio-button>
            <el-radio-button label="viewer" style="flex: 1">访客</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-button
          type="primary"
          size="large"
          style="width: 100%"
          :loading="loading"
          @click="handleLogin"
        >
          登录
        </el-button>
      </el-form>

      <div class="login-hint">
        <p>演示账号：</p>
        <p>管理员 — 用户名: admin，密码: admin</p>
        <p>访客 — 用户名: guest，密码: guest</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../store/user'
import { ElMessage } from 'element-plus'

const router = useRouter()
const userStore = useUserStore()
const formRef = ref()
const loading = ref(false)

const form = reactive({
  username: '',
  password: '',
  role: 'admin'
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

async function handleLogin() {
  await formRef.value.validate(async (valid) => {
    if (!valid) return

    loading.value = true

    // Demo authentication
    const demoAccounts = {
      admin: { password: 'admin', role: 'admin' },
      guest: { password: 'guest', role: 'viewer' }
    }

    const account = demoAccounts[form.username]
    if (!account || account.password !== form.password) {
      ElMessage.error('用户名或密码错误')
      loading.value = false
      return
    }

    // Use selected role (override demo account role if user selected)
    const role = form.role === 'admin' ? 'admin' : 'viewer'

    userStore.login(form.username, role)
    ElMessage.success('登录成功')
    router.push('/ledger')
    loading.value = false
  })
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1D9E75 0%, #0F6E56 100%);
}

.login-card {
  background: #fff;
  border-radius: 12px;
  padding: 40px;
  width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.logo {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  background: #1D9E75;
  color: #fff;
  font-size: 28px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.login-header h1 {
  font-size: 22px;
  color: #303133;
  margin-bottom: 8px;
}

.login-header p {
  font-size: 14px;
  color: #909399;
}

.login-hint {
  margin-top: 24px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
  text-align: center;
}

.login-hint p {
  font-size: 12px;
  color: #909399;
  line-height: 1.8;
  margin: 0;
}
</style>
