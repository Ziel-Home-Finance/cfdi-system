<template>
  <div class="pedimento-page">
    <el-card shadow="never">
      <div class="page-header">
        <div>
          <h2>墨西哥关单 PDF 入库</h2>
          <p>上传 Pedimento PDF，提取进口增值税及关税数据后入库</p>
        </div>
      </div>
      <el-alert title="提示：不同报关行的 PDF 版式可能不同，解析后请先核对关单号、进口商 RFC 和 IVA 金额。扫描版 PDF 需要 OCR，当前版本先支持可复制文字的 PDF。" type="info" show-icon :closable="false" />
      <el-upload
        ref="uploadRef"
        drag
        multiple
        accept=".pdf,application/pdf"
        :auto-upload="false"
        :file-list="fileList"
        :on-change="handleFileChange"
        :on-remove="handleFileRemove"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">拖拽关单 PDF 到此处，或<em>点击选择</em></div>
        <template #tip><div class="el-upload__tip">支持同时选择多个 PDF 文件</div></template>
      </el-upload>
      <div class="actions">
        <el-button type="primary" :loading="parsing" :disabled="!fileList.length" @click="handleParse">解析 PDF</el-button>
        <el-button @click="clearAll">清空</el-button>
      </div>
      <el-progress v-if="parsing" :percentage="progress" :status="progress === 100 ? 'success' : undefined" />
    </el-card>

    <el-card v-if="records.length" shadow="never">
      <div class="result-header">
        <h3>解析结果（{{ records.length }} 条）</h3>
        <div class="result-actions">
          <el-popover placement="bottom" :width="220" trigger="click">
            <template #reference><el-button size="small">列设置</el-button></template>
            <el-checkbox-group v-model="visibleCols" size="small">
              <el-checkbox v-for="k in allColKeys" :key="k" :label="k" :disabled="getColDisabled(k)">{{ colLabels[k] }}</el-checkbox>
            </el-checkbox-group>
            <div style="margin-top:8px"><el-button size="small" type="primary" text @click="resetCols">恢复默认</el-button></div>
          </el-popover>
          <el-button type="primary" :loading="saving" @click="saveAll">确认入库</el-button>
        </div>
      </div>
      <el-table :data="records" border stripe size="small" max-height="520">
        <el-table-column prop="pedimento_number" label="关单号" min-width="170" />
        <el-table-column prop="period" label="归属期" width="95" align="center" />
        <el-table-column prop="id_fiscal" label="供应商 ID" width="120" />
        <el-table-column prop="supplier_name" label="供应商" min-width="170" show-overflow-tooltip />
        <el-table-column prop="pais" label="来源国" width="75" align="center" />
        <el-table-column prop="custom_agency" label="报关行" min-width="150" show-overflow-tooltip />
        <el-table-column prop="internal_ref" label="内部索引" width="115" />
        <el-table-column prop="importer_rfc" label="进口商 RFC" width="140" />
        <el-table-column prop="entry_date" label="入境日期" width="120" />
        <el-table-column prop="fecha_de_pago" label="付款日期" width="120" />
        <el-table-column prop="customs_value" label="完税总额" width="120" align="right">
          <template #default="{ row }">{{ formatMoney(row.customs_value) }}</template>
        </el-table-column>
        <el-table-column v-if="visibleCols.includes('iva_amount')" prop="iva_amount" label="税额" width="120" align="right">
          <template #default="{ row }"><strong>{{ formatMoney(row.iva_amount) }}</strong></template>
        </el-table-column>
        <el-table-column v-if="visibleCols.includes('dta')" prop="dta" label="DTA" width="110" align="right">
          <template #default="{ row }">{{ formatMoney(row.dta) }}</template>
        </el-table-column>
        <el-table-column v-if="visibleCols.includes('iva_prv')" prop="iva_prv" label="IVA/PRV" width="110" align="right">
          <template #default="{ row }">{{ formatMoney(row.iva_prv) }}</template>
        </el-table-column>
        <el-table-column v-if="visibleCols.includes('igi')" prop="igi" label="IGI" width="120" align="right">
          <template #default="{ row }">{{ formatMoney(row.igi) }}</template>
        </el-table-column>
        <el-table-column v-if="visibleCols.includes('prv')" prop="prv" label="PRV" width="110" align="right">
          <template #default="{ row }">{{ formatMoney(row.prv) }}</template>
        </el-table-column>
        <el-table-column prop="parse_status" label="状态" width="85" align="center">
          <template #default="{ row }"><el-tag :type="row.parse_status === 'parsed' ? 'success' : 'warning'" size="small">{{ row.parse_status === 'parsed' ? '已识别' : '需核对' }}</el-tag></template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card v-if="errors.length" shadow="never" class="error-card">
      <h3>解析失败（{{ errors.length }} 条）</h3>
      <el-table :data="errors" size="small"><el-table-column prop="name" label="文件名" /><el-table-column prop="error" label="错误" /></el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { parsePedimentoPDF, formatPedimentoMoney } from '../utils/pedimentoParser'
