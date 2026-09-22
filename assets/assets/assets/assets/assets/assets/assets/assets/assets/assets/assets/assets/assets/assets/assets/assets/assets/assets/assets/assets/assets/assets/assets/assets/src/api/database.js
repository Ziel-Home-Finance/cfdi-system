/**
 * Data Access Layer — Multi-backend Architecture
 *
 * Backends (controlled by db.config.js):
 *   - 'supabase'  : PostgreSQL via Supabase (cloud, multi-user shared data)
 *   - 'indexeddb' : IndexedDB via Dexie (local browser, single-user fallback)
 *   - 'local'     : Local Node.js API (future, self-hosted)
 *
 * All views/components call these functions only.
 * Switching backends requires changing only db.config.js + .env
 */

import { BACKEND, SUPABASE_CONFIG, isSupabaseConfigured } from './db.config'

// ─── Backend Initialization ───

let supabase = null
let db = null

// Lazy-load Supabase client
async function getSupabase() {
  if (supabase) return supabase
  const { createClient } = await import('@supabase/supabase-js')
  supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
    headers: {
      'x-user-role': localStorage.getItem('cfdi_role') || 'viewer'
    }
  })
  return supabase
}

// Lazy-load Dexie (IndexedDB fallback)
async function getDexie() {
  if (db) return db
  const Dexie = (await import('dexie')).default
  db = new Dexie('CFDIDatabase')
  db.version(1).stores({
    invoices: 'uuid, folio, fecha, billing_period, emitter_rfc, receiver_rfc, invoice_type, ledger_type, declare_status, declare_period, sap_vendor_code',
    sap_mapping: '++id, rfc, sap_code, sap_name, partner_type, *keywords',
    views: '++id, name, config, is_default, created_by',
    audit_log: '++id, action, table_name, record_id, old_value, new_value, user_name, timestamp',
    users: '++id, username, password_hash, role, display_name',
    pedimentos: 'pedimento_number, importer_rfc, entry_date, customs_office, parse_status'
  })
  await db.open()
  return db
}

// Determine effective backend
function getEffectiveBackend() {
  if (BACKEND === 'supabase' && isSupabaseConfigured()) return 'supabase'
  if (BACKEND === 'supabase' && !isSupabaseConfigured()) {
    console.warn('[DB] Supabase not configured, falling back to IndexedDB')
    return 'indexeddb'
  }
  return BACKEND
}

// ─── In-memory cache (used by both backends) ───

let _invoiceCache = null
let _invoiceCacheDirty = true

function invalidateInvoiceCache() {
  _invoiceCacheDirty = true
}

// ─── Pedimento CRUD ───

export async function checkExistingPedimentos(numbers) {
  if (!numbers || !numbers.length) return []
  const normalized = numbers.map(value => String(value || '').trim()).filter(Boolean)
  const backend = getEffectiveBackend()

  if (backend === 'supabase') {
    const sb = await getSupabase()
    const { data, error } = await sb.from('pedimentos')
      .select('pedimento_number, importer_rfc, entry_date, iva_amount, customs_value, file_name')
      .in('pedimento_number', normalized)
    if (error) throw error
    return data || []
  }

  const localDb = await getDexie()
  const rows = []
  for (const number of normalized) {
    const row = await localDb.pedimentos.get(number)
    if (row) rows.push(row)
  }
  return rows
}

export async function insertPedimentos(records) {
  if (!records || !records.length) return { inserted: 0 }
  const normalized = records.map(record => ({
    ...record,
    pedimento_number: String(record.pedimento_number || '').trim(),
    created_by: localStorage.getItem('cfdi_username') || 'unknown'
  }))
  const backend = getEffectiveBackend()

  if (backend === 'supabase') {
    const sb = await getSupabase()
    const { error } = await sb.from('pedimentos').upsert(normalized, { onConflict: 'pedimento_number' })
    if (error) throw error
    return { inserted: normalized.length }
  }

  const localDb = await getDexie()
  await localDb.pedimentos.bulkPut(normalized)
  return { inserted: normalized.length }
}

