<template>
  <div class="upload-page">
    <el-card shadow="never" class="upload-card">
      <div class="upload-header">
        <h2>XML 批量上传</h2>
        <p>选择或拖拽 CFDI XML 文件，系统自动解析并入库</p>
      </div>

      <el-upload
        ref="uploadRef"
        drag
        multiple
        accept=".xml"
        :auto-upload="false"
        :on-change="handleFileChange"
        :on-remove="handleFileRemove"
        :file-list="fileList"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">拖拽 XML 文件到此处，或<em>点击选择</em></div>
        <template #tip>
          <div class="el-upload__tip">支持 CFDI 3.3 / 4.0 / Retencion 格式，可同时上传多个文件</div>
        </template>
      </el-upload>

      <div v-if="fileList.length" class="file-actions">
        <el-button type="primary" :loading="parsing" @click="handleParseAll">
          <el-icon><MagicStick /></el-icon>
          解析 {{ fileList.length }} 个文件
        </el-button>
        <el-button @click="handleClearAll">清空</el-button>
      </div>
    </el-card>

    <el-card shadow="never" class="sat-card">
      <div class="sat-header">
        <div>
          <h2>从 SAT 下载 XML 并入库</h2>
          <p>按指定期间申请下载我方开具或收到的 CFDI。认证凭据仅保存在企业受控的 Supabase 服务端。</p>
        </div>
        <el-tag type="info" effect="plain">异步任务</el-tag>
      </div>

      <el-form :model="satForm" label-width="88px" class="sat-form">
        <el-form-item label="下载期间">
          <el-date-picker
            v-model="satForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            :disabled="satSubmitting || satPolling"
          />
        </el-form-item>
        <el-form-item label="下载范围">
          <el-radio-group v-model="satForm.scope" :disabled="satSubmitting || satPolling">
            <el-radio-button label="issued">我方开具</el-radio-button>
            <el-radio-button label="received">我方收到</el-radio-button>
            <el-radio-button label="all">全部</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="satSubmitting" :disabled="satPolling" @click="handleCreateSatTask">
            <el-icon><Download /></el-icon>
            从 SAT 下载并入库
          </el-button>
          <span class="sat-note">大量期间将由后台分包下载，请勿重复提交。</span>
        </el-form-item>
      </el-form>

      <div v-if="satTask" class="sat-task-panel">
        <div class="sat-task-title">
          <span>任务状态</span>
          <el-tag :type="satStatusType">{{ satStatusLabel }}</el-tag>
        </div>
        <el-progress :percentage="satTask.progress || 0" :status="satTask.status === 'failed' ? 'exception' : satTask.status === 'completed' ? 'success' : undefined" />
        <el-descriptions :column="4" size="small" border class="sat-task-details">
          <el-descriptions-item label="期间">{{ satTask.start_date }} 至 {{ satTask.end_date }}</el-descriptions-item>
          <el-descriptions-item label="范围">{{ satScopeLabel(satTask.request_scope) }}</el-descriptions-item>
          <el-descriptions-item label="数据包">{{ satTask.package_count || 0 }}</el-descriptions-item>
          <el-descriptions-item label="XML 数">{{ satTask.xml_count || 0 }}</el-descriptions-item>
          <el-descriptions-item label="已入库">{{ satTask.inserted_count || 0 }}</el-descriptions-item>
          <el-descriptions-item label="重复">{{ satTask.duplicate_count || 0 }}</el-descriptions-item>
          <el-descriptions-item label="失败">{{ satTask.failed_count || 0 }}</el-descriptions-item>
          <el-descriptions-item label="任务编号">{{ satTask.id }}</el-descriptions-item>
        </el-descriptions>
        <el-alert v-if="satTask.status === 'waiting_user'" title="SAT 已处理 48 小时仍未生成下载包。可以继续等待，系统将每小时查询一次；也可以结束本次任务，之后重新创建申请。" type="warning" :closable="false" show-icon class="sat-waiting-alert">
          <template #default>
            <div class="sat-decision-actions">
              <el-button type="primary" size="small" :loading="satDeciding" @click="handleSatDecision('continue')">继续等待</el-button>
              <el-button size="small" :loading="satDeciding" @click="handleSatDecision('cancel')">结束本次任务</el-button>
            </div>
          </template>
        </el-alert>
        <el-alert v-if="satTask.error_message && satTask.status !== 'waiting_user'" :title="satTask.error_message" :type="satTask.status === 'cancelled' ? 'info' : 'error'" :closable="false" show-icon />
      </div>
    </el-card>

    <!-- Parse Progress -->
    <el-card v-if="parsing || parseProgress.total > 0" shadow="never" class="progress-card">
      <div class="progress-header">
        <span>解析进度</span>
        <span class="progress-text">{{ parseProgress.success }} 成功 / {{ parseProgress.errors }} 失败 / {{ parseProgress.total }} 总计</span>
      </div>
      <el-progress :percentage="parseProgress.total ? Math.round((parseProgress.success + parseProgress.errors) / parseProgress.total * 100) : 0" />
    </el-card>

    <!-- Preview Table -->
    <el-card v-if="parsedRecords.length" shadow="never" class="preview-card">
      <div class="preview-header">
        <h3>解析结果预览 ({{ parsedRecords.length }} 条)</h3>
        <div class="preview-actions">
          <el-button type="primary" :loading="saving" @click="handleSaveAll">
            <el-icon><Check /></el-icon>
            确认入库
          </el-button>
        </div>
      </div>

      <el-table :data="parsedRecords.slice(0, 50)" size="small" border max-height="400">
        <el-table-column prop="uuid" label="UUID" width="260" show-overflow-tooltip />
        <el-table-column prop="folio" label="Folio" width="100" />
        <el-table-column prop="fecha" label="开票日期" width="150">
          <template #default="{ row }">{{ formatDate(row.fecha) }}</template>
        </el-table-column>
        <el-table-column prop="total" label="含税总额" width="120" align="right">
          <template #default="{ row }">{{ formatMoney(row.total) }}</template>
        </el-table-column>
        <el-table-column prop="tax_amount" label="税额" width="120" align="right">
          <template #default="{ row }">{{ formatMoney(row.tax_amount) }}</template>
        </el-table-column>
        <el-table-column prop="emitter_name" label="开票人" width="160" show-overflow-tooltip />
        <el-table-column prop="receiver_name" label="收票人" width="160" show-overflow-tooltip />
        <el-table-column prop="ledger_type" label="类型" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.ledger_type === 'output' ? 'danger' : 'success'" size="small">
              {{ row.ledger_type === 'output' ? '销项' : '进项' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sap_vendor_code" label="SAP匹配" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.sap_vendor_code" type="success" size="small">已匹配</el-tag>
            <el-tag v-else type="warning" size="small">未匹配</el-tag>
          </template>
        </el-table-column>
      </el-table>

      <p v-if="parsedRecords.length > 50" class="more-hint">
        仅显示前 50 条，共 {{ parsedRecords.length }} 条，入库后将全部保存
      </p>
    </el-card>

    <!-- Error List -->
    <el-card v-if="parseErrors.length" shadow="never" class="error-card">
      <div class="error-header">
        <h3>解析失败 ({{ parseErrors.length }} 条)</h3>
      </div>
      <el-table :data="parseErrors" size="small" border max-height="200">
        <el-table-column prop="name" label="文件名" width="300" show-overflow-tooltip />
        <el-table-column prop="error" label="错误信息" show-overflow-tooltip />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { batchParseXML } from '../utils/cfdiParser'
import { insertInvoices, autoMatchSapVendors, checkExistingInvoices } from '../api/database'
import { createSatDownloadTask, getSatDownloadTask, decideSatDownloadTask } from '../api/satDownload'

const uploadRef = ref()
const fileList = ref([])
const parsedRecords = ref([])
const parseErrors = ref([])
const parsing = ref(false)
const saving = ref(false)
const satSubmitting = ref(false)
const satDeciding = ref(false)
const satPolling = ref(false)
const satTask = ref(null)
let satPollTimer = null

const satForm = reactive({
  dateRange: [],
  scope: 'all'
})

const satStatusMap = {
  queued: ['等待执行', 'info'],
  authenticating: ['SAT 认证中', 'warning'],
  requested: ['已提交申请', 'warning'],
  processing: ['SAT 处理中', 'warning'],
  downloading: ['下载数据包中', 'warning'],
  parsing: ['解析并入库中', 'warning'],
  completed: ['已完成', 'success'],
  cancelled: ['已结束', 'info'],
  waiting_user: ['等待用户决定', 'warning'],
  failed: ['配置或执行失败', 'danger']
}

const satStatusLabel = computed(() => satStatusMap[satTask.value?.status]?.[0] || '未知状态')
const satStatusType = computed(() => satStatusMap[satTask.value?.status]?.[1] || 'info')

const parseProgress = reactive({
  total: 0,
  success: 0,
  errors: 0
})

function handleFileChange(file, files) {
  fileList.value = files
}

function handleFileRemove(file, files) {
  fileList.value = files
}

function handleClearAll() {
  fileList.value = []
  parsedRecords.value = []
  parseErrors.value = []
  parseProgress.total = 0
  parseProgress.success = 0
  parseProgress.errors = 0
}

function satScopeLabel(scope) {
  return { issued: '我方开具', received: '我方收到', all: '全部' }[scope] || '-'
}

function stopSatPolling() {
  if (satPollTimer) clearInterval(satPollTimer)
  satPollTimer = null
  satPolling.value = false
}

async function refreshSatTask() {
  if (!satTask.value?.id) return
  try {
    satTask.value = await getSatDownloadTask(satTask.value.id)
    if (['completed', 'failed', 'cancelled'].includes(satTask.value.status)) {
      stopSatPolling()
      if (satTask.value.status === 'completed') ElMessage.success('SAT 下载任务已完成并入库')
    } else if (satTask.value.status === 'waiting_user') {
      stopSatPolling()
      ElMessage.warning('SAT 已等待 48 小时，请选择继续等待或结束本次任务')
    }
  } catch (error) {
    stopSatPolling()
    ElMessage.error('读取 SAT 任务状态失败: ' + (error.message || '未知错误'))
  }
}

function startSatPolling() {
  stopSatPolling()
  satPolling.value = true
  satPollTimer = setInterval(refreshSatTask, 5000)
}

async function handleSatDecision(decision) {
  if (!satTask.value?.id || satDeciding.value) return
  if (decision === 'cancel') {
    try {
      await ElMessageBox.confirm('结束后不会撤销 SAT 已提交的 solicitud，只会停止本系统继续查询；如需下载，需要之后重新创建申请。是否继续？', '确认结束任务', { type: 'warning', confirmButtonText: '结束本次任务', cancelButtonText: '返回' })
    } catch {
      return
    }
  }
  satDeciding.value = true
  try {
    satTask.value = await decideSatDownloadTask(satTask.value.id, decision)
    if (decision === 'continue') {
      ElMessage.success('已继续等待，系统将每小时查询一次')
      startSatPolling()
    } else {
      stopSatPolling()
      ElMessage.info('本次 SAT 任务已结束，可以重新创建下载申请')
    }
  } catch (error) {
    ElMessage.error('提交任务决定失败: ' + (error.message || '未知错误'))
  } finally {
    satDeciding.value = false
  }
}

async function handleCreateSatTask() {
  if (!satForm.dateRange || satForm.dateRange.length !== 2) {
    ElMessage.warning('请先选择 SAT 下载期间')
    return
  }

  satSubmitting.value = true
  try {
    satTask.value = await createSatDownloadTask({
      startDate: satForm.dateRange[0],
      endDate: satForm.dateRange[1],
      scope: satForm.scope
    })
    ElMessage.success('SAT 下载任务已提交，系统将后台处理')
    if (satTask.value.status === 'failed') {
      ElMessage.error(satTask.value.error_message || 'SAT 服务尚未完成配置')
    } else {
      startSatPolling()
    }
  } catch (error) {
    ElMessage.error('提交 SAT 下载任务失败: ' + (error.message || '未知错误'))
  } finally {
    satSubmitting.value = false
  }
}

onBeforeUnmount(stopSatPolling)

async function handleParseAll() {
  if (!fileList.value.length) {
    ElMessage.warning('请先选择 XML 文件')
    return
  }

  parsing.value = true
  parsedRecords.value = []
  parseErrors.value = []
  parseProgress.total = fileList.value.length
  parseProgress.success = 0
  parseProgress.errors = 0

  // Read all files as text
  const fileContents = []
  for (const file of fileList.value) {
    try {
      const content = await readFileAsText(file.raw)
      fileContents.push({ name: file.name, content })
    } catch (err) {
      parseErrors.value.push({ name: file.name, error: '读取文件失败: ' + err.message })
      parseProgress.errors++
    }
  }

  // Parse in batches of 500 to avoid blocking UI
  const batchSize = 500
  for (let i = 0; i < fileContents.length; i += batchSize) {
    const batch = fileContents.slice(i, i + batchSize)
    const { success, errors } = batchParseXML(batch)

    parsedRecords.value.push(...success)
    parseErrors.value.push(...errors)
    parseProgress.success += success.length
    parseProgress.errors += errors.length

    // Allow UI to update
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  // Auto-match SAP vendors
  if (parsedRecords.value.length) {
    const { matched } = await autoMatchSapVendors(parsedRecords.value)
    if (matched > 0) {
      ElMessage.info(`SAP客商自动匹配: ${matched}/${parsedRecords.value.length}`)
    }
  }

  parsing.value = false
  ElMessage.success(`解析完成: ${parseProgress.success} 成功, ${parseProgress.errors} 失败`)
}

async function handleSaveAll() {
  if (!parsedRecords.value.length) return

  saving.value = true
  try {
    // ── Step 1: Check for duplicate UUIDs ──
    const allUuids = parsedRecords.value.map(r => r.uuid)
    const existing = await checkExistingInvoices(allUuids)

    // recordsToInsert: 最终要入库的记录列表
    let recordsToInsert = parsedRecords.value
    let dupInfo = ''  // 用于最终提示信息

    if (existing.length > 0) {
      // Build duplicate list for display
      const existingUuidSet = new Set(existing.map(r => r.uuid.toUpperCase()))
      const dupList = existing.map(r => {
        const folio = r.folio || '-'
        const fecha = r.fecha ? String(r.fecha).substring(0, 10) : '-'
        const name = r.emitter_name || '-'
        const total = r.total != null ? Number(r.total).toFixed(2) : '-'
        return `${r.uuid} | Folio: ${folio} | ${fecha} | ${name} | $${total}`
      })

      const dupMsg =
        `检测到 ${existing.length} 条已入库的重复发票（共 ${allUuids.length} 条待入库）：\n\n` +
        dupList.slice(0, 20).join('\n') +
        (dupList.length > 20 ? `\n\n... 及其他 ${dupList.length - 20} 条` : '') +
        `\n\n请选择操作：`

      // Use ElMessageBox with 3 buttons via distinguishCancelAndClose
      let action = 'cancel' // default
      try {
        await ElMessageBox({
          title: '重复发票检测',
          message: dupMsg,
          type: 'warning',
          showCancelButton: true,
          showClose: true,
          distinguishCancelAndClose: true,
          confirmButtonText: '覆盖入库',
          cancelButtonText: '排除重复后入库',
          customClass: 'dup-confirm-box',
          messageAlign: 'left',
          beforeClose: (actionType, instance, done) => {
            action = actionType // 'confirm' | 'cancel' | 'close'
            done()
          }
        })
      } catch (caughtAction) {
        // ElMessageBox rejects with the action string when distinguishCancelAndClose is true
        action = caughtAction
      }

      if (action === 'confirm') {
        // 覆盖入库：保留全部记录，upsert 会自动覆盖
        recordsToInsert = parsedRecords.value
        dupInfo = `（其中 ${existing.length} 条为覆盖）`
      } else if (action === 'cancel') {
        // 排除重复后入库：过滤掉已存在的 UUID
        recordsToInsert = parsedRecords.value.filter(
          r => !existingUuidSet.has(r.uuid.toUpperCase())
        )
        if (recordsToInsert.length === 0) {
          ElMessage.info('所有待入库发票均已存在，无需入库')
          saving.value = false
          return
        }
        dupInfo = `（已排除 ${existing.length} 条重复，实际入库 ${recordsToInsert.length} 条）`
      } else {
        // close (X button) → 取消
        ElMessage.info('已取消入库')
        saving.value = false
        return
      }
    }

    // ── Step 2: Insert in batches of 50 ──
    const batchSize = 50
    let totalInserted = 0
    for (let i = 0; i < recordsToInsert.length; i += batchSize) {
      const batch = recordsToInsert.slice(i, i + batchSize)
      await insertInvoices(batch)
      totalInserted += batch.length
    }

    ElMessage.success(`成功入库 ${totalInserted} 条发票记录${dupInfo}`)
    handleClearAll()
  } catch (err) {
    ElMessage.error('入库失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = (e) => reject(new Error('File read error'))
    reader.readAsText(file, 'UTF-8')
  })
}

function formatDate(fecha) {
  if (!fecha) return '-'
  return fecha.replace('T', ' ').substring(0, 19)
}

function formatMoney(val) {
  if (val == null || isNaN(val)) return '0.00'
  return Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
</script>

<style scoped>
.upload-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.upload-card, .sat-card, .progress-card, .preview-card, .error-card {
  border-radius: 8px;
}

.sat-card {
  border-left: 3px solid #409eff;
}

.sat-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.sat-header h2 {
  font-size: 17px;
  margin: 0 0 8px;
}

.sat-header p, .sat-note {
  font-size: 13px;
  color: #909399;
}

.sat-form {
  max-width: 720px;
}

.sat-note {
  margin-left: 12px;
}

.sat-task-panel {
  margin-top: 8px;
  padding: 14px;
  background: #f8fbff;
  border: 1px solid #d9ecff;
  border-radius: 6px;
}

.sat-task-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
  color: #303133;
}

.sat-task-details {
  margin: 12px 0;
}

.upload-header {
  margin-bottom: 20px;
}

.upload-header h2 {
  font-size: 18px;
  margin-bottom: 8px;
}

.upload-header p {
  font-size: 13px;
  color: #909399;
}

.file-actions {
  margin-top: 16px;
  display: flex;
  gap: 12px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 13px;
}

.progress-text {
  color: #606266;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.preview-header h3 {
  font-size: 15px;
  margin: 0;
}

.more-hint {
  text-align: center;
  font-size: 12px;
  color: #909399;
  margin-top: 12px;
}

.error-card {
  border-left: 3px solid #f56c6c;
}

.error-header h3 {
  font-size: 15px;
  color: #f56c6c;
  margin: 0 0 12px;
}
</style>

<style>
/* Global style for duplicate confirmation dialog (scoped styles don't apply to ElMessageBox) */
.dup-confirm-box {
  max-width: 700px;
}
.dup-confirm-box .el-message-box__message {
  white-space: pre-wrap;
  font-family: 'Courier New', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  max-height: 400px;
  overflow-y: auto;
}
/* Three-button layout: ensure buttons don't wrap or overlap */
.dup-confirm-box .el-message-box__btns {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: nowrap;
}
.dup-confirm-box .el-message-box__btns .el-button {
  margin-left: 0 !important;
}
</style>
