/**
 * Mexico Pedimento PDF parser.
 *
 * PDF.js is loaded on demand from CDN so the application does not need
 * another npm dependency. The parser extracts text first, then applies
 * tolerant rules for common SAT/customs formats. Every parsed field should
 * be reviewed before saving because customs brokers may use different layouts.
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

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) return cleanText(match[1])
  }
  return ''
}

function numberValue(value) {
  if (!value) return 0
  const normalized = String(value).replace(/[$,\s]/g, '').replace(/\.(?=.*\.)/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseFields(text, fileName) {
  const normalized = text.replace(/\r/g, '\n')
  const oneLine = cleanText(text)
  const pedimentoNumber = firstMatch(normalized, [
    /(?:N[uú]mero\s+de\s+pedimento|No\.?\s*Pedimento|Pedimento)\s*[:#-]?\s*([0-9]{2}\s+[0-9]{2}\s+[0-9]{4}\s+[0-9]{7})/i,
    /\b([0-9]{2}\s[0-9]{2}\s[0-9]{4}\s[0-9]{7})\b/
  ]).replace(/\s+/g, ' ')

  const rfc = firstMatch(normalized, [
    /(?:RFC|R\.F\.C\.)\s*[:#-]?\s*([A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3})/i,
    /\b([A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3})\b/
  ]).toUpperCase()

  const fecha = firstMatch(normalized, [
    /(?:Fecha\s+de\s+entrada|Fecha\s+de\s+validaci[oó]n|Fecha)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i
  ])

  const tipoOperacion = firstMatch(normalized, [
    /(?:Tipo\s+de\s+operaci[oó]n|Operaci[oó]n)\s*[:#-]?\s*([^\n]+)/i
  ])

  const aduana = firstMatch(normalized, [
    /(?:Aduana\s+de\s+despacho|Aduana)\s*[:#-]?\s*([^\n]+)/i
  ])

  const proveedor = firstMatch(normalized, [
    /(?:Proveedor|Exportador|Vendedor)\s*[:#-]?\s*([^\n]+)/i
  ])

  const invoice = firstMatch(normalized, [
    /(?:Factura|Invoice|No\.?\s*Factura)\s*[:#-]?\s*([^\n]+)/i
  ])

  const total = numberValue(firstMatch(normalized, [
    /(?:Valor\s+en\s+aduana|Valor\s+comercial|Total\s+pedimento|Total)\s*[:$]?\s*([\d,]+(?:\.\d{2})?)/i
  ]))

  const iva = numberValue(firstMatch(normalized, [
    /(?:IVA|I\.V\.A\.|Impuesto\s+al\s+valor\s+agregado)\s*[:$]?\s*([\d,]+(?:\.\d{2})?)/i
  ]))

  const arancel = numberValue(firstMatch(normalized, [
    /(?:IGI|DTA|Arancel|Impuesto\s+general\s+de\s+importaci[oó]n)\s*[:$]?\s*([\d,]+(?:\.\d{2})?)/i
  ]))

  return {
    pedimento_number: pedimentoNumber,
    importer_rfc: rfc,
    supplier_name: proveedor,
    invoice_number: invoice,
    customs_office: aduana,
    operation_type: tipoOperacion || 'Importación',
    entry_date: fecha,
    customs_value: total,
    iva_amount: iva,
    tariff_amount: arancel,
    file_name: fileName,
    raw_text: oneLine,
    parse_status: pedimentoNumber && (iva || total) ? 'parsed' : 'review'
  }
}

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
