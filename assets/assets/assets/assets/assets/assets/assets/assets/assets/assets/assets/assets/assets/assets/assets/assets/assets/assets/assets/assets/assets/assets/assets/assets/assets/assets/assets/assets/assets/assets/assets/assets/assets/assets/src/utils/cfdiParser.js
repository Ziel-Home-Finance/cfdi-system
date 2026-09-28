/**
 * CFDI XML Parser Engine
 * Supports CFDI 3.3, CFDI 4.0, and Retencion CFDI
 *
 * Namespace references:
 *   cfdi:      http://www.sat.gob.mx/cfd/3  (CFDI 3.3)
 *   cfdi:      http://www.sat.gob.mx/cfd/4  (CFDI 4.0)
 *   tfd:       http://www.sat.gob.mx/TimbreFiscalDigital
 *   retenciones: http://www.sat.gob.mx/esquemas/retencionpago
 */

import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (name) => {
    // These tags can appear multiple times
    const arrayTags = [
      'cfdi:Concepto',
      'cfdi:Traslado',
      'cfdi:Retencion',
      'retenciones:Retencion',
      'retenciones:Impuesto',
      'retenciones:ImpRetenidos',
      'plataformasTecnologicas:DetallesDelServicio',
      'plataformasTecnologicas:ImpuestosTrasladadosdelServicio'
    ]
    return arrayTags.includes(name)
  }
})

/**
 * Parse a CFDI XML string and extract all ledger fields
 * @param {string} xmlString - Raw XML content
 * @returns {Object} Parsed CFDI record
 */
export function parseCFDI(xmlString) {
  const parsed = parser.parse(xmlString)

  // Detect document type: regular CFDI vs Retencion
  // Skip ?xml declaration node
  const rootKey = Object.keys(parsed).find(k => k !== '?xml')
  const root = parsed[rootKey]

  if (rootKey.includes('Retenciones') || root['retenciones:Retenciones']) {
    return parseRetencion(root['retenciones:Retenciones'] || root)
  }

  return parseRegularCFDI(root)
}

/**
 * Parse regular CFDI (Ingreso / Egreso / Pago)
 */
