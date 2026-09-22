<template>
  <el-container class="layout-container">
    <el-aside v-show="!isCollapsed" width="220px" class="sidebar">
      <div class="sidebar-header">
        <div class="logo">CF</div>
        <span class="title">CFDI 发票系统</span>
      </div>

      <el-menu
        :default-active="activeMenu"
        router
        class="sidebar-menu"
        background-color="transparent"
        text-color="#bfcbd9"
        active-text-color="#fff"
      >
        <el-menu-item index="/ledger">
          <el-icon><Document /></el-icon>
          <span>发票台账</span>
        </el-menu-item>

        <el-menu-item index="/upload">
          <el-icon><Upload /></el-icon>
          <span>XML批量上传</span>
        </el-menu-item>

        <el-menu-item index="/pedimento-upload">
          <el-icon><DocumentCopy /></el-icon>
          <span>关单PDF入库</span>
        </el-menu-item>

        <el-menu-item index="/mapping">
          <el-icon><Connection /></el-icon>
          <span>SAP客商映射</span>
        </el-menu-item>

        <el-menu-item index="/summary">
          <el-icon><DataAnalysis /></el-icon>
          <span>汇总报表</span>
        </el-menu-item>

        <el-menu-item index="/detail">
          <el-icon><Tickets /></el-icon>
          <span>余额构成明细</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="topbar">
        <div class="topbar-left">
          <el-button text class="collapse-btn" @click="toggleSidebar">
            <el-icon :size="18">
              <Fold v-if="!isCollapsed" />
              <Expand v-else />
            </el-icon>
          </el-button>

          <!-- When collapsed, show nav items horizontally in topbar -->
          <nav v-if="isCollapsed" class="topbar-nav">
            <router-link to="/ledger" class="nav-item" :class="{ active: activeMenu === '/ledger' }">
              <el-icon><Document /></el-icon>
              <span>台账</span>
            </router-link>
            <router-link to="/upload" class="nav-item" :class="{ active: activeMenu === '/upload' }">
              <el-icon><Upload /></el-icon>
              <span>上传</span>
            </router-link>
            <router-link to="/pedimento-upload" class="nav-item" :class="{ active: activeMenu === '/pedimento-upload' }">
              <el-icon><DocumentCopy /></el-icon>
              <span>关单</span>
            </router-link>
            <router-link to="/mapping" class="nav-item" :class="{ active: activeMenu === '/mapping' }">
              <el-icon><Connection /></el-icon>
              <span>映射</span>
            </router-link>
            <router-link to="/summary" class="nav-item" :class="{ active: activeMenu === '/summary' }">
              <el-icon><DataAnalysis /></el-icon>
              <span>报表</span>
            </router-link>
            <router-link to="/detail" class="nav-item" :class="{ active: activeMenu === '/detail' }">
              <el-icon><Tickets /></el-icon>
              <span>明细</span>
            </router-link>
          </nav>

          <span v-if="!isCollapsed" class="page-title">{{ currentTitle }}</span>
        </div>
        <div class="topbar-right">
          <el-tag type="success" size="small">CFDI</el-tag>
        </div>
      </el-header>

      <el-main class="main-content" :class="{ 'ledger-main': activeMenu === '/ledger' }">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const activeMenu = computed(() => route.path)
const currentTitle = computed(() => route.meta.title || 'CFDI 发票管理系统')

const isCollapsed = ref(false)

function toggleSidebar() {
  isCollapsed.value = !isCollapsed.value
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

.sidebar {
  background: #304156;
  overflow-x: hidden;
  transition: width 0.3s ease;
}

.sidebar-header {
  height: 60px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 12px;
}

.sidebar-header .logo {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #1D9E75;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sidebar-header .title {
  color: #fff;
  font-size: 15px;
  font-weight: 500;
  white-space: nowrap;
}

.sidebar-menu {
  border-right: none;
}

.topbar {
  background: #fff;
  border-bottom: 1px solid #e6e8eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 24px;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  overflow: hidden;
}

.collapse-btn {
  padding: 6px;
  flex-shrink: 0;
}

.topbar-left .page-title {
  font-size: 16px;
  font-weight: 500;
  color: #303133;
  white-space: nowrap;
}

.topbar-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 56px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 56px;
  padding: 0 10px;
  font-size: 13px;
  color: #303133;
  text-decoration: none;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}

.nav-item:hover {
  color: #409eff;
  background-color: #f5f7fa;
}

.nav-item.active {
  color: #409eff;
  border-bottom: 2px solid #409eff;
}

.nav-item .el-icon {
  font-size: 16px;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.topbar-right .username {
  font-size: 14px;
  color: #606266;
}

.main-content.ledger-main {
  padding-top: 0;
}
</style>