export async function getPedimentos(params = {}) {
  const backend = getEffectiveBackend()
  if (backend === 'supabase') {
    const sb = await getSupabase()
    let query = sb.from('pedimentos').select('*').order('entry_date', { ascending: false })
    if (params.importerRfc) query = query.eq('importer_rfc', params.importerRfc.toUpperCase())
    const { data, error } = await query
    if (error) throw error
    return data || []
  }
  const localDb = await getDexie()
  return localDb.pedimentos.orderBy('entry_date').reverse().toArray()
}

// ─── Invoice CRUD ───

export async function getInvoices(params = {}) {
  const {
    page = 1,
    pageSize = 50,
    ledgerType = null,
    dateRange = null,
    billingPeriods = null,
    declareStatus = null,
    emitterRfc = null,
    receiverRfc = null,
    keyword = null,
    sortBy = 'fecha',
    sortOrder = 'desc'
  } = params

  const backend = getEffectiveBackend()

  if (backend === 'supabase') {
    return getInvoicesSupabase(params)
  }
  return getInvoicesIndexedDB(params)
}

// ─── Supabase implementation ───

async function getInvoicesSupabase(params) {
  const {
    page = 1, pageSize = 50,
    ledgerType = null, dateRange = null, billingPeriods = null,
    declareStatus = null, emitterRfc = null, receiverRfc = null,
    keyword = null, sortBy = 'fecha', sortOrder = 'desc'
  } = params

  const sb = await getSupabase()
  let query = sb.from('invoices').select('*')

  // Apply filters at database level (more efficient than client-side)
  if (ledgerType) query = query.eq('ledger_type', ledgerType)
  if (declareStatus) query = query.eq('declare_status', declareStatus)
  if (emitterRfc) query = query.eq('emitter_rfc', emitterRfc.toUpperCase())
  if (receiverRfc) query = query.eq('receiver_rfc', receiverRfc.toUpperCase())
  if (dateRange && Array.isArray(dateRange) && dateRange.length === 2) {
    query = query.gte('fecha', dateRange[0]).lte('fecha', dateRange[1] + 'T23:59:59')
  }
  if (billingPeriods && Array.isArray(billingPeriods) && billingPeriods.length > 0) {
    query = query.in('billing_period', billingPeriods)
  }

  // Keyword search — use ilike on multiple fields (Supabase filter)
  if (keyword) {
    const kw = keyword.toLowerCase()
    query = query.or(`uuid.ilike.%${kw}%,folio.ilike.%${kw}%,emitter_name.ilike.%${kw}%,receiver_name.ilike.%${kw}%,description.ilike.%${kw}%,related_uuid.ilike.%${kw}%,invoice_status.ilike.%${kw}%`)
  }

  // Sorting
  const sortCol = sortBy || 'fecha'
  query = query.order(sortCol, { ascending: sortOrder === 'asc' })

  // Pagination
  const offset = (page - 1) * pageSize
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query

  if (error) throw error

  // Get total count (separate query if needed)
  let total = count
  if (total == null) {
    // Fallback: do a count query
    let countQuery = sb.from('invoices').select('uuid', { count: 'exact', head: true })
    if (ledgerType) countQuery = countQuery.eq('ledger_type', ledgerType)
    if (declareStatus) countQuery = countQuery.eq('declare_status', declareStatus)
    if (emitterRfc) countQuery = countQuery.eq('emitter_rfc', emitterRfc.toUpperCase())
    if (receiverRfc) countQuery = countQuery.eq('receiver_rfc', receiverRfc.toUpperCase())
    if (dateRange && Array.isArray(dateRange) && dateRange.length === 2) {
      countQuery = countQuery.gte('fecha', dateRange[0]).lte('fecha', dateRange[1] + 'T23:59:59')
    }
    if (billingPeriods && Array.isArray(billingPeriods) && billingPeriods.length > 0) {
      countQuery = countQuery.in('billing_period', billingPeriods)
    }
    if (keyword) {
      const kw = keyword.toLowerCase()
      countQuery = countQuery.or(`uuid.ilike.%${kw}%,folio.ilike.%${kw}%,emitter_name.ilike.%${kw}%,receiver_name.ilike.%${kw}%,description.ilike.%${kw}%,related_uuid.ilike.%${kw}%,invoice_status.ilike.%${kw}%`)
    }
    const { count: c } = await countQuery
    total = c || 0
  }

  return {
    data: data || [],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  }
}

