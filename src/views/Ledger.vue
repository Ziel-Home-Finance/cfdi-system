<template>
  <div class="ledger-page">
    <!-- Filter Bar -->
    <el-card class="filter-card" shadow="never">
      <div class="filter-bar">
        <el-radio-group v-model="ledgerType" size="small" @change="handleFilterChange">
          <el-radio-button label="">全部</el-radio-button>
          <el-radio-button label="output">销项税</el-radio-button>
          <el-radio-button label="input">进项税</el-radio-button>
        </el-radio-group>

        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="—"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          size="small"
          style="width: 260px"
          value-format="YYYY-MM-DD"
          @change="handleFilterChange"
        />

        <el-select
          v-model="billingPeriods"
          multiple
          collapse-tags
          collapse-tags-tooltip
          placeholder="开票期间"
          size="small"
          style="width: 180px"
          @change="handleFilterChange"
        >
          <el-option v-for="p in periodOptions" :key="p" :label="p" :value="p" />
        </el-select>

        <el-select v-model="declareStatus" placeholder="申报状态" clearable size="small" style="width: 140px" @change="handleFilterChange">
          <el-option label="完整申报" value="fully" />
          <el-option label="部分申报" value="partial" />
          <el-option label="暂未申报" value="pending" />
        </el-select>

        <el-input v-model="keyword" placeholder="搜索 UUID/Folio/名称" clearable size="small" style="width: 240px" @clear="handleFilterChange" @keyup.enter="handleFilterChange">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>

        <div class="filter-spacer"></div>

        <!-- Column Settings -->
        <el-popover placement="bottom" :width="320" trigger="click">
          <template #reference>
            <el-button size="small">
              <el-icon><Setting /></el-icon>
              列设置
            </el-button>
          </template>
          <div class="column-settings">
            <div class="settings-header">
              <span>列设置（拖动排序 / 勾选显示）</span>
              <el-button text size="small" @click="resetColumns">重置</el-button>
            </div>
            <div class="column-list">
              <div
                v-for="(col, idx) in columnOrder"
                :key="col.prop"
                class="column-item"
                draggable="true"
                @dragstart="onDragStart(idx)"
                @dragover.prevent="onDragOver(idx)"
                @drop="onDrop(idx)"
              >
                <el-checkbox v-model="columnVisibility[col.prop]" size="small" @change="saveColumnConfig">
                  {{ col.label }}
                </el-checkbox>
                <div class="column-move">
                  <el-icon @click="moveColumn(idx, -1)" :class="{ disabled: idx === 0 }"><ArrowUp /></el-icon>
                  <el-icon @click="moveColumn(idx, 1)" :class="{ disabled: idx === columnOrder.length - 1 }"><ArrowDown /></el-icon>
                </div>
              </div>
            </div>
          </div>
        </el-popover>

        <el-button
          size="small"
          :type="editMode ? 'warning' : 'default'"
          @click="toggleEditMode"
        >
          <el-icon><EditPen /></el-icon>
          {{ editMode ? '退出编辑视图' : '编辑视图' }}
        </el-button>

        <el-button size="small" @click="handleSaveView">
          <el-icon><Star /></el-icon>
          保存视图
        </el-button>

        <el-dropdown v-if="savedViews.length" size="small" @command="handleLoadView">
          <el-button size="small">
            <el-icon><View /></el-icon>
            视图列表
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="v in savedViews" :key="v.id" :command="v">
                {{ v.name }}
                <el-tag v-if="v.is_default" size="small" type="success" style="margin-left: 8px">默认</el-tag>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </el-card>

    <!-- Batch Action Bar (Admin only) -->
    <el-card v-if="selectedRows.length" shadow="never" class="batch-bar">
      <div class="batch-actions">
        <span class="batch-info">
          已选 {{ selectAllState === 2 ? total : selectedRows.length }} 条
          <span v-if="selectAllState === 2" class="batch-all-hint">（全部页）</span>
        </span>
        <el-select v-model="batchStatus" placeholder="选择申报状态" size="small" style="width: 140px">
          <el-option label="完整申报" value="fully" />
          <el-option label="部分申报" value="partial" />
          <el-option label="暂未申报" value="pending" />
        </el-select>
        <el-input-number
          v-if="batchStatus === 'partial'"
          v-model="batchDeclaredAmount"
          placeholder="已申报税额"
          size="small"
          style="width: 160px"
          :precision="2"
          :step="0.01"
          :min="0"
        />
        <span v-if="batchStatus === 'fully'" class="batch-hint">
          完整申报：已申报税额将自动设为各发票的税额
        </span>
        <span v-if="batchStatus === 'pending'" class="batch-hint">
          暂未申报：已申报税额将自动清零
        </span>
        <el-button type="primary" size="small" @click="handleBatchUpdate" :disabled="!batchStatus">批量更新</el-button>
        <el-button type="danger" size="small" @click="handleBatchDelete">批量删除</el-button>
        <el-button size="small" @click="clearAllSelection">取消</el-button>
      </div>
    </el-card>

    <!-- Data Table -->
    <el-card shadow="never" class="table-card">
      <!-- Select-all status bar -->
      <div v-if="selectAllState > 0" class="select-all-bar">
        <span v-if="selectAllState === 1">
          已选中当前页 {{ selectedRows.length }} 条 · <el-button text size="small" @click="selectAllPages">点击选择全部 {{ total }} 条</el-button>
        </span>
        <span v-if="selectAllState === 2">
          已选中全部 {{ total }} 条 · <el-button text size="small" @click="clearAllSelection">取消全选</el-button>
        </span>
      </div>

      <el-table
        ref="tableRef"
        :data="filteredTableData"
        v-loading="loading"
        @selection-change="handleSelectionChange"
        @select-all="handleSelectAll"
        @sort-change="handleSortChange"
        style="width: 100%"
        size="small"
        border
        class="compact-table"
      >
        <el-table-column type="selection" width="45" :selectable="() => true" />

        <el-table-column
          v-for="col in visibleColumns"
          :key="col.prop"
          :prop="col.prop"
          :label="col.label"
          :width="col.width"
          :sortable="col.sortable ? 'custom' : false"
          :align="col.align || 'left'"
          show-overflow-tooltip
        >
          <!-- Custom header with Excel-style filter dropdown -->
          <template #header>
            <div class="col-header">
              <span class="col-label">{{ col.label }}</span>
              <el-popover
                v-if="col.filterable"
                placement="bottom"
                :width="220"
                trigger="click"
                @show="onFilterPopoverShow(col.prop)"
              >
                <template #reference>
                  <el-icon
                    class="filter-icon"
                    :class="{ 'filter-active': columnFilters[col.prop] }"
                    @click.stop
                  >
                    <ArrowDown />
                  </el-icon>
                </template>
                <div class="filter-dropdown">
                  <el-input
                    v-model="columnFilters[col.prop]"
                    size="small"
                    placeholder="输入筛选值"
                    clearable
                    @input="applyColumnFilters"
                    @clear="applyColumnFilters"
                  >
                    <template #prefix><el-icon><Search /></el-icon></template>
                  </el-input>
                  <div v-if="col.prop === 'declare_status'" class="filter-quick-options">
                    <el-button text size="small" @click="setColumnFilter(col.prop, 'fully')">完整申报</el-button>
                    <el-button text size="small" @click="setColumnFilter(col.prop, 'partial')">部分申报</el-button>
                    <el-button text size="small" @click="setColumnFilter(col.prop, 'pending')">暂未申报</el-button>
                  </div>
                  <div v-if="col.prop === 'invoice_type'" class="filter-quick-options">
                    <el-button text size="small" @click="setColumnFilter(col.prop, 'I')">I (收入)</el-button>
                    <el-button text size="small" @click="setColumnFilter(col.prop, 'E')">E (支出)</el-button>
                    <el-button text size="small" @click="setColumnFilter(col.prop, 'P')">P (支付)</el-button>
                    <el-button text size="small" @click="setColumnFilter(col.prop, 'R')">R (代扣)</el-button>
                  </div>
                  <div v-if="col.prop === 'invoice_status'" class="filter-quick-options">
                    <el-button text size="small" @click="setColumnFilter(col.prop, 'Vigente')">存续</el-button>
                    <el-button text size="small" @click="setColumnFilter(col.prop, 'Cancelada')">已取消</el-button>
                  </div>
                  <div class="filter-actions">
                    <el-button text size="small" @click="clearColumnFilter(col.prop)">清除</el-button>
                  </div>
                </div>
              </el-popover>
            </div>
          </template>

          <!-- Custom cell rendering -->
          <template #default="{ row }">
            <template v-if="col.prop === 'uuid'">
              <span class="uuid-cell" @click="showDetail(row)">{{ row.uuid }}</span>
            </template>
            <template v-else-if="col.prop === 'related_uuid'">
              <span class="related-uuid-cell" :class="{ 'has-value': row.related_uuid }">
                {{ row.related_uuid || '-' }}
              </span>
            </template>
            <template v-else-if="col.prop === 'fecha'">
              {{ formatDate(row.fecha) }}
            </template>
            <template v-else-if="col.prop === 'invoice_type'">
              <el-tag :type="invoiceTypeTagType(row.invoice_type)" size="small" effect="plain">
                {{ row.invoice_type || '-' }}
              </el-tag>
            </template>
            <template v-else-if="col.prop === 'invoice_status'">
              <el-tag :type="invoiceStatusTagType(row.invoice_status)" size="small" effect="dark">
                {{ invoiceStatusLabel(row.invoice_status) }}
              </el-tag>
            </template>
            <template v-else-if="col.prop === 'total'">
              {{ formatMoney(row.total) }}
            </template>
            <template v-else-if="col.prop === 'tax_amount'">
              {{ formatMoney(row.tax_amount) }}
            </template>
            <template v-else-if="col.prop === 'tax_rate'">
              {{ row.tax_rate ? (row.tax_rate * 100).toFixed(2) + '%' : '-' }}
            </template>
            <template v-else-if="col.prop === 'declare_status'">
              <el-tag :type="statusTagType(row.declare_status)" size="small">
                {{ statusLabel(row.declare_status) }}
              </el-tag>
            </template>
            <template v-else-if="col.prop === 'declared_tax_amount'">
              {{ formatMoney(row.declared_tax_amount) }}
            </template>
            <template v-else-if="col.prop === 'pending_tax_amount'">
              <span :class="{ 'pending-highlight': row.pending_tax_amount > 0 }">
                {{ formatMoney(row.pending_tax_amount) }}
              </span>
            </template>
            <template v-else-if="col.prop === 'retencion_iva'">
              {{ row.retencion_iva ? formatMoney(row.retencion_iva) : '-' }}
            </template>
            <template v-else-if="col.prop === 'retencion_isr'">
              {{ row.retencion_isr ? formatMoney(row.retencion_isr) : '-' }}
            </template>
            <template v-else>
              {{ row[col.prop] || '-' }}
            </template>
          </template>
        </el-table-column>

        <el-table-column v-if="editMode" label="操作" width="120" fixed="right" align="center">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button text size="small" @click="handleEdit(row)">编辑</el-button>
              <el-button text size="small" type="danger" @click="handleDelete(row)">删除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- Pagination -->
      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="pageSizes"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handlePageSizeChange"
          @current-change="loadData"
        />
      </div>
    </el-card>

    <!-- Edit Dialog -->
    <el-dialog v-model="editDialogVisible" title="编辑发票" width="700px">
      <el-form :model="editForm" label-width="120px" size="small">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="UUID">
              <el-input v-model="editForm.uuid" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="Folio">
              <el-input v-model="editForm.folio" disabled />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="SAP客商编码">
              <el-input v-model="editForm.sap_vendor_code" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="SAP客商名称">
              <el-input v-model="editForm.sap_vendor_name" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="申报期间">
              <el-input v-model="editForm.declare_period" placeholder="YYYY-MM" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="申报状态">
              <el-select v-model="editForm.declare_status" style="width: 100%">
                <el-option label="完整申报" value="fully" />
                <el-option label="部分申报" value="partial" />
                <el-option label="暂未申报" value="pending" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="已申报税额">
              <el-input-number v-model="editForm.declared_tax_amount" :precision="2" :step="0.01" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="待申报税额">
              <el-input-number :model-value="editForm.tax_amount - editForm.declared_tax_amount" :precision="2" :step="0.01" disabled style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- Detail Dialog -->
    <el-dialog v-model="detailDialogVisible" title="发票详情" width="800px">
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="UUID">{{ detailData.uuid }}</el-descriptions-item>
        <el-descriptions-item label="关联UUID">{{ detailData.related_uuid || '-' }}</el-descriptions-item>
        <el-descriptions-item label="Folio">{{ detailData.folio }}</el-descriptions-item>
        <el-descriptions-item label="开票日期">{{ formatDate(detailData.fecha) }}</el-descriptions-item>
        <el-descriptions-item label="开票期间">{{ detailData.billing_period }}</el-descriptions-item>
        <el-descriptions-item label="发票状态">
          <el-tag :type="invoiceStatusTagType(detailData.invoice_status)" size="small" effect="dark">
            {{ invoiceStatusLabel(detailData.invoice_status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="含税总额">{{ formatMoney(detailData.total) }}</el-descriptions-item>
        <el-descriptions-item label="不含税额">{{ formatMoney(detailData.subtotal) }}</el-descriptions-item>
        <el-descriptions-item label="税额">{{ formatMoney(detailData.tax_amount) }}</el-descriptions-item>
        <el-descriptions-item label="税率">{{ detailData.tax_rate ? (detailData.tax_rate * 100).toFixed(2) + '%' : '-' }}</el-descriptions-item>
        <el-descriptions-item label="开票人">{{ detailData.emitter_name }}</el-descriptions-item>
        <el-descriptions-item label="开票人RFC">{{ detailData.emitter_rfc }}</el-descriptions-item>
        <el-descriptions-item label="收票人">{{ detailData.receiver_name }}</el-descriptions-item>
        <el-descriptions-item label="收票人RFC">{{ detailData.receiver_rfc }}</el-descriptions-item>
        <el-descriptions-item label="商品/服务摘要" :span="2">{{ detailData.description }}</el-descriptions-item>
        <el-descriptions-item label="SAP客商编码">{{ detailData.sap_vendor_code || '-' }}</el-descriptions-item>
        <el-descriptions-item label="SAP客商名称">{{ detailData.sap_vendor_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="申报期间">{{ detailData.declare_period || '-' }}</el-descriptions-item>
        <el-descriptions-item label="申报状态">{{ statusLabel(detailData.declare_status) }}</el-descriptions-item>
        <el-descriptions-item label="已申报税额">{{ formatMoney(detailData.declared_tax_amount) }}</el-descriptions-item>
        <el-descriptions-item label="待申报税额">{{ formatMoney(detailData.pending_tax_amount) }}</el-descriptions-item>
        <el-descriptions-item label="代扣IVA">{{ detailData.retencion_iva ? formatMoney(detailData.retencion_iva) : '-' }}</el-descriptions-item>
        <el-descriptions-item label="代扣ISR">{{ detailData.retencion_isr ? formatMoney(detailData.retencion_isr) : '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>

    <!-- Save View Dialog -->
    <el-dialog v-model="viewDialogVisible" title="保存视图" width="400px">
      <el-form size="small">
        <el-form-item label="视图名称">
          <el-input v-model="viewName" placeholder="输入视图名称" />
        </el-form-item>
        <el-form-item label="设为默认">
          <el-switch v-model="viewIsDefault" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="viewDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmSaveView">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, nextTick, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getInvoices, updateInvoice, deleteInvoice, batchUpdateDeclareStatus,
  getSavedViews, saveView, getDefaultView, deleteView
} from '../api/database'

const loading = ref(false)
const tableData = ref([])
const tableRef = ref(null)
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(100)
const tableHeight = ref(600)
const selectedRows = ref([])

// Edit view is intentionally disabled by default so destructive row actions stay hidden.
const editMode = ref(false)

function toggleEditMode() {
  editMode.value = !editMode.value
  ElMessage.info(editMode.value ? '已进入编辑视图，可编辑或删除发票' : '已退出编辑视图')
}

// Dynamic page sizes: 100, 500, 1000, and Total (all data)
const pageSizes = computed(() => {
  const sizes = [100, 500, 1000]
  // Add "Total/page" option — use total value, avoid duplicates
  if (total.value > 1000 && !sizes.includes(total.value)) {
    sizes.push(total.value)
  }
  return sizes
})

// Handle page size change — when selecting "Total/page", jump to page 1
function handlePageSizeChange() {
  currentPage.value = 1
  loadData()
}

// Filters
const ledgerType = ref('')
const dateRange = ref([])
const billingPeriods = ref([])
const declareStatus = ref('')
const keyword = ref('')

// Sort
const sortBy = ref('fecha')
const sortOrder = ref('desc')

// Batch
const batchStatus = ref('')
const batchDeclaredAmount = ref(0)

// Edit dialog
const editDialogVisible = ref(false)
const editForm = reactive({})

// Detail dialog
const detailDialogVisible = ref(false)
const detailData = ref({})

// View dialog
const viewDialogVisible = ref(false)
const viewName = ref('')
const viewIsDefault = ref(false)
const savedViews = ref([])

// ─── Column Configuration ───

const defaultColumns = [
  { prop: 'uuid', label: 'UUID', width: 280, sortable: true, filterable: false },
  { prop: 'related_uuid', label: '关联UUID', width: 280, sortable: false, filterable: true },
  { prop: 'folio', label: 'Folio', width: 100, sortable: true, filterable: false },
  { prop: 'fecha', label: '开票日期', width: 160, sortable: true, filterable: false },
  { prop: 'billing_period', label: '开票期间', width: 100, sortable: true, filterable: false },
  { prop: 'invoice_type', label: '发票类型', width: 90, align: 'center', sortable: true, filterable: true },
  { prop: 'invoice_status', label: '发票状态', width: 90, align: 'center', sortable: true, filterable: true },
  { prop: 'total', label: '含税总额', width: 120, sortable: true, align: 'right', filterable: false },
  { prop: 'tax_amount', label: '税额', width: 120, sortable: true, align: 'right', filterable: false },
  { prop: 'tax_rate', label: '税率', width: 80, align: 'center', filterable: false },
  { prop: 'emitter_name', label: '开票人', width: 180, sortable: true, filterable: true },
  { prop: 'emitter_rfc', label: '开票人RFC', width: 130, filterable: true },
  { prop: 'receiver_name', label: '收票人', width: 180, sortable: true, filterable: true },
  { prop: 'receiver_rfc', label: '收票人RFC', width: 130, filterable: true },
  { prop: 'description', label: '商品/服务摘要', width: 200, filterable: false },
  { prop: 'sap_vendor_code', label: 'SAP编码', width: 100, filterable: true },
  { prop: 'sap_vendor_name', label: 'SAP名称', width: 150, filterable: false },
  { prop: 'declare_period', label: '申报期间', width: 100, sortable: true, filterable: false },
  { prop: 'declare_status', label: '申报状态', width: 120, align: 'center', sortable: true, filterable: true },
  { prop: 'declared_tax_amount', label: '已申报税额', width: 120, align: 'right', sortable: true, filterable: false },
  { prop: 'pending_tax_amount', label: '待申报税额', width: 120, align: 'right', sortable: true, filterable: false },
  { prop: 'retencion_iva', label: '代扣IVA', width: 100, align: 'right', filterable: false },
  { prop: 'retencion_isr', label: '代扣ISR', width: 100, align: 'right', filterable: false },
]

// Load column config from localStorage
function loadColumnConfig() {
  const saved = localStorage.getItem('cfdi_column_order')
  const savedVis = localStorage.getItem('cfdi_column_visibility')
  if (saved) {
    const order = JSON.parse(saved)
    // Rebuild column order array from saved order, adding any new columns at the end
    const ordered = order.map(prop => defaultColumns.find(c => c.prop === prop)).filter(Boolean)
    // Add any new columns not in saved order
    for (const col of defaultColumns) {
      if (!order.includes(col.prop)) ordered.push(col)
    }
    return ordered
  }
  return [...defaultColumns]
}

function loadVisibility() {
  const saved = localStorage.getItem('cfdi_column_visibility')
  if (saved) return JSON.parse(saved)
  // Default: all data columns visible. The operation column is controlled only by editMode.
  const vis = {}
  for (const col of defaultColumns) vis[col.prop] = true
  return vis
}

const columnOrder = ref(loadColumnConfig())
const columnVisibility = reactive(loadVisibility())
const columnFilters = reactive({})

// Drag state for column reordering
let dragIndex = null

function onDragStart(idx) {
  dragIndex = idx
}

function onDragOver(idx) {
  // Visual feedback could be added here
}

function onDrop(idx) {
  if (dragIndex === null || dragIndex === idx) return
  const item = columnOrder.value.splice(dragIndex, 1)[0]
  columnOrder.value.splice(idx, 0, item)
  dragIndex = null
  saveColumnConfig()
}

function moveColumn(idx, direction) {
  const newIdx = idx + direction
  if (newIdx < 0 || newIdx >= columnOrder.value.length) return
  const temp = columnOrder.value[idx]
  columnOrder.value[idx] = columnOrder.value[newIdx]
  columnOrder.value[newIdx] = temp
  saveColumnConfig()
}

function saveColumnConfig() {
  localStorage.setItem('cfdi_column_order', JSON.stringify(columnOrder.value.map(c => c.prop)))
  localStorage.setItem('cfdi_column_visibility', JSON.stringify(columnVisibility))
}

function resetColumns() {
  columnOrder.value = [...defaultColumns]
  for (const col of defaultColumns) {
    columnVisibility[col.prop] = true
  }
  saveColumnConfig()
}

// Visible columns in order
const visibleColumns = computed(() => {
  return columnOrder.value.filter(col => columnVisibility[col.prop])
})

// ─── Column-level filtering ───

const filteredTableData = computed(() => {
  if (!tableData.value.length) return tableData.value

  let result = tableData.value

  for (const [prop, filterVal] of Object.entries(columnFilters)) {
    if (!filterVal) continue

    if (prop === 'declare_status') {
      // Enum filter: match status label
      const kw = filterVal.toLowerCase()
      result = result.filter(r => {
        const label = statusLabel(r.declare_status).toLowerCase()
        return label.includes(kw) || String(r.declare_status || '').toLowerCase().includes(kw)
      })
    } else {
      // Text filter: case-insensitive includes
      const kw = String(filterVal).toLowerCase()
      result = result.filter(r => {
        const val = r[prop]
        return val != null && String(val).toLowerCase().includes(kw)
      })
    }
  }

  return result
})

function applyColumnFilters() {
  // Trigger reactivity - the computed property handles the filtering
}

function setColumnFilter(prop, value) {
  columnFilters[prop] = value
  applyColumnFilters()
}

function clearColumnFilter(prop) {
  columnFilters[prop] = ''
  applyColumnFilters()
}

function onFilterPopoverShow(prop) {
  // Ensure the filter value is initialized when popover opens
  if (!columnFilters[prop]) {
    columnFilters[prop] = ''
  }
}

// Generate month options for the multi-select dropdown (last 24 months)
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
  loading.value = true
  try {
    const result = await getInvoices({
      page: currentPage.value,
      pageSize: pageSize.value,
      ledgerType: ledgerType.value || null,
      dateRange: dateRange.value || null,
      billingPeriods: billingPeriods.value || null,
      declareStatus: declareStatus.value || null,
      keyword: keyword.value || null,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value
    })
    tableData.value = result.data || []
    total.value = result.total || 0
  } catch (err) {
    console.error('[Ledger] loadData error:', err)
    const errMsg = err?.message || err?.name || String(err || '未知错误')
    ElMessage.error('加载数据失败: ' + errMsg)
    // Reset to empty state to avoid rendering errors
    tableData.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

// Debounce filter changes to avoid rapid-fire requests during multi-select
let _filterTimer = null
function handleFilterChange() {
  currentPage.value = 1
  if (_filterTimer) clearTimeout(_filterTimer)
  _filterTimer = setTimeout(() => {
    loadData()
    _filterTimer = null
  }, 300)
}

function handleSortChange({ prop, order }) {
  if (prop) {
    sortBy.value = prop
    sortOrder.value = order === 'ascending' ? 'asc' : 'desc'
    loadData()
  }
}

// Three-state select-all: 0=none, 1=current page, 2=all pages
const selectAllState = ref(0)
const allPageUuids = ref([]) // stores all UUIDs when "select all pages" is active

function handleSelectionChange(rows) {
  selectedRows.value = rows

  // Update selectAllState based on selection
  if (selectAllState.value === 2) {
    // In "all pages" mode, keep state as 2 unless user deselects
    if (rows.length === 0) {
      selectAllState.value = 0
    }
    return
  }

  const pageSize = filteredTableData.value.length
  if (rows.length === 0) {
    selectAllState.value = 0
  } else if (rows.length === pageSize) {
    selectAllState.value = 1
  } else {
    selectAllState.value = 0 // partial selection, treat as state 0
  }
}

// Called when user clicks the header checkbox
function handleSelectAll(selection) {
  // selection is true when header checkbox is checked, false when unchecked
  if (selection) {
    // Click 1: select current page
    selectAllState.value = 1
  } else {
    if (selectAllState.value === 2) {
      // Click 3: from "all pages" → uncheck → go to none
      selectAllState.value = 0
      allPageUuids.value = []
    } else if (selectAllState.value === 1) {
      // Click from "current page" → uncheck → go to none
      selectAllState.value = 0
    } else {
      selectAllState.value = 0
    }
  }
}

// Called when user clicks "select all pages" button
async function selectAllPages() {
  selectAllState.value = 2
  try {
    const result = await getInvoices({
      page: 1,
      pageSize: 999999,
      ledgerType: ledgerType.value || null,
      dateRange: dateRange.value || null,
      billingPeriods: billingPeriods.value || null,
      declareStatus: declareStatus.value || null,
      keyword: keyword.value || null,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value
    })
    allPageUuids.value = (result.data || []).map(r => r.uuid)
    selectedRows.value = result.data || []
    ElMessage.success(`已选择全部 ${result.total || 0} 条数据`)
  } catch (err) {
    console.error('[Ledger] selectAllPages error:', err)
    ElMessage.error('加载全部数据失败: ' + (err?.message || String(err)))
    selectAllState.value = 0
  }
}

function clearAllSelection() {
  selectAllState.value = 0
  allPageUuids.value = []
  selectedRows.value = []
  tableRef.value?.clearSelection()
}

async function handleBatchUpdate() {
  if (!batchStatus.value) {
    ElMessage.warning('请选择申报状态')
    return
  }

  // Use all selected rows (includes cross-page selection when selectAllState === 2)
  const rowsToUpdate = selectAllState.value === 2 ? selectedRows.value : selectedRows.value

  const updates = rowsToUpdate.map(row => {
    let declaredAmount = row.declared_tax_amount || 0

    if (batchStatus.value === 'fully') {
      declaredAmount = row.tax_amount || 0
    } else if (batchStatus.value === 'pending') {
      declaredAmount = 0
    } else if (batchStatus.value === 'partial') {
      declaredAmount = batchDeclaredAmount.value || 0
    }

    return {
      uuid: row.uuid,
      declare_status: batchStatus.value,
      declared_tax_amount: declaredAmount,
      pending_tax_amount: (row.tax_amount || 0) - declaredAmount
    }
  })

  await batchUpdateDeclareStatus(updates)
  ElMessage.success(`已更新 ${updates.length} 条记录`)
  clearAllSelection()
  batchStatus.value = ''
  batchDeclaredAmount.value = 0
  loadData()
}

async function handleBatchDelete() {
  const count = selectAllState.value === 2 ? total.value : selectedRows.value.length
  await ElMessageBox.confirm(
    `确认删除选中的 ${count} 条发票记录？此操作不可撤销！`,
    '批量删除确认',
    { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
  )

  const uuids = selectedRows.value.map(r => r.uuid)
  for (const uuid of uuids) {
    await deleteInvoice(uuid)
  }

  ElMessage.success(`已删除 ${uuids.length} 条记录`)
  clearAllSelection()
  loadData()
}

function handleEdit(row) {
  Object.assign(editForm, row)
  editDialogVisible.value = true
}

async function handleSaveEdit() {
  const updates = {
    sap_vendor_code: editForm.sap_vendor_code,
    sap_vendor_name: editForm.sap_vendor_name,
    declare_period: editForm.declare_period,
    declare_status: editForm.declare_status,
    declared_tax_amount: editForm.declared_tax_amount,
    pending_tax_amount: editForm.tax_amount - editForm.declared_tax_amount
  }
  await updateInvoice(editForm.uuid, updates)
  ElMessage.success('保存成功')
  editDialogVisible.value = false
  loadData()
}

async function handleDelete(row) {
  await ElMessageBox.confirm(`确认删除发票 ${row.uuid}？`, '删除确认', { type: 'warning' })
  await deleteInvoice(row.uuid)
  ElMessage.success('删除成功')
  loadData()
}

function showDetail(row) {
  detailData.value = row
  detailDialogVisible.value = true
}

function handleSaveView() {
  viewName.value = ''
  viewIsDefault.value = false
  viewDialogVisible.value = true
}

async function confirmSaveView() {
  if (!viewName.value) {
    ElMessage.warning('请输入视图名称')
    return
  }
  const config = {
    ledgerType: ledgerType.value,
    dateRange: dateRange.value,
    billingPeriods: billingPeriods.value,
    declareStatus: declareStatus.value,
    keyword: keyword.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
    pageSize: pageSize.value,
    columnOrder: columnOrder.value.map(c => c.prop),
    columnVisibility: { ...columnVisibility }
  }
  await saveView(viewName.value, config, viewIsDefault.value)
  ElMessage.success('视图已保存')
  viewDialogVisible.value = false
  loadSavedViews()
}

async function loadSavedViews() {
  savedViews.value = await getSavedViews()
}

function handleLoadView(view) {
  const config = typeof view.config === 'string' ? JSON.parse(view.config) : view.config
  ledgerType.value = config.ledgerType || ''
  dateRange.value = config.dateRange || []
  billingPeriods.value = config.billingPeriods || []
  declareStatus.value = config.declareStatus || ''
  keyword.value = config.keyword || ''
  sortBy.value = config.sortBy || 'fecha'
  sortOrder.value = config.sortOrder || 'desc'
  pageSize.value = config.pageSize || 100
  currentPage.value = 1

  // Load column config from view
  if (config.columnOrder) {
    const ordered = config.columnOrder
      .map(prop => defaultColumns.find(c => c.prop === prop))
      .filter(Boolean)
    for (const col of defaultColumns) {
      if (!config.columnOrder.includes(col.prop)) ordered.push(col)
    }
    columnOrder.value = ordered
  }
  if (config.columnVisibility) {
    Object.assign(columnVisibility, config.columnVisibility)
  }

  loadData()
  ElMessage.success('已加载视图: ' + view.name)
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

function invoiceTypeTagType(type) {
  const map = { I: 'danger', E: 'success', P: 'info', R: 'warning' }
  return map[type] || 'info'
}

function invoiceStatusLabel(status) {
  if (!status) return '-'
  const map = { Vigente: '存续', Cancelada: '已取消' }
  return map[status] || status
}

function invoiceStatusTagType(status) {
  if (status === 'Cancelada') return 'danger'
  return 'success'
}

function syncTableHorizontalScroll() {
  const tableEl = tableRef.value?.$el
  const header = tableEl?.querySelector('.el-table__header-wrapper')
  const headerTable = header?.querySelector('table')
  const bodyWrap = tableEl?.querySelector('.el-table__body-wrapper .el-scrollbar__wrap')
  if (!header || !headerTable || !bodyWrap) return
  const left = bodyWrap.scrollLeft
  // Sticky header is outside the normal table flow, so mirror the body offset
  // on the header table itself instead of relying on wrapper scrollLeft.
  header.scrollLeft = 0
  headerTable.style.transform = `translate3d(${-left}px, 0, 0)`
}

function bindTableHorizontalScroll() {
  const tableEl = tableRef.value?.$el
  const bodyWrap = tableEl?.querySelector('.el-table__body-wrapper .el-scrollbar__wrap')
  if (!bodyWrap) return
  bodyWrap.removeEventListener('scroll', syncTableHorizontalScroll)
  bodyWrap.addEventListener('scroll', syncTableHorizontalScroll, { passive: true })
  syncTableHorizontalScroll()
}

async function syncTableLayout() {
  await nextTick()
  tableRef.value?.doLayout?.()
  bindTableHorizontalScroll()
}

watch([visibleColumns, editMode, tableData, tableHeight], syncTableLayout, { flush: 'post' })

onMounted(async () => {
  try {
    const defaultView = await getDefaultView()
    if (defaultView) {
      handleLoadView(defaultView)
    } else {
      loadData()
    }
    loadSavedViews()
  } catch (err) {
    console.error('[Ledger] onMounted error:', err)
    // Fallback: load data directly if default view fails
    loadData()
  }

  tableHeight.value = window.innerHeight - 280
  window.addEventListener('resize', () => {
    tableHeight.value = window.innerHeight - 280
  })
})
</script>

<style scoped>
.ledger-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 20px;
}

.filter-card {
  border-radius: 8px;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-spacer {
  flex: 1;
}

.batch-bar {
  border-radius: 8px;
  border-left: 3px solid #409eff;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.batch-info {
  font-size: 13px;
  color: #409eff;
  font-weight: 500;
}

.batch-hint {
  font-size: 12px;
  color: #909399;
}

.batch-all-hint {
  font-size: 11px;
  color: #e6a23c;
  margin-left: 4px;
}

.select-all-bar {
  background: #ecf5ff;
  border: 1px solid #d9ecff;
  border-radius: 4px;
  padding: 8px 12px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #409eff;
  display: flex;
  align-items: center;
  gap: 8px;
}

.table-card {
  border-radius: 8px;
  overflow: visible;
}

.table-card :deep(.el-card__body) {
  overflow: visible;
}

.uuid-cell {
  color: #409eff;
  cursor: pointer;
  font-family: 'Times New Roman', Times, serif;
  font-size: 12px;
}

.uuid-cell:hover {
  text-decoration: underline;
}

.related-uuid-cell {
  font-family: 'Times New Roman', Times, serif;
  font-size: 12px;
  color: #909399;
}

.related-uuid-cell.has-value {
  color: #606266;
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

/* Column Settings Popover */
.column-settings {
  max-height: 400px;
  overflow-y: auto;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 500;
  color: #303133;
}

.column-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.column-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: move;
  background: #f5f7fa;
}

.column-item:hover {
  background: #ecf5ff;
}

.column-move {
  display: flex;
  gap: 4px;
}

.column-move .el-icon {
  cursor: pointer;
  color: #909399;
  font-size: 14px;
}

.column-move .el-icon:hover {
  color: #409eff;
}

.column-move .el-icon.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Column Header - single line, Excel-style */
.col-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  width: 100%;
  height: 100%;
}

.col-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-icon {
  cursor: pointer;
  font-size: 12px;
  color: #c0c4cc;
  flex-shrink: 0;
  padding: 2px;
  border-radius: 3px;
  transition: all 0.2s;
}

.filter-icon:hover {
  color: #409eff;
  background: #ecf5ff;
}

.filter-icon.filter-active {
  color: #409eff;
  background: #ecf5ff;
}

/* Filter Dropdown Popover */
.filter-dropdown {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-quick-options {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-top: 4px;
  border-top: 1px solid #ebeef5;
}

.filter-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
  border-top: 1px solid #ebeef5;
}

/* Element Plus renders header/body as separate native tables. Reset native table
   border spacing so their horizontal scroll ranges remain identical. */
.compact-table :deep(.el-table__header),
.compact-table :deep(.el-table__body) {
  border-spacing: 0;
}

/* Element Plus calculates each .cell width from the column width. Horizontal
   padding must stay on .cell (the library default), not on td/th; otherwise
   the final data cell extends beyond its 100px column and adds scroll width. */
.compact-table :deep(.el-table__cell) {
  padding: 2px 0;
  box-sizing: border-box;
}

.compact-table :deep(.el-table__row) {
  height: 32px;
}

.compact-table {
  overflow: visible;
}

.compact-table :deep(.el-table__header-wrapper) {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.compact-table :deep(.el-table__header-wrapper .el-table__cell) {
  padding: 4px 0;
}

.compact-table :deep(.el-table__header-wrapper .col-header) {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
  padding-right: 18px;
  box-sizing: border-box;
}

.compact-table :deep(.el-table__header-wrapper .col-label) {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-table :deep(.el-table__header-wrapper .filter-icon) {
  position: absolute;
  top: 50%;
  right: 0;
  width: 16px;
  height: 16px;
  transform: translateY(-50%);
}

.action-buttons {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
}

.action-buttons :deep(.el-button) {
  margin: 0;
  padding: 0 4px;
}
</style>
