/**
 * Mexico Pedimento PDF parser — v2.
 *
 * Section-aware extraction with multi-broker layout tolerance.
 * Reference: 关单字段整理.xlsx 人工解读结果.
 *
 * PDF.js loaded on demand from CDN.
 */

const PDFJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.min.mjs'
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.worker.min.mjs'
let pdfjsPromise = null

function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(/* @vite-ignore */ PDFJS_SRC).then(module => {
      const pdfjs = module.default || module
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
      return pdfjs
    })
  }
  return pdfjsPromise
}

// ─── Helpers ───
function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}
function numVal(v) {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(String(v).replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

// ─── Country detection (from supplier DOMICILIO, NOT transport PAIS) ───
const COUNTRY_MAP = [
  ['HONG KONG','HK'],['ESTADOS UNIDOS MEXICANOS','MX'],['ESTADOS UNIDOS','US'],
  ['UNITED STATES','US'],['CHINA','CN'],['MEXICO','MX'],['CANADA','CA'],
  ['JAPON','JP'],['JAPAN','JP'],['KOREA','KR'],['ALEMANIA','DE'],['GERMANY','DE'],
  ['FRANCIA','FR'],['FRANCE','FR'],['ITALIA','IT'],['ITALY','IT'],
  ['ESPANA','ES'],['SPAIN','ES'],['REINO UNIDO','GB'],['UNITED KINGDOM','GB'],
  ['TAIWAN','TW'],['VIETNAM','VN'],['INDIA','IN'],['BRASIL','BR'],['BRAZIL','BR'],
  ['SINGAPORE','SG'],['MALASIA','MY'],['MALAYSIA','MY'],['TAILANDIA','TH'],
  ['THAILAND','TH'],['INDONESIA','ID'],['SUIZA','CH'],['PAISES BAJOS','NL'],
  ['NETHERLANDS','NL'],['BELGICA','BE'],['BELGIUM','BE'],['AUSTRIA','AT'],
  ['AUSTRALIA','AU'],['POLONIA','PL'],['SUECIA','SE'],['SWEDEN','SE'],
  ['DINAMARCA','DK'],['DENMARK','DK'],['NORUEGA','NO'],['NORWAY','NO'],
  ['FINLANDIA','FI'],['FINLAND','FI'],['PORTUGAL','PT'],['TURQUIA','TR'],
  ['TURKEY','TR'],['RUSIA','RU'],['RUSSIA','RU'],['COLOMBIA','CO'],
  ['ARGENTINA','AR'],['CHILE','CL'],['PERU','PE'],
]
// longest first for greedy match
COUNTRY_MAP.sort((a, b) => b[0].length - a[0].length)

function detectCountry(address) {
  if (!address) return ''
  const upper = address.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const [name, code] of COUNTRY_MAP) {
    if (upper.includes(name)) return code
  }
  return ''
}

/** Parse DD-MM-YYYY or YYYY-MM-DD to YYYY.MM */
function dateToPeriod(dateStr) {
  if (!dateStr) return ''
  const d = dateStr.replace(/[\/\.]/g, '-')
  // DD-MM-YYYY
  let m = d.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (m && parseInt(m[1]) <= 31 && parseInt(m[3]) >= 2000) {
    return `${m[3]}.${String(m[2]).padStart(2, '0')}`
  }
  // YYYY-MM-DD
  m = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m && parseInt(m[1]) >= 2000) {
    return `${m[1]}.${String(parseInt(m[2])).padStart(2, '0')}`
  }
  return ''
}

/** Extract text between startLabel and endLabel (case-insensitive substring) */
function section(text, startLabel, endLabel) {
  const idx = text.indexOf(startLabel)
  if (idx === -1) return ''
  const start = idx + startLabel.length
  let end = text.length
  if (endLabel) {
    const ei = text.indexOf(endLabel, start)
    if (ei > start) end = ei
  }
  return text.slice(start, end)
}