// ─── IndexedDB implementation (fallback) ───

async function getInvoicesIndexedDB(params) {
  const {
    page = 1, pageSize = 50,
    ledgerType = null, dateRange = null, billingPeriods = null,
    declareStatus = null, emitterRfc = null, receiverRfc = null,
    keyword = null, sortBy = 'fecha', sortOrder = 'desc'
  } = params

  const db = await getDexie()

  let items
  if (_invoiceCache && !_invoiceCacheDirty) {
    items = _invoiceCache
  } else {
    items = await db.invoices.toArray()
    _invoiceCache = items
    _invoiceCacheDirty = false
  }

  if (ledgerType) items = items.filter(r => r.ledger_type === ledgerType)
  if (dateRange && Array.isArray(dateRange) && dateRange.length === 2) {
    const startDate = dateRange[0]
    const endDate = dateRange[1]
    items = items.filter(r => {
      const dateStr = String(r.fecha || r.billing_period || '').substring(0, 10)
      return dateStr >= startDate && dateStr <= endDate
    })
  }
  if (billingPeriods && Array.isArray(billingPeriods) && billingPeriods.length > 0) {
    items = items.filter(r => billingPeriods.includes(r.billing_period))
  }
  if (declareStatus) items = items.filter(r => r.declare_status === declareStatus)
  if (emitterRfc) items = items.filter(r => r.emitter_rfc === emitterRfc)
  if (receiverRfc) items = items.filter(r => r.receiver_rfc === receiverRfc)
  if (keyword) {
    const kw = keyword.toLowerCase()
    items = items.filter(r => {
      const uuid = String(r.uuid || '')
      const folio = String(r.folio || '')
      const emitterName = String(r.emitter_name || '')
      const receiverName = String(r.receiver_name || '')
      const description = String(r.description || '')
      const relatedUuid = String(r.related_uuid || '')
      const invoiceStatus = String(r.invoice_status || '')
      return uuid.toLowerCase().includes(kw) ||
             folio.toLowerCase().includes(kw) ||
             emitterName.toLowerCase().includes(kw) ||
             receiverName.toLowerCase().includes(kw) ||
             description.toLowerCase().includes(kw) ||
             relatedUuid.toLowerCase().includes(kw) ||
             invoiceStatus.toLowerCase().includes(kw)
    })
  }

  items.sort((a, b) => {
    let valA = a[sortBy]
    let valB = b[sortBy]
    if (typeof valA === 'string') valA = valA || ''
    if (typeof valB === 'string') valB = valB || ''
    if (valA < valB) return sortOrder === 'asc' ? -1 : 1
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1
    return 0
  })

  const total = items.length
  const start = (page - 1) * pageSize
  const pagedItems = items.slice(start, start + pageSize)

  return { data: pagedItems, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

export async function getInvoiceByUuid(uuid) {
  const backend = getEffectiveBackend()
  if (backend === 'supabase') {
    const sb = await getSupabase()
    const { data, error } = await sb.from('invoices').select('*').eq('uuid', uuid.toUpperCase()).single()
    if (error) throw error
    return data
  }
  const db = await getDexie()
  return await db.invoices.get(uuid.toUpperCase())
}

// ─── Duplicate Detection ───

/**
 * Check which UUIDs from the given list already exist in the database.
 * Returns array of existing records with display info (uuid, folio, fecha, emitter_name, total).
 * Used by Upload.vue to prompt user before overwriting.
 */
export async function checkExistingInvoices(uuids) {
  if (!uuids || !uuids.length) return []

  const backend = getEffectiveBackend()
  const normalizedUuids = uuids.map(u => u.toUpperCase())

  if (backend === 'supabase') {
    const sb = await getSupabase()
    // Batch the .in() query to avoid URL length limits (each UUID ~36 chars)
    const batchSize = 100
    const results = []
    for (let i = 0; i < normalizedUuids.length; i += batchSize) {
      const batch = normalizedUuids.slice(i, i + batchSize)
      const { data, error } = await sb.from('invoices')
        .select('uuid, folio, fecha, emitter_name, total')
        .in('uuid', batch)
      if (error) throw error
      if (data) results.push(...data)
    }
    return results
  }

  // IndexedDB
  const db = await getDexie()
  const existing = []
  for (const uuid of normalizedUuids) {
    const record = await db.invoices.get(uuid)
    if (record) {
      existing.push({
        uuid: record.uuid,
        folio: record.folio,
        fecha: record.fecha,
        emitter_name: record.emitter_name,
        total: record.total
      })
    }
  }
  return existing
}

export async function insertInvoices(records) {
  const backend = getEffectiveBackend()
  const normalized = records.map(r => {
    const { raw_xml, ...rest } = r  // Exclude raw_xml to reduce payload size
    return {
      ...rest,
      uuid: r.uuid.toUpperCase(),
      created_by: localStorage.getItem('cfdi_username') || 'unknown'
    }
  })

  if (backend === 'supabase') {
    const sb = await getSupabase()
    // Insert in batches of 50 to avoid large request payloads
    const batchSize = 50
    for (let i = 0; i < normalized.length; i += batchSize) {
      const batch = normalized.slice(i, i + batchSize)
      const { error } = await sb.from('invoices').upsert(batch, { onConflict: 'uuid' })
      if (error) throw error
    }
    return { inserted: normalized.length }
  }

  const db = await getDexie()
  await db.invoices.bulkPut(normalized)
  invalidateInvoiceCache()
  return { inserted: normalized.length }
}

export async function updateInvoice(uuid, updates) {
  const backend = getEffectiveBackend()

  if (backend === 'supabase') {
    const sb = await getSupabase()
    const { data, error } = await sb.from('invoices')
      .update(updates)
      .eq('uuid', uuid.toUpperCase())
      .select()
    if (error) throw error
    return data[0] || null
  }

  const db = await getDexie()
  const existing = await db.invoices.get(uuid.toUpperCase())
  if (!existing) throw new Error('Invoice not found: ' + uuid)
  await db.invoices.update(uuid.toUpperCase(), updates)
  invalidateInvoiceCache()
  return { ...existing, ...updates }
}

export async function deleteInvoice(uuid) {
  const backend = getEffectiveBackend()

  if (backend === 'supabase') {
    const sb = await getSupabase()
    const { error } = await sb.from('invoices').delete().eq('uuid', uuid.toUpperCase())
    if (error) throw error
    return
  }

  const db = await getDexie()
  await db.invoices.delete(uuid.toUpperCase())
  invalidateInvoiceCache()
}

export async function batchUpdateDeclareStatus(updates) {
  const backend = getEffectiveBackend()

  if (backend === 'supabase') {
    const sb = await getSupabase()
    let count = 0
    for (const item of updates) {
      const { error } = await sb.from('invoices')
        .update({
          declare_status: item.declare_status,
          declared_tax_amount: item.declared_tax_amount,
          pending_tax_amount: item.pending_tax_amount
        })
        .eq('uuid', item.uuid.toUpperCase())
      if (!error) count++
    }
    return { updated: count }
  }

  const db = await getDexie()
  let count = 0
  for (const item of updates) {
    const uuid = item.uuid.toUpperCase()
    const invoice = await db.invoices.get(uuid)
    if (invoice) {
      await db.invoices.update(uuid, {
        declare_status: item.declare_status,
        declared_tax_amount: item.declared_tax_amount,
        pending_tax_amount: item.pending_tax_amount
      })
      count++
    }
  }
  invalidateInvoiceCache()
  return { updated: count }
}

// ─── Summary / Aggregation ───

export async function getSummary(period = null, ledgerType = null) {
  const backend = getEffectiveBackend()

  if (backend === 'supabase') {
    const sb = await getSupabase()
    let query = sb.from('invoices').select('total, tax_amount, declared_tax_amount, pending_tax_amount, retencion_iva, retencion_isr, declare_status')
    if (period) query = query.eq('billing_period', period)
    if (ledgerType) query = query.eq('ledger_type', ledgerType)
    const { data, error } = await query
    if (error) throw error

    const items = data || []
    return {
      period, ledgerType,
      invoiceCount: items.length,
      totalAmount: items.reduce((s, r) => s + (r.total || 0), 0),
      totalTax: items.reduce((s, r) => s + (r.tax_amount || 0), 0),
      declaredTax: items.reduce((s, r) => s + (r.declared_tax_amount || 0), 0),
      pendingTax: items.reduce((s, r) => s + (r.pending_tax_amount || 0), 0),
      retencionIVA: items.reduce((s, r) => s + (r.retencion_iva || 0), 0),
      retencionISR: items.reduce((s, r) => s + (r.retencion_isr || 0), 0),
      statusBreakdown: {
        fully: items.filter(r => r.declare_status === 'fully').length,
        partial: items.filter(r => r.declare_status === 'partial').length,
        pending: items.filter(r => r.declare_status === 'pending').length
      }
    }
  }

  // IndexedDB
  const db = await getDexie()
  let items = _invoiceCache && !_invoiceCacheDirty ? _invoiceCache : await db.invoices.toArray()
  if (!_invoiceCache || _invoiceCacheDirty) { _invoiceCache = items; _invoiceCacheDirty = false }
  if (period) items = items.filter(r => r.billing_period === period)
  if (ledgerType) items = items.filter(r => r.ledger_type === ledgerType)

  return {
    period, ledgerType,
    invoiceCount: items.length,
    totalAmount: items.reduce((s, r) => s + (r.total || 0), 0),
    totalTax: items.reduce((s, r) => s + (r.tax_amount || 0), 0),
    declaredTax: items.reduce((s, r) => s + (r.declared_tax_amount || 0), 0),
    pendingTax: items.reduce((s, r) => s + (r.pending_tax_amount || 0), 0),
    retencionIVA: items.reduce((s, r) => s + (r.retencion_iva || 0), 0),
    retencionISR: items.reduce((s, r) => s + (r.retencion_isr || 0), 0),
    statusBreakdown: {
      fully: items.filter(r => r.declare_status === 'fully').length,
      partial: items.filter(r => r.declare_status === 'partial').length,
      pending: items.filter(r => r.declare_status === 'pending').length
    }
  }
}

export async function getCumulativeSummary(ledgerType = null) {
  const backend = getEffectiveBackend()

  if (backend === 'supabase') {
    const sb = await getSupabase()
    let query = sb.from('invoices').select('total, tax_amount, declared_tax_amount, pending_tax_amount')
    if (ledgerType) query = query.eq('ledger_type', ledgerType)
    const { data, error } = await query
    if (error) throw error

    const items = data || []
    return {
      invoiceCount: items.length,
      totalAmount: items.reduce((s, r) => s + (r.total || 0), 0),
      totalTax: items.reduce((s, r) => s + (r.tax_amount || 0), 0),
      declaredTax: items.reduce((s, r) => s + (r.declared_tax_amount || 0), 0),
      pendingTax: items.reduce((s, r) => s + (r.pending_tax_amount || 0), 0)
    }
  }

  const db = await getDexie()
  let items = _invoiceCache && !_invoiceCacheDirty ? _invoiceCache : await db.invoices.toArray()
  if (!_invoiceCache || _invoiceCacheDirty) { _invoiceCache = items; _invoiceCacheDirty = false }
  if (ledgerType) items = items.filter(r => r.ledger_type === ledgerType)

  return {
    invoiceCount: items.length,
    totalAmount: items.reduce((s, r) => s + (r.total || 0), 0),
    totalTax: items.reduce((s, r) => s + (r.tax_amount || 0), 0),
    declaredTax: items.reduce((s, r) => s + (r.declared_tax_amount || 0), 0),
    pendingTax: items.reduce((s, r) => s + (r.pending_tax_amount || 0), 0)
  }
}

// ─── Balance Breakdown ───

export async function getPendingTaxBreakdown(period = null, ledgerType = null) {
  const backend = getEffectiveBackend()

  if (backend === 'supabase') {
    const sb = await getSupabase()
    let query = sb.from('invoices').select('*').gt('pending_tax_amount', 0)
    if (period) query = query.eq('billing_period', period)
    if (ledgerType) query = query.eq('ledger_type', ledgerType)
    const { data, error } = await query
    if (error) throw error
    return data || []
  }

  const db = await getDexie()
  let items = _invoiceCache && !_invoiceCacheDirty ? _invoiceCache : await db.invoices.toArray()
  if (!_invoiceCache || _invoiceCacheDirty) { _invoiceCache = items; _invoiceCacheDirty = false }
  if (period) items = items.filter(r => r.billing_period === period)
  if (ledgerType) items = items.filter(r => r.ledger_type === ledgerType)
  return items.filter(r => (r.pending_tax_amount || 0) > 0)
}

export async function getInputCreditBreakdown(period = null) {
  const backend = getEffectiveBackend()

  if (backend === 'supabase') {
    const sb = await getSupabase()
    let query = sb.from('invoices').select('*').eq('ledger_type', 'input').neq('declare_status', 'fully')
    if (period) query = query.eq('billing_period', period)
    const { data, error } = await query
    if (error) throw error
    return data || []
  }

  const db = await getDexie()
  let items = _invoiceCache && !_invoiceCacheDirty ? _invoiceCache : await db.invoices.toArray()
  if (!_invoiceCache || _invoiceCacheDirty) { _invoiceCache = items; _invoiceCacheDirty = false }
  items = items.filter(r => r.ledger_type === 'input')
  if (period) items = items.filter(r => r.billing_period === period)
  return items.filter(r => r.declare_status !== 'fully')
}

// ─── SAP Vendor Mapping ───

export async function getSapMappings() {
  const backend = getEffectiveBackend()
  if (backend === 'supabase') {
    const sb = await getSupabase()
    const { data, error } = await sb.from('sap_mapping').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  }
  const db = await getDexie()
  return await db.sap_mapping.toArray()
}

export async function addSapMapping(mapping) {
  const backend = getEffectiveBackend()
  if (backend === 'supabase') {
    const sb = await getSupabase()
    const { data, error } = await sb.from('sap_mapping').insert(mapping).select().single()
    if (error) throw error
    return data
  }
  const db = await getDexie()
  const id = await db.sap_mapping.add(mapping)
  return { ...mapping, id }
}

export async function updateSapMapping(id, updates) {
  const backend = getEffectiveBackend()
  if (backend === 'supabase') {
    const sb = await getSupabase()
    const { data, error } = await sb.from('sap_mapping').update(updates).eq('id', id).select().single()
    if (error) throw error
    return data
  }
  const db = await getDexie()
  await db.sap_mapping.update(id, updates)
  return await db.sap_mapping.get(id)
}

export async function deleteSapMapping(id) {
  const backend = getEffectiveBackend()
  if (backend === 'supabase') {
    const sb = await getSupabase()
    const { error } = await sb.from('sap_mapping').delete().eq('id', id)
    if (error) throw error
    return
  }
  const db = await getDexie()
  await db.sap_mapping.delete(id)
}

export async function matchSapVendor(rfc) {
  if (!rfc) return null
  const backend = getEffectiveBackend()

  if (backend === 'supabase') {
    const sb = await getSupabase()
    const { data, error } = await sb.from('sap_mapping').select('sap_code, sap_name').eq('rfc', rfc.toUpperCase()).single()
    if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows found
    if (data) return { sap_code: data.sap_code, sap_name: data.sap_name }
    return null
  }

  const db = await getDexie()
  const mapping = await db.sap_mapping.where('rfc').equals(rfc.toUpperCase()).first()
  if (mapping) return { sap_code: mapping.sap_code, sap_name: mapping.sap_name }
  return null
}

export async function autoMatchSapVendors(invoices) {
  const backend = getEffectiveBackend()

  if (backend === 'supabase') {
    const sb = await getSupabase()
    const { data: mappings, error } = await sb.from('sap_mapping').select('rfc, sap_code, sap_name')
    if (error) throw error

    const mappingMap = new Map()
    for (const m of (mappings || [])) {
      mappingMap.set(m.rfc.toUpperCase(), m)
    }

    let matched = 0
    for (const invoice of invoices) {
      const rfcToMatch = invoice.emitter_rfc || invoice.receiver_rfc
      if (rfcToMatch) {
        const mapping = mappingMap.get(rfcToMatch.toUpperCase())
        if (mapping) {
          invoice.sap_vendor_code = mapping.sap_code
          invoice.sap_vendor_name = mapping.sap_name
          matched++
        }
      }
    }
    return { invoices, matched }
  }

  const db = await getDexie()
  const mappings = await db.sap_mapping.toArray()
  const mappingMap = new Map()
  for (const m of mappings) mappingMap.set(m.rfc.toUpperCase(), m)

  let matched = 0
  for (const invoice of invoices) {
    const rfcToMatch = invoice.emitter_rfc || invoice.receiver_rfc
    if (rfcToMatch) {
      const mapping = mappingMap.get(rfcToMatch.toUpperCase())
      if (mapping) {
        invoice.sap_vendor_code = mapping.sap_code
        invoice.sap_vendor_name = mapping.sap_name
        matched++
      }
    }
  }
  return { invoices, matched }
}

// ─── Saved Views ───

export async function getSavedViews() {
  const backend = getEffectiveBackend()
  if (backend === 'supabase') {
    const sb = await getSupabase()
    const { data, error } = await sb.from('views').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  }
  const db = await getDexie()
  return await db.views.toArray()
}

export async function saveView(name, config, isDefault = false) {
  const backend = getEffectiveBackend()
  const configStr = typeof config === 'string' ? config : JSON.stringify(config)
  const createdBy = localStorage.getItem('cfdi_username') || 'unknown'

  if (backend === 'supabase') {
    const sb = await getSupabase()

    // Check for existing view with same name
    const { data: existing } = await sb.from('views').select('id').eq('name', name).single()

    if (existing) {
      // Overwrite existing
      if (isDefault) {
        // Unset other defaults
        await sb.from('views').update({ is_default: 0 }).neq('id', existing.id).eq('is_default', 1)
      }
      const { data, error } = await sb.from('views').update({
        config: configStr,
        is_default: isDefault ? 1 : 0,
        updated_at: new Date().toISOString()
      }).eq('id', existing.id).select().single()
      if (error) throw error
      return { id: data.id, name, config, is_default: isDefault ? 1 : 0 }
    }

    // Create new
    if (isDefault) {
      await sb.from('views').update({ is_default: 0 }).eq('is_default', 1)
    }
    const { data, error } = await sb.from('views').insert({
      name,
      config: configStr,
      is_default: isDefault ? 1 : 0,
      created_by: createdBy
    }).select().single()
    if (error) throw error
    return { id: data.id, name, config, is_default: isDefault ? 1 : 0 }
  }

  // IndexedDB
  const db = await getDexie()
  const existing = await db.views.where('name').equals(name).first()
  if (existing) {
    if (isDefault) {
      const defaults = await db.views.where('is_default').equals(1).toArray()
      for (const v of defaults) {
        if (v.id !== existing.id) await db.views.update(v.id, { is_default: 0 })
      }
    }
    await db.views.update(existing.id, {
      config: configStr,
      is_default: isDefault ? 1 : 0,
      updated_at: new Date().toISOString()
    })
    return { id: existing.id, name, config, is_default: isDefault ? 1 : 0 }
  }

  if (isDefault) {
    const defaults = await db.views.where('is_default').equals(1).toArray()
    for (const v of defaults) await db.views.update(v.id, { is_default: 0 })
  }
  const id = await db.views.add({
    name,
    config: configStr,
    is_default: isDefault ? 1 : 0,
    created_by: createdBy,
    created_at: new Date().toISOString()
  })
  return { id, name, config, is_default: isDefault ? 1 : 0 }
}

export async function getDefaultView() {
  const backend = getEffectiveBackend()
  if (backend === 'supabase') {
    const sb = await getSupabase()
    const { data, error } = await sb.from('views').select('*').eq('is_default', 1).single()
    if (error && error.code !== 'PGRST116') throw error
    if (data) return { ...data, config: typeof data.config === 'string' ? JSON.parse(data.config) : data.config }
    return null
  }
  const db = await getDexie()
  const view = await db.views.where('is_default').equals(1).first()
  if (view) return { ...view, config: JSON.parse(view.config) }
  return null
}

export async function deleteView(id) {
  const backend = getEffectiveBackend()
  if (backend === 'supabase') {
    const sb = await getSupabase()
    const { error } = await sb.from('views').delete().eq('id', id)
    if (error) throw error
    return
  }
  const db = await getDexie()
  await db.views.delete(id)
}

// ─── Audit Log ───

export async function logAction(action, tableName, recordId, oldValue, newValue) {
  const backend = getEffectiveBackend()
  const userName = localStorage.getItem('cfdi_username') || 'unknown'

  if (backend === 'supabase') {
    const sb = await getSupabase()
    const { error } = await sb.from('audit_log').insert({
      action,
      table_name: tableName,
      record_id: recordId,
      old_value: oldValue ? JSON.stringify(oldValue) : null,
      new_value: newValue ? JSON.stringify(newValue) : null,
      user_name: userName
    })
    if (error) console.error('[DB] logAction error:', error)
    return
  }

  const db = await getDexie()
  await db.audit_log.add({
    action,
    table_name: tableName,
    record_id: recordId,
    old_value: oldValue ? JSON.stringify(oldValue) : null,
    new_value: newValue ? JSON.stringify(newValue) : null,
    user: userName,
    timestamp: new Date().toISOString()
  })
}

export async function getAuditLog(limit = 100) {
  const backend = getEffectiveBackend()
  if (backend === 'supabase') {
    const sb = await getSupabase()
    const { data, error } = await sb.from('audit_log').select('*').order('timestamp', { ascending: false }).limit(limit)
    if (error) throw error
    return data || []
  }
  const db = await getDexie()
  return await db.audit_log.reverse().limit(limit).toArray()
}

// ─── Statistics ───

export async function getStats() {
  const backend = getEffectiveBackend()

  if (backend === 'supabase') {
    const sb = await getSupabase()
    const { count: total } = await sb.from('invoices').select('uuid', { count: 'exact', head: true })
    const { count: output } = await sb.from('invoices').select('uuid', { count: 'exact', head: true }).eq('ledger_type', 'output')
    const { count: input } = await sb.from('invoices').select('uuid', { count: 'exact', head: true }).eq('ledger_type', 'input')
    const { count: pending } = await sb.from('invoices').select('uuid', { count: 'exact', head: true }).eq('declare_status', 'pending')
    return { total: total || 0, output: output || 0, input: input || 0, pending: pending || 0 }
  }

  const db = await getDexie()
  const total = await db.invoices.count()
  const output = await db.invoices.where('ledger_type').equals('output').count()
  const input = await db.invoices.where('ledger_type').equals('input').count()
  const pending = await db.invoices.where('declare_status').equals('pending').count()
  return { total, output, input, pending }
}

// ─── Export backend info for UI ───

export function getCurrentBackend() {
  return getEffectiveBackend()
}