function parseRegularCFDI(comprobante) {
  // Handle namespace prefix variations
  const get = (obj, key) => {
    if (!obj) return null
    // Try with namespace prefix
    for (const k of Object.keys(obj)) {
      if (k === key || k.endsWith(':' + key)) return obj[k]
    }
    return null
  }

  const getAttr = (obj, attr) => {
    if (!obj) return null
    return obj['@_' + attr] ?? null
  }

  // Extract TimbreFiscalDigital for UUID
  const complemento = get(comprobante, 'Complemento')
  const tfd = complemento ? get(complemento, 'TimbreFiscalDigital') : null
  const uuid = getAttr(tfd, 'UUID') || ''

  // Extract Emisor / Receptor
  const emisor = get(comprobante, 'Emisor') || {}
  const receptor = get(comprobante, 'Receptor') || {}

  // Extract Conceptos (line items)
  const conceptosNode = get(comprobante, 'Conceptos')
  let conceptos = []
  if (conceptosNode) {
    const c = get(conceptosNode, 'Concepto')
    if (c) conceptos = Array.isArray(c) ? c : [c]
  }

  // Build description summary from conceptos
  const descriptions = conceptos.map(c => getAttr(c, 'Descripcion')).filter(Boolean)
  const descriptionSummary = descriptions.join('; ')

  // Extract tax info
  const impuestos = get(comprobante, 'Impuestos')
  const traslados = impuestos ? get(impuestos, 'Traslados') : null
  const trasladoList = traslados ? (get(traslados, 'Traslado') || []) : []
  const trasladoArr = Array.isArray(trasladoList) ? trasladoList : [trasladoList]

  // Total tax (IVA trasladado)
  const totalImpuestosTrasladados = getAttr(impuestos, 'TotalImpuestosTrasladados') || 0

  // Extract IVA rate (typically 0.16 = 16%)
  // CFDI 3.3/4.0: Impuesto="002" (002=IVA, 001=ISR), TasaOCuota="0.160000"
  // Note: parseAttributeValue converts "002" to number 2
  let ivaRate = 0
  let ivaAmount = 0
  for (const t of trasladoArr) {
    const impuesto = String(getAttr(t, 'Impuesto') || '')
    if (impuesto === '002' || impuesto === '2' || impuesto === 'IVA') {
      ivaRate = parseFloat(getAttr(t, 'TasaOCuota') || getAttr(t, 'TasaCuota') || 0)
      ivaAmount = parseFloat(getAttr(t, 'Importe') || 0)
      break
    }
  }

  // Extract retentions (if any within regular CFDI)
  // CFDI 3.3/4.0: Impuesto="002" (IVA) or "001" (ISR)
  const retencionesNode = impuestos ? get(impuestos, 'Retenciones') : null
  const retencionList = retencionesNode ? (get(retencionesNode, 'Retencion') || []) : []
  const retencionArr = Array.isArray(retencionList) ? retencionList : [retencionList]

  let retencionIVA = 0
  let retencionISR = 0
  for (const r of retencionArr) {
    const impuesto = String(getAttr(r, 'Impuesto') || '')
    const importe = parseFloat(getAttr(r, 'Importe') || 0)
    if (impuesto === '002' || impuesto === '2' || impuesto === 'IVA') retencionIVA = importe
    if (impuesto === '001' || impuesto === '1' || impuesto === 'ISR') retencionISR = importe
  }

  // Extract related CFDI UUIDs (CfdiRelacionados > CfdiRelacionado)
  // Common for Egreso (credit notes) referencing original Ingreso invoices
  const relacionNode = get(comprobante, 'CfdiRelacionados')
  let relatedUuids = []
  let relationType = ''
  if (relacionNode) {
    relationType = String(getAttr(relacionNode, 'TipoRelacion') || '')
    const relacionadoList = get(relacionNode, 'CfdiRelacionado')
    if (relacionadoList) {
      const arr = Array.isArray(relacionadoList) ? relacionadoList : [relacionadoList]
      relatedUuids = arr.map(r => String(getAttr(r, 'UUID') || '')).filter(Boolean).map(u => u.toUpperCase())
    }
  }

  // Extract date and derive billing period
  const fecha = getAttr(comprobante, 'Fecha') || ''
  const billingPeriod = fecha ? fecha.substring(0, 7) : '' // YYYY-MM

  // Extract invoice type
  const tipoComprobante = getAttr(comprobante, 'TipoDeComprobante') || ''

  // Determine ledger type (output/input) based on whether COWIT is emitter or receiver
  // COWIT is our company RFC prefix — if COWIT is the emitter, it's output (sales);
  // if COWIT is the receiver, it's input (purchase)
  const emitterRfc = getAttr(emisor, 'Rfc') || ''
  const receiverRfc = getAttr(receptor, 'Rfc') || ''
  const isOurCompanyEmitter = emitterRfc.toUpperCase().startsWith('COW')
  const isOurCompanyReceiver = receiverRfc.toUpperCase().startsWith('COW')

  let ledgerType = 'other'
  if (isOurCompanyEmitter) {
    ledgerType = 'output'
  } else if (isOurCompanyReceiver) {
    ledgerType = 'input'
  }

  // Extract invoice status (CFDI 4.0 has Estatus attribute: "Vigente" | "Cancelada")
  // CFDI 3.3 doesn't have this attribute — default to "Vigente"
  const invoiceStatus = String(getAttr(comprobante, 'Estatus') || 'Vigente')

  return {
    uuid: uuid.toUpperCase(),
    folio: getAttr(comprobante, 'Folio') || '',
    fecha: fecha,
    billing_period: billingPeriod,
    total: parseFloat(getAttr(comprobante, 'Total') || 0),
    subtotal: parseFloat(getAttr(comprobante, 'SubTotal') || 0),
    tax_amount: parseFloat(totalImpuestosTrasladados),
    tax_rate: ivaRate,
    iva_amount: ivaAmount,
    emitter_name: getAttr(emisor, 'Nombre') || '',
    emitter_rfc: getAttr(emisor, 'Rfc') || '',
    receiver_name: getAttr(receptor, 'Nombre') || '',
    receiver_rfc: getAttr(receptor, 'Rfc') || '',
    description: descriptionSummary,
    invoice_type: tipoComprobante,
    invoice_status: invoiceStatus,
    ledger_type: ledgerType,
    related_uuid: relatedUuids.join('; '),
    relation_type: relationType,
    retencion_iva: retencionIVA,
    retencion_isr: retencionISR,
    // Fields to be filled by admin or derived
    sap_vendor_code: '',
    sap_vendor_name: '',
    declare_period: '',
    declare_status: 'pending',
    declared_tax_amount: 0,
    pending_tax_amount: parseFloat(totalImpuestosTrasladados),
    raw_xml: ''
  }
}

