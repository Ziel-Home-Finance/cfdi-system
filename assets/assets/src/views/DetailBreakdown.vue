<template>
  <div class="detail-page">
    <el-card shadow="never" class="detail-card">
      <div class="detail-header">
        <h2>余额构成明细</h2>
        <p>查看待申报税额、待抵扣进项等由哪些具体发票构成</p>
      </div>

      <div class="filter-bar">
        <el-radio-group v-model="breakdownType" size="small" @change="loadData">
          <el-radio-button label="pending">待申报税额明细</el-radio-button>
          <el-radio-button label="input_credit">待抵扣进项明细</el-radio-button>
        </el-radio-group>

        <el-select v-model="selectedPeriod" placeholder="选择期间" clearable size="small" style="width: 160px" @change="loadData">
          <el-option v-for="p in periodOptions" :key="p" :label="p" :value="p" />
        </el-select>
      </div>

      <!-- Summary -->
      <div class="breakdown-summary">
        <div class="breakdown-metric">
          <span class="label">明细发票数</span>
          <span class="value">{{ tableData.length.toLocaleString() }}</span>
          <span class="unit">张</span>
        </div>
        <div class="breakdown-metric">
          <span class="label">明细税额合计</span>
          <span class="value orange">{{ formatMoney(totalPendingTax) }}</span>
          <span class="unit">MXN</span>
        </div>
        <div class="breakdown-metric">
          <span class="label">明细发票总额</span>
          <span class="value">{{ formatMoney(totalAmount) }}</span>
          <span class="unit">MXN</span>
        </div>
      </div>

      <!-- Detail Table -->
      <el-table :data="pagedData" v-loading="loading" size="small" border max-height="500" style="margin-top: 16px">
        <el-table-column prop="uuid" label="UUID" width="260" show-overflow-tooltip />
        <el-table-column prop="folio" label="Folio" width="100" />
        <el-table-column prop="fecha" label="开票日期" width="150">
          <template #default="{ row }">{{ formatDate(row.fecha) }}</template>
        </el-table-column>
        <el-table-column prop="billing_period" label="开票期间" width="100" />
        <el-table-column prop="emitter_name" label="开票人" width="160" show-overflow-tooltip />
        <el-table-column prop="receiver_name" label="收票人" width="160" show-overflow-tooltip />
        <el-table-column prop="total" label="含税总额" width="120" align="right">
          <template #default="{ row }">{{ formatMoney(row.total) }}</template>
        </el-table-column>
        <el-table-column prop="tax_amount" label="税额" width="120" align="right">
          <template #default="{ row }">{{ formatMoney(row.tax_amount) }}</template>
        </el-table-column>
        <el-table-column prop="declared_tax_amount" label="已申报" width="120" align="right">
          <template #default="{ row }">{{ formatMoney(row.declared_tax_amount) }}</template>
        </el-table-column>
        <el-table-column prop="pending_tax_amount" label="待申报" width="120" align="right">
          <template #default="{ row }">
            <span class="pending-highlight">{{ formatMoney(row.pending_tax_amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="declare_status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.declare_status)" size="small">
              {{ statusLabel(row.declare_status) }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="tableData.length"
          layout="total, prev, pager, next"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getPendingTaxBreakdown, getInputCreditBreakdown } from '../api/database'

const loading = ref(false)
const breakdownType = ref('pending')
const selectedPeriod = ref('')
const tableData = ref([])
const currentPage = ref(1)
const pageSize = ref(50)

const periodOptions = computed(() => {
  const periods = []
  const now = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    periods.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'))
  }
  return periods
})

const pagedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return tableData.value.slice(start, start + pageSize.value)
})

const totalPendingTax = computed(() => {
  return tableData.value.reduce((sum, r) => sum + (r.pending_tax_amount || 0), 0)
})

const totalAmount = computed(() => {
  return tableData.value.reduce((sum, r) => sum + (r.total || 0), 0)
})

async function loadData() {
  loading.value = true
  currentPage.value = 1
  try {
    const period = selectedPeriod.value || null
    if (breakdownType.value === 'pending') {
      tableData.value = await getPendingTaxBreakdown(period)
    } else {
      tableData.value = await getInputCreditBreakdown(period)
    }
  } finally {
    loading.value = false
  }
}

function formatDate(fecha) {
  if (!fecha) return '-'
  return fecha.replace('T', ' ').substring(0, 19)
}

function formatMoney(val) {
  if (val == null || isNaN(val)) return '0.00'
  return Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function statusLabel(status) {
  const map = { fully: '完整申报', partial: '部分申报', pending: '暂未申报' }
  return map[status] || status || '-'
}

function statusTagType(status) {
  const map = { fully: 'success', partial: 'warning', pending: 'info' }
  return map[status] || 'info'
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.detail-card {
  border-radius: 8px;
}

.detail-header {
  margin-bottom: 20px;
}

.detail-header h2 {
  font-size: 18px;
  margin-bottom: 8px;
}

.detail-header p {
  font-size: 13px;
  color: #909399;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.breakdown-summary {
  display: flex;
  gap: 24px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.breakdown-metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.breakdown-metric .label {
  font-size: 12px;
  color: #909399;
}

.breakdown-metric .value {
  font-size: 20px;
  font-weight: 500;
  color: #303133;
}

.breakdown-metric .value.orange {
  color: #e6a23c;
}

.breakdown-metric .unit {
  font-size: 11px;
  color: #c0c4cc;
}

.pending-highlight {
  color: #e6a23c;
  font-weight: 500;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  padding: 12px 0 0;
}
</style>