/** Find first numeric value > minVal in a string slice */
function findNumInRange(str, startIdx, range, minVal = 0) {
  if (startIdx < 0) return 0
  const tail = str.slice(startIdx, Math.min(startIdx + range, str.length))
  const numbers = [...tail.matchAll(/[\d,]+(?:\.\d{1,2})?/g)].map(m => numVal(m[0]))
  for (const v of numbers) {
    if (v > minVal) return v
  }
  return 0
}

/**
 * Find tax amount for a specific label in the CUADRO section.
 * label: e.g. "IVA", "IVA/PRV", "IGI", "DTA"
 * The label is followed by numbers; takes first meaningful (> 10) value.
 */
function findTaxAmount(cuadro, label) {
  const idx = cuadro.indexOf(label)
  if (idx === -1) return 0
  return findNumInRange(cuadro, idx + label.length, 300, 10)
}

// ─── Main parser ───
function parseFields(text, fileName) {
  const oneLine = clean(text)
  const raw = text.replace(/\r/g, '\n')

  // ── 1. Pedimento number (last 7-digit group from full number) ──
  let pedimento = ''
  const pmMatch = raw.match(/\b(\d{2})\s+(\d{2})\s+(\d{4})\s+(\d{7})\b/)
  if (pmMatch) {
    pedimento = pmMatch[4]
  }
  if (!pedimento && fileName) {
    const fm = fileName.match(/(\d{7})/)
    if (fm && raw.includes(fm[1])) pedimento = fm[1]
  }

  // ── 2. Importer RFC ──
  let rfc = ''
  const rfcMatch = oneLine.match(/(?:IMPORTADOR|EXPORTADOR)[^]*?RFC\s*[:#]?\s*([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})/i) ||
    oneLine.match(/(?:RFC|R\.F\.C\.)\s*[:#]?\s*([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})/i)
  if (rfcMatch) rfc = clean(rfcMatch[1]).toUpperCase()

  // ── 3-7. CUADRO DE LIQUIDACION ──
  // CUADRO table structure (per row): LABEL ... rate ... amount
  // We must take the LAST number → amount, NOT the first → rate.
  const CUADRO_END_MARKERS = ['DEPOSITO REFERENCIADO', 'DEPÓSITO REFERENCIADO',
    '***PAGO', 'CODIGO DE BARRAS', 'DATOS DEL PROVEEDOR']
  // CUADRO labels + table-column markers (EFECTIVO/OTROS appear in Type 2 two-column layout)
const CUADRO_LABELS = ['DTA', 'IVA/PRV', 'IGI/IGE', 'IGI', 'IVA', 'PRV']
const CUADRO_MARKERS = [...CUADRO_LABELS, 'EFECTIVO', 'OTROS', 'TOTAL']

  /**
   * Extract amount for one CUADRO line item.
   * In a CUADRO row the last number after the label is the amount (rate comes first).
   * We look from labelPos to the next label (or TOTAL) and take the last number.
   */
  function extractCuadroItem(text, label, labelPos) {
    const start = labelPos + label.length
    let endIdx = text.length
    for (const other of CUADRO_MARKERS) {
      if (other === label) continue
      const oi = text.indexOf(other, start)
      if (oi >= start && oi < endIdx) endIdx = oi
    }
    const section = text.slice(start, endIdx)
    const nums = [...section.matchAll(/[\d,]+(?:\.\d{1,2})?/g)].map(m => numVal(m[0]))
    // Last number = amount (rate/percentage comes first, then the monetary value)
    return nums.length > 0 ? nums[nums.length - 1] : 0
  }

  // Build cuadro / tasas text
  let cuadro = ''
  const ci = oneLine.indexOf('CUADRO DE LIQUIDACION')
  if (ci >= 0) {
    cuadro = oneLine.slice(ci, ci + 2000)
    for (const em of CUADRO_END_MARKERS) {
      const ei = cuadro.indexOf(em)
      if (ei > 50) { cuadro = cuadro.slice(0, ei); break }
    }
  }
  let tasasSection = ''
  const ti = oneLine.indexOf('TASAS A NIVEL PEDIMENTO')
  if (ti >= 0) {
    tasasSection = oneLine.slice(ti, Math.min(ti + 2000, oneLine.length))
  }

  // TOTAL: from CUADRO (both types). Use lastIndexOf to avoid matching "TOTALES" header (Type 2).
  let total = 0
  if (cuadro) {
    const totalIdx = cuadro.lastIndexOf('TOTAL')
    if (totalIdx >= 0) total = findNumInRange(cuadro, totalIdx + 5, 100, 1000)
  }
  if (!total && tasasSection) {
    total = findNumInRange(tasasSection, tasasSection.lastIndexOf('TOTAL') + 5, 100, 1000)
  }

  // Individual tax items: use combined text spanning CUADRO → TASAS.
  // Type 1: items are in CUADRO. Type 2: items are in TASAS (each label appears twice:
  //   first as rate row "1 DTA 7 8.000", second as amount row "DTA 0 6348").
  // We use lastIndexOf + extractCuadroItem to get the LAST occurrence (= amount row).
  const taxStart = Math.min(ci >= 0 ? ci : Infinity, ti >= 0 ? ti : Infinity)
  const taxEnd = Math.max(
    (ci >= 0 ? ci + cuadro.length : 0),
    (ti >= 0 ? ti + tasasSection.length : 0)
  )
  const taxText = taxStart >= 0 && taxEnd > taxStart
    ? oneLine.slice(taxStart, Math.min(taxEnd, oneLine.length))
    : (cuadro || tasasSection)

  // Helper: find last occurrence of a label in taxText, extract amount
  function lastItem(text, label) {
    const idx = text.lastIndexOf(label)
    if (idx < 0) return 0
    return extractCuadroItem(text, label, idx)
  }

  // DTA
  let dta = lastItem(taxText, 'DTA')

  // IVA/PRV
  let ivaPrv = lastItem(taxText, 'IVA/PRV')

  // IGI
  let igi = lastItem(taxText, 'IGI/IGE')
  if (!igi) igi = lastItem(taxText, 'IGI')

  // Standalone IVA (exclude IVA/PRV substring matches)
  let iva = 0
  const allIva = [...taxText.matchAll(/\bIVA\b(?!\s*\/\s*PRV)/gi)]
  if (allIva.length > 0) {
    const last = allIva[allIva.length - 1]
    iva = extractCuadroItem(taxText, 'IVA', last.index)
  }

  // PRV (standalone — NOT the "PRV" substring inside "IVA/PRV")
  let prv = 0
  let searchFrom = 0
  while (true) {
    const prvIdx = taxText.indexOf('PRV', searchFrom)
    if (prvIdx < 0) break
    const before = taxText.slice(Math.max(0, prvIdx - 7), prvIdx)
    if (before.includes('IVA/')) {
      searchFrom = prvIdx + 1
      continue
    }
    prv = extractCuadroItem(taxText, 'PRV', prvIdx)
    break
  }

  // ── 8-9. FECHA DE PAGO → Period ──
  // Find payment section (post-PAGO ELECTRONICO)
  let paySection = ''
  const payIdx = Math.max(oneLine.indexOf('PAGO ELECTRONICO'), oneLine.indexOf('PAGO ELECTRÓNICO'))
  if (payIdx >= 0) {
    paySection = oneLine.slice(payIdx, Math.min(payIdx + 1500, oneLine.length))
  }
  // Search for date after "FECHA DE PAGO" with wide range (up to 300 chars later)
  let fechaPago = ''
  if (paySection) {
    const fpIdx = paySection.indexOf('FECHA DE PAGO')
    if (fpIdx >= 0) {
      const tail = paySection.slice(fpIdx + 13, fpIdx + 400)
      const dateMatch = tail.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/)
      if (dateMatch) fechaPago = dateMatch[1]
    }
  }
  // Broader fallback
  if (!fechaPago) {
    const fpIdx = oneLine.indexOf('FECHA DE PAGO')
    if (fpIdx >= 0) {
      const tail = oneLine.slice(fpIdx + 13, fpIdx + 500)
      const m = tail.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/)
      if (m) fechaPago = m[1]
    }
  }
  const period = dateToPeriod(fechaPago)

  // ── 10-13. Supplier fields (PROVEEDOR) ──
  let idFiscal = ''
  let supplierName = ''
  let pais = ''
  let domicilio = ''

  const provIdx = oneLine.indexOf('DATOS DEL PROVEEDOR')
  if (provIdx >= 0) {
    let provText = oneLine.slice(provIdx, Math.min(provIdx + 2500, oneLine.length))
    // Trim at known end markers
    for (const end of ['COMPLEMENTO 1', 'OBSERVACIONES', 'IDENTIFICACION:',
      'TRANSPORTE', 'PAIS:']) {
      const ei = provText.indexOf(end)
      if (ei > 30) { provText = provText.slice(0, ei); break }
    }

    // ID Fiscal: first 8-9 digit number not looking like a year
    const idMatch = provText.match(/\b(\d{8,9})\b/g)
    if (idMatch) {
      for (const id of idMatch) {
        if (!/^(19|20)\d{2}/.test(id) &&
            !/^\d{5}$/.test(id) /* exclude zip codes */) {
          idFiscal = id
          break
        }
      }
    }

    // Supplier name: ALL CAPS company name with legal suffix
    const companyPattern = /\b([A-Z][A-Z\s,.'&()-]+?\b(?:CO[.,\s]+LIMITED|LIMITED|S\.?\s*[AD]\s+DE\s+[CR][LV]|S\.?\s*[AD]\.?\s+DE\s+C\.?\s*V\.?|INC\.?|LLC|LTD\.?|CORP\.?|B\.?\s*V\.?|GMBH|[SA]\.?\s*[SA]\.?|S\.?\s*R\.?\s*L\.?|S\.?\s*P\.?\s*A\.?))\b/i
    const nameMatch = provText.match(companyPattern)
    if (nameMatch) supplierName = clean(nameMatch[1])

    // Domain: scan PROVEEDOR text for address-like content containing country names
    // The DOMICILIO value is a multi-line address with street, number, city, country
    // Strategy: find street/city/country patterns after DOMICILIO label
    const domIdx = provText.indexOf('DOMICILIO')
    if (domIdx >= 0) {
      // Take text from DOMICILIO to end of proveedor section
      const afterDom = provText.slice(domIdx)
      // The address should be a long block with numbers, commas, and country name
      // Try to find an address block: starts with street info, contains country
      const addrMatch = afterDom.match(
        /DOMICILIO[:\s]*([\s\S]{10,300}?)(?=FACTOR\s+MON|INCOTERM|FECHA|NUM\.\s*CFDI|NUM\.\s*FACTURA|VINCULACION|$)/i
      )
      if (addrMatch) {
        domicilio = clean(addrMatch[1])
        // If the captured text is just a company name (layout 6002857), 
        // search for actual address after VINCULACION and ID FISCAL
        if (domicilio.length < 20 || /LIMITED|S\.?\s*A\.?\s*DE\s*C\.?\s*V\.?/i.test(domicilio)) {
          // Address follows after VINCULACION + NO + ID FISCAL
          const afterVin = afterDom.match(/VINCULACION[:\s]*\w+\s*(\d{8,9})\s*([\s\S]{10,300}?)(?=FACTOR\s+MON|INCOTERM|FECHA|$)/i)
          if (afterVin) domicilio = clean(afterVin[2])
        }
      }
    }

    // Pais: detect country from the PROVEEDOR section text
    // The supplier address (DOMICILIO) always contains the country
    pais = detectCountry(domicilio)
    // Fallback: search entire PROVEEDOR section for country patterns
    if (!pais) {
      pais = detectCountry(provText)
    }
  }

  // ── 14. Internal Reference ──
  // The internal ref (LM260293, MX260150, etc.) always appears adjacent to COVE code.
  // Type 1: "LM260293,COVE2689ES4X5" → code before COVE
  // Type 2: "COVE2688B5CY5 MX260150 23/06/2026" → code after COVE
  let internalRef = ''
  // Pattern A: code BEFORE COVE — e.g. "LM260293,COVE..."
  let irefMatch = oneLine.match(/\b([A-Z]{2,}\d{5,6})\s*,?\s*COVE[A-Z0-9]+\b/)
  if (irefMatch) {
    internalRef = irefMatch[1]
  }
  // Pattern B: code AFTER COVE — e.g. "COVE2688B5CY5 MX260150 23/06/2026"
  if (!internalRef) {
    irefMatch = oneLine.match(/\bCOVE[A-Z0-9]+\s+([A-Z]{2,}\d{5,6})\b/)
    if (irefMatch) internalRef = irefMatch[1]
  }
  // Pattern C: broad fallback for unusual layouts
  if (!internalRef) {
    const allCodes = [...oneLine.matchAll(/\b([A-Z]{2,}\d{5,6})\b/g)]
    // Exclude COVE itself and known non-ref codes (OOLU, CSGU)
    const exclude = /^(COVE|OOLU|CSGU|LLZC)/i
    for (const m of allCodes) {
      if (!exclude.test(m[1])) { internalRef = m[1]; break }
    }
  }

  // ── 15. Custom Agency (customs broker) ──
  // Supports two broker layouts:
  //   Type 1 (BARQUIN MOLINA): individual name only → "MARCO ANTONIO BARQUIN MOLINA"
  //   Type 2 (PRACTICA ADUANAL): individual name + company name → "PRACTICA ADUANAL, S.C."
  let customAgency = ''
  const agentIdx = Math.max(oneLine.indexOf('AGENTE ADUANAL'), 0)
  if (agentIdx >= 0) {
    const agentText = oneLine.slice(agentIdx, Math.min(agentIdx + 1500, oneLine.length))
    // Collect all candidate agency names
    const candidates = []

    // Pattern A: after "NOMBRE O RAZ SOC:" — capture all names
    const razMatch = agentText.match(
      /NOMBRE\s+O\s+RAZ[.\s]*SOC[.:\s]*\s*([A-Z][A-Z\s,.'&()-]+(?:S\.?\s*C\.?|S\.?\s*A\.?|S\.?\s*DE\s*[CR][LV]|SC|SA|MOLINA|GARC[IÍ]A|L[OÓ]PEZ|HERN[ÁA]NDEZ|MART[IÍ]NEZ|RODR[IÍ]GUEZ|GONZ[ÁA]LEZ|P[ÉE]REZ|ESTRELLA|ADUANAL))\b/i
    )
    if (razMatch) {
      // Split on legal-suffix boundaries to separate individual + company names
      // "ERNESTO GALICIA ESTRELLA PRACTICA ADUANAL, S.C." → individual + company
      const full = razMatch[1]
      // Find legal suffix positions
      const suffixRe = /(?:S\s*\.?\s*C\s*\.?|S\s*\.?\s*A\s*\.?|S\s*\.?\s*DE\s+R\s*\.?\s*L\s*\.?|S\.?\s*A\.?\s*DE\s*C\.?\s*V\.?|S\.?\s*C\.?|INC\.?|LLC|LTD\.?|CORP\.?|B\.?\s*V\.?|GMBH)\b/gi
      let lastIdx = 0
      let match
      while ((match = suffixRe.exec(full)) !== null) {
        // Company name: text from lastIdx to match end, trimming leading spaces
        const company = full.slice(lastIdx, match.index + match[0].length).replace(/^\s+/, '').trim()
        if (company.length > 5) candidates.push(company)
        lastIdx = match.index + match[0].length
      }
      // If no legal suffix found (Type 1), use the whole name
      if (candidates.length === 0 && full.trim().length > 5) {
        candidates.push(full.trim())
      }
    }

    // Pattern B: line-by-line all-caps proper names (Type 1 fallback)
    const lines = raw.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (/^[A-Z]{2,}(?:\s{2,}[A-Z]{2,}){2,}$/.test(line) &&
          /(?:MOLINA|GARC[IÍ]A|L[OÓ]PEZ|HERN[ÁA]NDEZ|MART[IÍ]NEZ|RODR[IÍ]GUEZ|GONZ[ÁA]LEZ|P[ÉE]REZ|ESTRELLA|ADUANAL)/i.test(line)) {
        candidates.push(clean(line))
      }
      // Company name with legal suffix on its own line
      if (/^[A-Z]{2,}.+?(?:S\.?\s*C\.?|S\.?\s*A\.?)$/.test(line) &&
          line.length > 10 && !line.includes('CERTIFICADO')) {
        candidates.push(clean(line))
      }
    }

    // Prefer company name (has a legal suffix) over individual name
    const legalSuffixTest = /(?:S\s*\.?\s*C\s*\.?\s*$|S\s*\.?\s*A\s*\.?\s*$|S\s*\.?\s*DE\s+R\s*\.?\s*L\s*\.?\s*$|SC\s*$|SA\s*$|INC\.?\s*$|LLC\s*$|LTD\.?\s*$|B\.?\s*V\.?\s*$|GMBH\s*$)/i
    const companyNames = candidates.filter(c => legalSuffixTest.test(c))
    customAgency = companyNames.length > 0 ? companyNames[companyNames.length - 1] : (candidates.length > 0 ? candidates[0] : '')
  }

  // ── 16. Entry date ──
  let entryDate = ''
  const edMatch = oneLine.match(/ENTRADA\s+PAGO[\s\S]{0,80}?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i) ||
    oneLine.match(/(?:FECHA\s+DE\s+ENTRADA|FECHA\s+VALIDAC[IÍ]ON)[:\s]*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i)
  if (edMatch) entryDate = edMatch[1]

  // ── 17. Customs office ──
  let customsOffice = ''
  const coMatch = oneLine.match(
    /CLAVE\s+DE\s+LA\s+SECCION\s+ADUANERA\s+DE\s+DESPACHO[:\s]*\d+\s+([^\n]+)/i
  ) || oneLine.match(/ADUANA\s+DE\s+DESPACHO[:\s]*\d+\s+([^\n]+)/i)
  if (coMatch) customsOffice = clean(coMatch[1])

  // ── Operation type ──
  const opType = (oneLine.match(/T\.\s*OPER[:\s]*([A-Z]{2,4})/i) || [])[1] ||
    (oneLine.match(/TIPO\s+OPER[:\s]*([A-Z]{2,4})/i) || [])[1] ||
    (oneLine.match(/REGIMEN[:\s]*([A-Z]{2,4})/i) || [])[1] ||
    'IMP'

  // ── Parse status ──
  const parseStatus = pedimento && (total > 0 || iva > 0) ? 'parsed' : 'review'

  return {
    // ── Backwards compatible ──
    pedimento_number: pedimento,
    importer_rfc: rfc,
    supplier_name: supplierName,
    customs_office: customsOffice,
    operation_type: opType || 'Importación',
    entry_date: entryDate,
    customs_value: total,
    iva_amount: iva,        // 税额 = standalone IVA (import VAT), same logic as XML invoice tax amount
    tariff_amount: igi,     // IGI (关税)
    file_name: fileName,
    raw_text: oneLine,
    parse_status: parseStatus,

    // ── Enhanced fields (关单字段整理.xlsx mapping) ──
    fecha_de_pago: fechaPago,
    period: period,
    id_fiscal: idFiscal,
    domicilio: domicilio.slice(0, 500),
    pais: pais,
    dta: dta,               // DTA (海关手续费)
    iva_prv: ivaPrv,        // IVA/PRV
    igi: igi,                // IGI (关税, same as tariff_amount)
    prv: prv,                // PRV
    custom_agency: customAgency,
    internal_ref: internalRef,
  }
}

// ─── Public API ───
export async function extractPdfText(file, onProgress = null) {
  const pdfjs = await loadPdfJs()
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buffer }).promise
  const pages = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    pages.push(content.items.map(item => item.str).join(' '))
    if (onProgress) onProgress(pageNumber, pdf.numPages)
  }
  return pages.join('\n')
}

export async function parsePedimentoPDF(file, onProgress = null) {
  const text = await extractPdfText(file, onProgress)
  return parseFields(text, file.name)
}

export function formatPedimentoMoney(value) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}