/**
 * Parse Retencion CFDI (withholding tax receipt)
 * Supports Retencion 1.0 and 2.0 formats
 *
 * Retencion 2.0 structure (from real TikTok sample):
 *   <retenciones:Retenciones Version="2.0" FolioInt="..." ...>
 *     <retenciones:Emisor RfcE="..." NomDenRazSocE="..." RegimenFiscalE="..." />
 *     <retenciones:Receptor NacionalidadR="Nacional">
 *       <retenciones:Nacional RfcR="..." NomDenRazSocR="..." DomicilioFiscalR="..." />
 *     </retenciones:Receptor>
 *     <retenciones:Periodo MesIni="04" MesFin="04" Ejercicio="2026" />
 *     <retenciones:Totales MontoTotOperacion="..." MontoTotGrav="..." MontoTotExent="..." MontoTotRet="...">
 *       <retenciones:ImpRetenidos BaseRet="..." ImpuestoRet="002" MontoRet="..." TipoPagoRet="..." />
 *       <retenciones:ImpRetenidos BaseRet="..." ImpuestoRet="001" MontoRet="..." TipoPagoRet="..." />
 *     </retenciones:Totales>
 *     <retenciones:Complemento>
 *       <plataformasTecnologicas:ServiciosPlataformasTecnologicas ... />
 *       <tfd:TimbreFiscalDigital UUID="..." FechaTimbrado="..." ... />
 *     </retenciones:Complemento>
 *   </retenciones:Retenciones>
 */
