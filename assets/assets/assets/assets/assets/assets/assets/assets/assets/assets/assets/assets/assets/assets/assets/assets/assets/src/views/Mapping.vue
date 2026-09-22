<template>
  <div class="mapping-page">
    <el-card shadow="never" class="mapping-card">
      <div class="mapping-header">
        <div>
          <h2>SAP 客商映射表</h2>
          <p>维护 RFC 税号与 SAP 客商编码/名称的对应关系，台账自动匹配</p>
        </div>
        <el-button type="primary" @click="handleAdd">
          <el-icon><Plus /></el-icon>
          新增映射
        </el-button>
      </div>

      <el-table :data="tableData" v-loading="loading" size="small" border>
        <el-table-column prop="rfc" label="RFC 税号" width="160" />
        <el-table-column prop="sap_code" label="SAP 客商编码" width="160" />
        <el-table-column prop="sap_name" label="SAP 客商名称" width="250" show-overflow-tooltip />
        <el-table-column prop="partner_type" label="客商类型" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="row.partner_type === 'customer' ? 'danger' : 'success'" size="small">
              {{ row.partner_type === 'customer' ? '客户' : '供应商' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="keywords" label="关键词" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.keywords ? row.keywords.join(', ') : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" @click="handleEdit(row)">编辑</el-button>
            <el-button text size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Edit Dialog -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑映射' : '新增映射'" width="500px">
      <el-form :model="form" label-width="120px" size="small">
        <el-form-item label="RFC 税号">
          <el-input v-model="form.rfc" placeholder="如: ABCD123456XYZ" :disabled="isEdit" />
        </el-form-item>
        <el-form-item label="SAP 客商编码">
          <el-input v-model="form.sap_code" placeholder="如: 100001" />
        </el-form-item>
        <el-form-item label="SAP 客商名称">
          <el-input v-model="form.sap_name" placeholder="如: Ziel Home Mexico S.A. de C.V." />
        </el-form-item>
        <el-form-item label="客商类型">
          <el-select v-model="form.partner_type" style="width: 100%">
            <el-option label="客户" value="customer" />
            <el-option label="供应商" value="vendor" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="keywordsInput" placeholder="多个关键词用逗号分隔" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getSapMappings, addSapMapping, updateSapMapping, deleteSapMapping } from '../api/database'

const loading = ref(false)
const tableData = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const keywordsInput = ref('')

const form = reactive({
  id: null,
  rfc: '',
  sap_code: '',
  sap_name: '',
  partner_type: 'vendor',
  keywords: []
})

async function loadData() {
  loading.value = true
  try {
    tableData.value = await getSapMappings()
  } catch (err) {
    ElMessage.error('加载失败: ' + err.message)
  } finally {
    loading.value = false
  }
}

function handleAdd() {
  isEdit.value = false
  Object.assign(form, { id: null, rfc: '', sap_code: '', sap_name: '', partner_type: 'vendor', keywords: [] })
  keywordsInput.value = ''
  dialogVisible.value = true
}

function handleEdit(row) {
  isEdit.value = true
  Object.assign(form, row)
  keywordsInput.value = row.keywords ? row.keywords.join(', ') : ''
  dialogVisible.value = true
}

async function handleSave() {
  if (!form.rfc || !form.sap_code || !form.sap_name) {
    ElMessage.warning('请填写必填字段')
    return
  }

  form.keywords = keywordsInput.value
    ? keywordsInput.value.split(',').map(k => k.trim()).filter(Boolean)
    : []

  if (isEdit.value) {
    await updateSapMapping(form.id, { ...form })
    ElMessage.success('更新成功')
  } else {
    await addSapMapping({ ...form })
    ElMessage.success('新增成功')
  }
  dialogVisible.value = false
  loadData()
}

async function handleDelete(row) {
  await ElMessageBox.confirm(`确认删除映射: ${row.rfc} → ${row.sap_code}？`, '删除确认', { type: 'warning' })
  await deleteSapMapping(row.id)
  ElMessage.success('删除成功')
  loadData()
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.mapping-card {
  border-radius: 8px;
}

.mapping-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.mapping-header h2 {
  font-size: 18px;
  margin-bottom: 8px;
}

.mapping-header p {
  font-size: 13px;
  color: #909399;
}
</style>