import { checkExistingPedimentos, insertPedimentos } from '../api/database'

const fileList = ref([])
const records = ref([])
const errors = ref([])
const parsing = ref(false)
const saving = ref(false)
const progress = ref(0)

// ── Column visibility config ──
const allColKeys = ['iva_amount', 'dta', 'iva_prv', 'igi', 'prv']
const colLabels = { iva_amount: '税额', dta: 'DTA', iva_prv: 'IVA/PRV', igi: 'IGI', prv: 'PRV' }
const defaultVisibleCols = ['iva_amount']
const visibleCols = ref([...defaultVisibleCols])

function getColDisabled(key) {
  return false
}
function resetCols() {
  visibleCols.value = [...defaultVisibleCols]
}

function handleFileChange(file, files) { fileList.value = files }
function handleFileRemove(file, files) { fileList.value = files }
function formatMoney(value) { return formatPedimentoMoney(value) }
function clearAll() { fileList.value = []; records.value = []; errors.value = []; progress.value = 0 }

async function handleParse() {
  parsing.value = true; records.value = []; errors.value = []; progress.value = 0
  for (let i = 0; i < fileList.value.length; i++) {
    const file = fileList.value[i]
    try {
      const record = await parsePedimentoPDF(file.raw, () => {})
      records.value.push(record)
    } catch (error) {
      errors.value.push({ name: file.name, error: error.message || String(error) })
    }
    progress.value = Math.round(((i + 1) / fileList.value.length) * 100)
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  parsing.value = false
  ElMessage.success(`解析完成：${records.value.length} 条成功，${errors.value.length} 条失败`)
}

async function saveAll() {
  if (!records.value.length) return
  saving.value = true
  try {
    const existing = await checkExistingPedimentos(records.value.map(r => r.pedimento_number))
    let toSave = records.value
    if (existing.length) {
      const action = await ElMessageBox.confirm(
        `检测到 ${existing.length} 条关单号已存在。\n\n覆盖入库：更新已有记录\n排除重复后入库：只保存新关单\n取消：不执行入库`,
        '关单重复检测',
        { confirmButtonText: '覆盖入库', cancelButtonText: '排除重复后入库', distinguishCancelAndClose: true, type: 'warning' }
      ).then(() => 'overwrite').catch(action => action === 'cancel' ? 'skip' : 'cancel')
      if (action === 'cancel') { ElMessage.info('已取消入库'); return }
      if (action === 'skip') {
        const set = new Set(existing.map(r => r.pedimento_number))
        toSave = records.value.filter(r => !set.has(r.pedimento_number))
      }
    }
    if (!toSave.length) { ElMessage.info('所有关单均已存在，无需入库'); return }
    await insertPedimentos(toSave)
    ElMessage.success(`成功入库 ${toSave.length} 条关单记录`)
    clearAll()
  } catch (error) {
    ElMessage.error('关单入库失败：' + (error.message || error))
  } finally { saving.value = false }
}
</script>

<style scoped>
.pedimento-page { display: flex; flex-direction: column; gap: 12px; }
.result-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.result-actions { display: flex; gap: 8px; align-items: center; }
h2, h3 { margin: 0; }
.page-header p { color: #909399; font-size: 13px; margin: 8px 0 0; }
.actions { display: flex; gap: 12px; margin-top: 16px; }
.error-card { border-left: 3px solid #f56c6c; }
</style>
