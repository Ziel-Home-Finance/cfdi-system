<template>
  <div class="summary-page">
    <!-- Period Selector -->
    <el-card shadow="never" class="period-card">
      <div class="period-bar">
        <span>选择期间：</span>
        <el-select v-model="selectedPeriod" placeholder="选择开票期间" style="width: 160px" @change="loadData">
          <el-option v-for="p in periodOptions" :key="p" :label="p" :value="p" />
        </el-select>
        <el-radio-group v-model="ledgerType" size="small" @change="loadData" style="margin-left: 16px">
          <el-radio-button label="">全部</el-radio-button>
          <el-radio-button label="output">销项税</el-radio-button>
          <el-radio-button label="input">进项税</el-radio-button>
        </el-radio-group>
      </div>
    </el-card>

    <!-- Current Period Summary -->
    <el-card shadow="never" class="summary-card">
      <h3>当期汇总 ({{ selectedPeriod || '全部' }})</h3>
      <el-row :gutter="16">
        <el-col :span="6">
          <div class="metric-card">
            <div class="metric-label">发票总数</div>
            <div class="metric-value">{{ summary.invoiceCount?.toLocaleString() || 0 }}</div>
            <div class="metric-sub">张</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="metric-card">
            <div class="metric-label">发票总额</div>
            <div class="metric-value">{{ formatMoney(summary.totalAmount) }}</div>
            <div class="metric-sub">MXN</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="metric-card">
            <div class="metric-label">税额合计</div>
            <div class="metric-value">{{ formatMoney(summary.totalTax) }}</div>
            <div class="metric-sub">MXN</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="metric-card">
            <div class="metric-label">已申报税额</div>
            <div class="metric-value green">{{ formatMoney(summary.declaredTax) }}</div>
            <div class="metric-sub">MXN</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="metric-card">
            <div class="metric-label">待申报税额</div>
            <div class="metric-value orange">{{ formatMoney(summary.pendingTax) }}</div>
            <div class="metric-sub">MXN</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="metric-card">
            <div class="metric-label">代扣IVA合计</div>
            <div class="metric-value">{{ formatMoney(summary.retencionIVA) }}</div>
            <div class="metric-sub">MXN</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="metric-card">
            <div class="metric-label">代扣ISR合计</div>
            <div class="metric-value">{{ formatMoney(summary.retencionISR) }}</div>
            <div class="metric-sub">MXN</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="metric-card">
            <div class="metric-label">代扣税额合计</div>
            <div class="metric-value">{{ formatMoney(summary.retencionIVA + summary.retencionISR) }}</div>
            <div class="metric-sub">MXN</div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- Status Breakdown -->
    <el-card shadow="never" class="status-card">
      <h3>申报状态分布</h3>
      <el-row :gutter="16">
        <el-col :span="8">
          <div class="status-item">
            <el-tag type="success" size="large">完整申报</el-tag>
            <span class="status-count">{{ summary.statusBreakdown?.fully || 0 }} 张</span>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="status-item">
            <el-tag type="warning" size="large">部分申报</el-tag>
            <span class="status-count">{{ summary.statusBreakdown?.partial || 0 }} 张</span>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="status-item">
            <el-tag type="info" size="large">暂未申报</el-tag>
            <span class="status-count">{{ summary.statusBreakdown?.pending || 0 }} 张</span>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- Cumulative Summary -->
    <el-card shadow="never" class="cumulative-card">
      <h3>累计汇总 (全部期间)</h3>
      <el-row :gutter="16">
        <el-col :span="6">
          <div class="metric-card cumulative">
            <div class="metric-label">累计发票总数</div>
            <div class="metric-value">{{ cumulative.invoiceCount?.toLocaleString() || 0 }}</div>
            <div class="metric-sub">张</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="metric-card cumulative">
            <div class="metric-label">累计发票总额</div>
            <div class="metric-value">{{ formatMoney(cumulative.totalAmount) }}</div>
            <div class="metric-sub">MXN</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="metric-card cumulative">
            <div class="metric-label">累计税额</div>
            <div class="metric-value">{{ formatMoney(cumulative.totalTax) }}</div>
            <div class="metric-sub">MXN</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="metric-card cumulative">
            <div class="metric-label">累计已申报</div>
            <div class="metric-value green">{{ formatMoney(cumulative.declaredTax) }}</div>
            <div class="metric-sub">MXN</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="metric-card cumulative">
            <div class="metric-label">累计待申报</div>
            <div class="metric-value orange">{{ formatMoney(cumulative.pendingTax) }}</div>
            <div class="metric-sub">MXN</div>
          </div>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getSummary, getCumulativeSummary } from '../api/database'

const selectedPeriod = ref('')
const ledgerType = ref('')
const summary = ref({})
const cumulative = ref({})

const periodOptions = computed(() => {
  const periods = []
  const now = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    periods.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'))
  }
  return periods
})

async function loadData() {
  const period = selectedPeriod.value || null
  const lt = ledgerType.value || null

  summary.value = await getSummary(period, lt)
  cumulative.value = await getCumulativeSummary(lt)
}

function formatMoney(val) {
  if (val == null || isNaN(val)) return '0.00'
  return Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.summary-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.period-card, .summary-card, .status-card, .cumulative-card {
  border-radius: 8px;
}

.period-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

h3 {
  font-size: 15px;
  margin-bottom: 16px;
  color: #303133;
}

.metric-card {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  margin-bottom: 12px;
}

.metric-card.cumulative {
  background: #fdf6ec;
}

.metric-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.metric-value {
  font-size: 24px;
  font-weight: 500;
  color: #303133;
  line-height: 1.2;
}

.metric-value.green {
  color: #67c23a;
}

.metric-value.orange {
  color: #e6a23c;
}

.metric-sub {
  font-size: 11px;
  color: #c0c4cc;
  margin-top: 4px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
}

.status-count {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}
</style>