function parseRetencion(retenciones) {
  const getAttr = (obj, attr) => {
    if (!obj) return null
    return obj['@_' + attr] ?? null
  }

  const get = (obj, key) => {
    if (!obj || typeof obj !== 'object') return null
    for (const k of Object.keys(obj)) {
      if (k === key || k.endsWith(':' + key)) return obj[k]
    }
    return null
  }

  // Try multiple attribute names for emitter
  const emisor = get(retenciones, 'Emisor') || {}
  const emitterRfc = getAttr(emisor, 'RfcE') || getAttr(emisor, 'Rfc') || ''
  const emitterName = getAttr(emisor, 'NomDenRazSocE') || getAttr(emisor, 'NomDenRazSoc') || getAttr(emisor, 'Nombre') || emitterRfc

  // Receiver: in Retencion 2.0, Receptor has nested Nacional/Extranjero
  const receptorNode = get(retenciones, 'Receptor') || {}
  let receiverRfc = getAttr(receptorNode, 'RfcR') || getAttr(receptorNode, 'Rfc') || ''
  let receiverName = getAttr(receptorNode, 'NomDenRazSocR') || getAttr(receptorNode, 'NomRazonSoc') || getAttr(receptorNode, 'Nombre') || ''

  // If receiver info is nested under Nacional/Extranjero
  if (!receiverRfc) {
    const nacional = get(receptorNode, 'Nacional')
    if (nacional) {
      receiverRfc = getAttr(nacional, 'RfcR') || getAttr(nacional, 'Rfc') || ''
      receiverName = getAttr(nacional, 'NomDenRazSocR') || getAttr(nacional, 'NomRazonSoc') || getAttr(nacional, 'Nombre') || ''
    }
  }

  // Extract UUID and date from TimbreFiscalDigital
  const complemento = get(retenciones, 'Complemento')
  const tfd = complemento ? get(complemento, 'TimbreFiscalDigital') : null
  const uuid = getAttr(tfd, 'UUID') || ''
  const fechaTimbrado = getAttr(tfd, 'FechaTimbrado') || ''

  // Also try FechaExp from root (Retencion 1.0)
  const fecha = fechaTimbrado || getAttr(retenciones, 'FechaExp') || ''
  const billingPeriod = fecha ? fecha.substring(0, 7) : ''

  // Extract retention details from Totales > ImpRetenidos
  const totales = get(retenciones, 'Totales')
  const impRetenidosList = totales ? (get(totales, 'ImpRetenidos') || []) : []
  const impRetenidosArr = Array.isArray(impRetenidosList) ? impRetenidosList : [impRetenidosList]

  let retencionIVA = 0
  let retencionISR = 0
  let totalRetenido = 0

  for (const r of impRetenidosArr) {
    // Retencion 2.0 uses ImpuestoRet (001=ISR, 002=IVA), MontoRet
    // Retencion 1.0 uses Impuesto, ImporteRetenido/Importe
    // Note: parseAttributeValue may convert "002" to number 2
    const impuestoCode = String(getAttr(r, 'ImpuestoRet') || getAttr(r, 'Impuesto') || '')
    const importe = parseFloat(getAttr(r, 'MontoRet') || getAttr(r, 'ImporteRetenido') || getAttr(r, 'Importe') || 0)
    totalRetenido += importe
    // 002 = IVA, 001 = ISR (also handle numeric 2/1 from auto-parsing)
    if (impuestoCode === '002' || impuestoCode === '2' || impuestoCode === 'IVA') retencionIVA = importe
    if (impuestoCode === '001' || impuestoCode === '1' || impuestoCode === 'ISR') retencionISR = importe
  }

  // Also try Retencion 1.0 structure (Impuestos > Retencion)
  if (impRetenidosArr.length === 0) {
    const impuestosNode = get(retenciones, 'Impuestos')
    const retencionList = impuestosNode ? (get(impuestosNode, 'Retencion') || []) : []
    const retencionArr = Array.isArray(retencionList) ? retencionList : [retencionList]
    for (const r of retencionArr) {
      const impuestoCode = String(getAttr(r, 'Impuesto') || '')
      const importe = parseFloat(getAttr(r, 'ImporteRetenido') || getAttr(r, 'Importe') || 0)
      totalRetenido += importe
      if (impuestoCode === '002' || impuestoCode === '2' || impuestoCode === 'IVA') retencionIVA = importe
      if (impuestoCode === '001' || impuestoCode === '1' || impuestoCode === 'ISR') retencionISR = importe
    }
  }

  // Extract totals from Totales element
  const montoTotOperacion = parseFloat(getAttr(totales, 'MontoTotOperacion') || 0)
  const montoTotGrav = parseFloat(getAttr(totales, 'MontoTotGrav') || 0)
  const montoTotRet = parseFloat(getAttr(totales, 'MontoTotRet') || totalRetenido)

  // Try to extract IVA info from plataformasTecnologicas complement
  let ivaAmount = 0
  let ivaRate = 0
  let description = 'Retencion (Withholding Tax)'
  const plataformasComp = complemento ? get(complemento, 'ServiciosPlataformasTecnologicas') : null
  if (plataformasComp) {
    const totalIVATrasladado = getAttr(plataformasComp, 'TotalIVATrasladado')
    if (totalIVATrasladado) ivaAmount = parseFloat(totalIVATrasladado)

    // Extract service details for description
    const serviciosNode = get(plataformasComp, 'Servicios')
    if (serviciosNode) {
      const detalles = get(serviciosNode, 'DetallesDelServicio')
      if (detalles) {
        const detallesArr = Array.isArray(detalles) ? detalles : [detalles]
        const impuestosTrasladados = detallesArr.map(d => get(d, 'ImpuestosTrasladadosdelServicio')).filter(Boolean)
        for (const itNode of impuestosTrasladados) {
          const itArr = Array.isArray(itNode) ? itNode : [itNode]
          for (const it of itArr) {
            const tasa = getAttr(it, 'TasaCuota')
            if (tasa) ivaRate = parseFloat(tasa)
          }
        }
      }
    }
    description = 'Plataformas Tecnologicas (Withholding)'
  }

  // Total amount: use MontoTotOperacion (total operation amount) as the "total"
  const total = montoTotOperacion || montoTotGrav || montoTotRet

  return {
    uuid: uuid.toUpperCase(),
    folio: getAttr(retenciones, 'FolioInt') || '',
    fecha: fecha,
    billing_period: billingPeriod,
    total: total,
    subtotal: montoTotGrav || total,
    tax_amount: ivaAmount,
    tax_rate: ivaRate,
    iva_amount: ivaAmount,
    emitter_name: emitterName,
    emitter_rfc: emitterRfc,
    receiver_name: receiverName,
    receiver_rfc: receiverRfc,
    description: description,
    invoice_type: 'R',
    invoice_status: 'Vigente',
    ledger_type: 'input',
    related_uuid: '',
    relation_type: '',
    retencion_iva: retencionIVA,
    retencion_isr: retencionISR,
    sap_vendor_code: '',
    sap_vendor_name: '',
    declare_period: '',
    declare_status: 'pending',
    declared_tax_amount: 0,
    pending_tax_amount: retencionIVA + retencionISR,
    raw_xml: ''
  }
}

/**
 * Batch parse multiple XML files
 * @param {Array<{name: string, content: string}>} files
 * @returns {{success: Array, errors: Array}}
 */
export function batchParseXML(files) {
  const success = []
  const errors = []

  for (const file of files) {
    try {
      const record = parseCFDI(file.content)
      record.raw_xml = file.content
      record.file_name = file.name
      success.push(record)
    } catch (err) {
      errors.push({
        name: file.name,
        error: err.message || 'Parse error'
      })
    }
  }

  return { success, errors }
}
