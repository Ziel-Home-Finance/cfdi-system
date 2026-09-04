import { LOCAL_SAT_BACKEND_URL, SUPABASE_CONFIG, isSupabaseConfigured } from './db.config'

const LOCAL_SAT_BACKEND_KEY = import.meta.env.VITE_LOCAL_SAT_BACKEND_KEY || ''

let supabase = null

async function getSupabase() {
  if (supabase) return supabase
  const { createClient } = await import('@supabase/supabase-js')
  supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey)
  return supabase
}

async function callLocalSatBackend(body) {
  const response = await fetch(`${LOCAL_SAT_BACKEND_URL}/api/sat-download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(LOCAL_SAT_BACKEND_KEY ? { 'X-SAT-Backend-Key': LOCAL_SAT_BACKEND_KEY } : {})
    },
    body: JSON.stringify(body)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.message || `本机 SAT 后端请求失败 (${response.status})`)
  return data
}

export async function createSatDownloadTask({ startDate, endDate, scope }) {
  const body = { action: 'create', startDate, endDate, scope }
  const data = import.meta.env.VITE_SAT_BACKEND === 'local'
    ? await callLocalSatBackend(body)
    : await (async () => {
        if (!isSupabaseConfigured()) throw new Error('未配置 Supabase，无法提交 SAT 下载任务')
        const sb = await getSupabase()
        const result = await sb.functions.invoke('sat-download', { body })
        if (result.error) throw result.error
        return result.data
      })()
  if (!data?.task) throw new Error(data?.message || 'SAT 下载任务创建失败')
  return data.task
}

export async function getSatDownloadTask(taskId) {
  const body = { action: 'status', taskId }
  const data = import.meta.env.VITE_SAT_BACKEND === 'local'
    ? await callLocalSatBackend(body)
    : await (async () => {
        if (!isSupabaseConfigured()) throw new Error('未配置 Supabase，无法读取 SAT 任务状态')
        const sb = await getSupabase()
        const result = await sb.functions.invoke('sat-download', { body })
        if (result.error) throw result.error
        return result.data
      })()
  if (!data?.task) throw new Error(data?.message || '未找到 SAT 下载任务')
  return data.task
}

export async function decideSatDownloadTask(taskId, decision) {
  const body = { action: 'decision', taskId, decision }
  const data = import.meta.env.VITE_SAT_BACKEND === 'local'
    ? await callLocalSatBackend(body)
    : await (async () => {
        if (!isSupabaseConfigured()) throw new Error('未配置 Supabase，无法提交 SAT 任务决定')
        const sb = await getSupabase()
        const result = await sb.functions.invoke('sat-download', { body })
        if (result.error) throw result.error
        return result.data
      })()
  if (!data?.task) throw new Error(data?.message || 'SAT 任务决定提交失败')
  return data.task
}
