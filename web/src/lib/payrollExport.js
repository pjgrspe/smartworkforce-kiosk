import { fmtDate, fmtDateRange, humanize } from './format'

export const DEFAULT_PAYSLIP_SETTINGS = {
  companyDisplayName: '',
  headerSubtitle: 'Payroll Payslip',
  companyAddressLine: '',
  footerNote: 'This document is system-generated and valid without a physical signature.',
  signatories: {
    preparedByName: 'Payroll Officer',
    preparedByTitle: 'Prepared By',
    reviewedByName: 'HR Manager',
    reviewedByTitle: 'Reviewed By',
    approvedByName: 'Authorized Signatory',
    approvedByTitle: 'Approved By',
    receivedByLabel: 'Received By Employee',
  },
}

function mergeNested(base, value) {
  return {
    ...base,
    ...value,
    signatories: {
      ...base.signatories,
      ...(value?.signatories || {}),
    },
  }
}

export function resolvePayslipSettings(tenant) {
  const configured = mergeNested(DEFAULT_PAYSLIP_SETTINGS, tenant?.settings?.payslip)
  return {
    ...configured,
    companyDisplayName: configured.companyDisplayName || tenant?.name || 'Aquino Bistro Group Payroll',
    companyAddressLine: configured.companyAddressLine || tenant?.address || '',
  }
}

function sanitizeFilePart(value) {
  return String(value || 'export')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function dateTag(value) {
  const date = new Date(value)
  if (!Number.isNaN(date.getTime())) {
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return sanitizeFilePart(value)
}

function runNameParts(run) {
  return {
    start: dateTag(run?.cutoffStart),
    end: dateTag(run?.cutoffEnd),
    branch: sanitizeFilePart(run?.branchId?.name || run?.branchId?.code || 'all-branches'),
    status: sanitizeFilePart(humanize(run?.status || 'draft')),
  }
}

export function buildPayslipPdfFileName(run, payslip) {
  const parts = runNameParts(run)
  const employeeCode = sanitizeFilePart(payslip?.employeeCode || 'employee')
  const employeeName = sanitizeFilePart(payslip?.employeeName || 'unknown-name')
  return `payslip-${employeeCode}-${employeeName}-${parts.start}-to-${parts.end}-${parts.branch}.pdf`
}

export function buildPayslipZipFileName(run) {
  const parts = runNameParts(run)
  return `payslips-batch-${parts.start}-to-${parts.end}-${parts.branch}-${parts.status}.zip`
}

export function buildPayrollExcelFileName(run) {
  const parts = runNameParts(run)
  return `payroll-report-${parts.start}-to-${parts.end}-${parts.branch}-${parts.status}.xlsx`
}

function setCellWidths(sheet, widths) {
  sheet['!cols'] = widths.map((width) => ({ wch: width }))
}

const BORDER_COLOR = 'D9E2EC'
const HEADER_FILL = '1E4C85'
const HEADER_TEXT = 'FFFFFF'
const SUBHEADER_FILL = 'EAF1F8'
const SECTION_FILL = 'D8E7F6'
const TOTAL_FILL = 'DDEFE4'
const EMPHASIS_FILL = 'F7E6C4'
const DANGER_FILL = 'FBE4E6'
const INFO_FILL = 'EEF6FB'

function cellRef(XLSX, colIndex, rowIndex) {
  return XLSX.utils.encode_cell({ c: colIndex, r: rowIndex })
}

function ensureCell(sheet, address) {
  if (!sheet[address]) {
    sheet[address] = { t: 's', v: '' }
  }
  return sheet[address]
}

function normalizeSheetCells(XLSX, sheet) {
  if (!sheet || !sheet['!ref']) return
  const range = XLSX.utils.decode_range(sheet['!ref'])
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
      ensureCell(sheet, cellRef(XLSX, colIndex, rowIndex))
    }
  }
}

function applyStyle(sheet, address, style) {
  const cell = ensureCell(sheet, address)
  cell.s = {
    ...(cell.s || {}),
    ...style,
  }
}

function applyRowStyle(XLSX, sheet, rowIndex, columnCount, style) {
  for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
    applyStyle(sheet, cellRef(XLSX, colIndex, rowIndex), style)
  }
}

function applyColumnFormat(XLSX, sheet, rowStart, rowEnd, columnIndexes, numFmt) {
  for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
    columnIndexes.forEach((colIndex) => {
      applyStyle(sheet, cellRef(XLSX, colIndex, rowIndex), { numFmt })
    })
  }
}

function setRowHeights(sheet, heights) {
  sheet['!rows'] = heights.map((height) => ({ hpt: height }))
}

function setPrintLayout(sheet, options = {}) {
  sheet['!margins'] = {
    left: 0.35,
    right: 0.35,
    top: 0.5,
    bottom: 0.5,
    header: 0.2,
    footer: 0.2,
  }
  sheet['!pageSetup'] = {
    orientation: options.orientation || 'portrait',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: options.fitToWidth ?? 1,
    fitToHeight: options.fitToHeight ?? 0,
    horizontalCentered: !!options.horizontalCentered,
  }
}

function mergeAcross(XLSX, sheet, rowIndex, startCol, endCol) {
  for (let colIndex = startCol; colIndex <= endCol; colIndex += 1) {
    ensureCell(sheet, cellRef(XLSX, colIndex, rowIndex))
  }
  sheet['!merges'] = [
    ...(sheet['!merges'] || []),
    XLSX.utils.encode_range({ s: { c: startCol, r: rowIndex }, e: { c: endCol, r: rowIndex } }),
  ]
}

function styleBannerRow(XLSX, sheet, rowIndex, columnCount, fill = SECTION_FILL, fontColor = '12344D') {
  applyRowStyle(XLSX, sheet, rowIndex, columnCount, {
    font: { bold: true, color: { rgb: fontColor }, sz: 11 },
    fill: { fgColor: { rgb: fill } },
    alignment: { vertical: 'center', horizontal: 'left' },
    border: {
      top: { style: 'thin', color: { rgb: BORDER_COLOR } },
      bottom: { style: 'thin', color: { rgb: BORDER_COLOR } },
      left: { style: 'thin', color: { rgb: BORDER_COLOR } },
      right: { style: 'thin', color: { rgb: BORDER_COLOR } },
    },
  })
}

function getHeaderMap(XLSX, sheet, columnCount) {
  const headers = new Map()
  for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
    const value = sheet[cellRef(XLSX, colIndex, 0)]?.v
    if (value) headers.set(String(value), colIndex)
  }
  return headers
}

function highlightColumnsByHeader(XLSX, sheet, rowCount, columnCount, config) {
  const headers = getHeaderMap(XLSX, sheet, columnCount)
  Object.entries(config).forEach(([header, style]) => {
    const colIndex = headers.get(header)
    if (colIndex === undefined) return
    for (let rowIndex = 1; rowIndex < rowCount; rowIndex += 1) {
      applyStyle(sheet, cellRef(XLSX, colIndex, rowIndex), style)
    }
  })
}

function highlightRowsByHeaderValue(XLSX, sheet, rowCount, columnCount, headerName, values, style) {
  const headers = getHeaderMap(XLSX, sheet, columnCount)
  const colIndex = headers.get(headerName)
  if (colIndex === undefined) return
  for (let rowIndex = 1; rowIndex < rowCount; rowIndex += 1) {
    const value = String(sheet[cellRef(XLSX, colIndex, rowIndex)]?.v || '')
    if (values.includes(value)) {
      applyRowStyle(XLSX, sheet, rowIndex, columnCount, style)
    }
  }
}

function freezeTopRow(sheet) {
  sheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' }
}

function styleTabularSheet(XLSX, sheet, rowCount, columnCount, options = {}) {
  if (rowCount <= 0 || columnCount <= 0) return

  freezeTopRow(sheet)
  setPrintLayout(sheet, {
    orientation: options.orientation || 'landscape',
    fitToWidth: options.fitToWidth ?? 1,
    fitToHeight: options.fitToHeight ?? 0,
  })
  applyRowStyle(XLSX, sheet, 0, columnCount, {
    font: { bold: true, color: { rgb: HEADER_TEXT }, sz: 11 },
    fill: { fgColor: { rgb: HEADER_FILL } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: BORDER_COLOR } },
      bottom: { style: 'thin', color: { rgb: BORDER_COLOR } },
      left: { style: 'thin', color: { rgb: BORDER_COLOR } },
      right: { style: 'thin', color: { rgb: BORDER_COLOR } },
    },
  })

  for (let rowIndex = 1; rowIndex < rowCount; rowIndex += 1) {
    const isAltRow = rowIndex % 2 === 0
    applyRowStyle(XLSX, sheet, rowIndex, columnCount, {
      fill: { fgColor: { rgb: isAltRow ? 'F8FBFD' : 'FFFFFF' } },
      alignment: { vertical: 'center', wrapText: true },
      border: {
        top: { style: 'thin', color: { rgb: BORDER_COLOR } },
        bottom: { style: 'thin', color: { rgb: BORDER_COLOR } },
        left: { style: 'thin', color: { rgb: BORDER_COLOR } },
        right: { style: 'thin', color: { rgb: BORDER_COLOR } },
      },
    })
  }

  if (options.currencyColumns?.length) {
    applyColumnFormat(XLSX, sheet, 1, rowCount - 1, options.currencyColumns, '#,##0.00')
  }
  if (options.decimalColumns?.length) {
    applyColumnFormat(XLSX, sheet, 1, rowCount - 1, options.decimalColumns, '0.00')
  }
  if (options.integerColumns?.length) {
    applyColumnFormat(XLSX, sheet, 1, rowCount - 1, options.integerColumns, '0')
  }

  if (options.highlightColumns) {
    highlightColumnsByHeader(XLSX, sheet, rowCount, columnCount, options.highlightColumns)
  }
  if (options.highlightRowsByHeaderValue) {
    options.highlightRowsByHeaderValue.forEach((entry) => {
      highlightRowsByHeaderValue(XLSX, sheet, rowCount, columnCount, entry.header, entry.values, entry.style)
    })
  }
}

function styleSummarySheet(XLSX, sheet, rowCount) {
  if (rowCount <= 0) return

  setPrintLayout(sheet, { orientation: 'portrait', fitToWidth: 1, fitToHeight: 1 })
  ensureCell(sheet, 'A1')
  ensureCell(sheet, 'B1')
  applyStyle(sheet, 'A1', {
    font: { bold: true, color: { rgb: HEADER_TEXT }, sz: 14 },
    fill: { fgColor: { rgb: HEADER_FILL } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: BORDER_COLOR } },
      bottom: { style: 'thin', color: { rgb: BORDER_COLOR } },
      left: { style: 'thin', color: { rgb: BORDER_COLOR } },
      right: { style: 'thin', color: { rgb: BORDER_COLOR } },
    },
  })
  applyStyle(sheet, 'B1', {
    fill: { fgColor: { rgb: HEADER_FILL } },
    border: {
      top: { style: 'thin', color: { rgb: BORDER_COLOR } },
      bottom: { style: 'thin', color: { rgb: BORDER_COLOR } },
      left: { style: 'thin', color: { rgb: BORDER_COLOR } },
      right: { style: 'thin', color: { rgb: BORDER_COLOR } },
    },
  })

  setRowHeights(sheet, Array.from({ length: rowCount }, (_, index) => {
    if (index === 0) return 26
    return 20
  }))

  const sectionRows = ['Run Overview', 'Signatories', 'Footer & Notes']

  for (let rowIndex = 1; rowIndex < rowCount; rowIndex += 1) {
    const left = cellRef(XLSX, 0, rowIndex)
    const right = cellRef(XLSX, 1, rowIndex)
    const leftValue = sheet[left]?.v

    const baseBorder = {
      top: { style: 'thin', color: { rgb: BORDER_COLOR } },
      bottom: { style: 'thin', color: { rgb: BORDER_COLOR } },
      left: { style: 'thin', color: { rgb: BORDER_COLOR } },
      right: { style: 'thin', color: { rgb: BORDER_COLOR } },
    }

    if (!leftValue && !sheet[right]?.v) {
      continue
    }

    if (sectionRows.includes(String(leftValue || '')) && !sheet[right]?.v) {
      styleBannerRow(XLSX, sheet, rowIndex, 2)
      continue
    }

    const isMetricRow = ['Total Gross', 'Total Deductions', 'Total Net Pay'].includes(String(leftValue || ''))
    const fill = leftValue === 'Total Net Pay'
      ? TOTAL_FILL
      : leftValue === 'Total Deductions'
        ? DANGER_FILL
        : isMetricRow
          ? EMPHASIS_FILL
          : SUBHEADER_FILL
    applyStyle(sheet, left, {
      font: { bold: true, color: { rgb: '334E68' } },
      fill: { fgColor: { rgb: fill } },
      border: baseBorder,
      alignment: { vertical: 'center' },
    })
    applyStyle(sheet, right, {
      font: { bold: isMetricRow, color: { rgb: '102A43' }, sz: isMetricRow ? 12 : 10 },
      fill: { fgColor: { rgb: isMetricRow ? fill : 'FFFFFF' } },
      border: baseBorder,
      alignment: { vertical: 'center', wrapText: true },
    })
  }

  for (let rowIndex = 1; rowIndex < rowCount; rowIndex += 1) {
    const left = cellRef(XLSX, 0, rowIndex)
    const right = cellRef(XLSX, 1, rowIndex)
    if (['Total Gross', 'Total Deductions', 'Total Net Pay'].includes(String(sheet[left]?.v || ''))) {
      applyStyle(sheet, right, { numFmt: '#,##0.00' })
    }
  }
}

function styleEmployeeDetailSheet(XLSX, sheet, rowCount) {
  if (rowCount <= 0) return

  setPrintLayout(sheet, { orientation: 'portrait', fitToWidth: 1, fitToHeight: 1, horizontalCentered: true })
  ensureCell(sheet, 'A1')
  ensureCell(sheet, 'B1')
  applyStyle(sheet, 'A1', {
    font: { bold: true, color: { rgb: HEADER_TEXT }, sz: 14 },
    fill: { fgColor: { rgb: HEADER_FILL } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: BORDER_COLOR } },
      bottom: { style: 'thin', color: { rgb: BORDER_COLOR } },
      left: { style: 'thin', color: { rgb: BORDER_COLOR } },
      right: { style: 'thin', color: { rgb: BORDER_COLOR } },
    },
  })
  applyStyle(sheet, 'B1', {
    fill: { fgColor: { rgb: HEADER_FILL } },
    border: {
      top: { style: 'thin', color: { rgb: BORDER_COLOR } },
      bottom: { style: 'thin', color: { rgb: BORDER_COLOR } },
      left: { style: 'thin', color: { rgb: BORDER_COLOR } },
      right: { style: 'thin', color: { rgb: BORDER_COLOR } },
    },
  })

  setRowHeights(sheet, Array.from({ length: rowCount }, (_, index) => {
    if (index === 0) return 28
    if ([9, 17, 27, 37].includes(index)) return 22
    return 20
  }))

  const currencyLabels = [
    'Basic Pay', 'Overtime Pay', 'Holiday Pay', 'Night Differential Pay', 'Allowances', 'Gross Pay',
    'Late Deduction', 'Undertime Deduction', 'SSS Contribution', 'PhilHealth Contribution', 'Pag-IBIG Contribution',
    'Withholding Tax', 'Other Deductions', 'Total Deductions', 'Net Pay',
  ]
  const decimalLabels = ['Regular Hours', 'Overtime Hours', 'Night Diff Hours']
  const integerLabels = ['Late Minutes', 'Undertime Minutes', 'Absent Days']
  const sectionLabels = ['Earnings', 'Deductions', 'Attendance', 'Sign-Off']

  for (let rowIndex = 2; rowIndex < rowCount; rowIndex += 1) {
    const left = cellRef(XLSX, 0, rowIndex)
    const right = cellRef(XLSX, 1, rowIndex)
    const label = String(sheet[left]?.v || '')
    const isSection = sectionLabels.includes(label)
    const isNet = label === 'Net Pay'
    const isDeductionTotal = label === 'Total Deductions'
    const isMeta = ['Employee Name', 'Employee Code', 'Payroll Period', 'Branch', 'Run Status', 'Generated At'].includes(label)
    const fill = isNet ? TOTAL_FILL : isDeductionTotal ? DANGER_FILL : isSection ? SECTION_FILL : isMeta ? INFO_FILL : 'FFFFFF'

    if (isSection && !sheet[right]?.v) {
      styleBannerRow(XLSX, sheet, rowIndex, 2, SECTION_FILL)
      continue
    }

    applyStyle(sheet, left, {
      font: { bold: true, color: { rgb: isSection ? '12344D' : '334E68' } },
      fill: { fgColor: { rgb: fill } },
      border: {
        top: { style: 'thin', color: { rgb: BORDER_COLOR } },
        bottom: { style: 'thin', color: { rgb: BORDER_COLOR } },
        left: { style: 'thin', color: { rgb: BORDER_COLOR } },
        right: { style: 'thin', color: { rgb: BORDER_COLOR } },
      },
    })
    applyStyle(sheet, right, {
      font: { bold: isSection || isNet || isDeductionTotal, color: { rgb: '102A43' }, sz: isNet ? 12 : 10 },
      fill: { fgColor: { rgb: fill } },
      border: {
        top: { style: 'thin', color: { rgb: BORDER_COLOR } },
        bottom: { style: 'thin', color: { rgb: BORDER_COLOR } },
        left: { style: 'thin', color: { rgb: BORDER_COLOR } },
        right: { style: 'thin', color: { rgb: BORDER_COLOR } },
      },
      alignment: { vertical: 'center', wrapText: true, horizontal: isNet ? 'right' : 'left' },
    })

    if (currencyLabels.includes(label)) {
      applyStyle(sheet, right, { numFmt: '#,##0.00' })
    }
    if (decimalLabels.includes(label)) {
      applyStyle(sheet, right, { numFmt: '0.00' })
    }
    if (integerLabels.includes(label)) {
      applyStyle(sheet, right, { numFmt: '0' })
    }
  }
}

function uniqueSheetName(rawName, usedNames) {
  const base = String(rawName || 'Sheet')
    .replace(/[\\/?*\[\]:]/g, ' ')
    .trim()
    .slice(0, 31) || 'Sheet'

  let name = base
  let suffix = 1
  while (usedNames.has(name)) {
    const token = `-${suffix}`
    name = `${base.slice(0, Math.max(1, 31 - token.length))}${token}`
    suffix += 1
  }
  usedNames.add(name)
  return name
}

function addAutoFilter(sheet, lastColumn, rowCount) {
  if (!sheet || rowCount < 2) return
  sheet['!autofilter'] = { ref: `A1:${lastColumn}${rowCount}` }
}

function fmtCurrencyDoc(amount) {
  const value = Number(amount || 0)
  const sign = value < 0 ? '-' : ''
  return `${sign}PHP ${Math.abs(value).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function drawLabelValue(doc, label, value, x, y, width) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(113, 130, 154)
  doc.text(label.toUpperCase(), x, y)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(24, 33, 48)
  doc.text(String(value || '—'), x, y + 14, { maxWidth: width })
}

function drawMoneyTable(doc, title, rows, x, y, width) {
  const rowHeight = 18
  const endX = x + width

  doc.setFillColor(238, 243, 250)
  doc.roundedRect(x, y, width, 28, 6, 6, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(34, 47, 66)
  doc.text(title, x + 14, y + 18)

  let cursorY = y + 42
  rows.forEach((row) => {
    doc.setDrawColor(225, 231, 239)
    doc.line(x, cursorY + 8, endX, cursorY + 8)
    doc.setFont('helvetica', row.emphasize ? 'bold' : 'normal')
    doc.setFontSize(9)
    doc.setTextColor(61, 76, 97)
    doc.text(row.label, x + 14, cursorY)
    doc.text(String(row.value), endX - 14, cursorY, { align: 'right' })
    cursorY += rowHeight
  })

  return cursorY
}

export async function exportPayslipPdf(run, payslip, tenant, options = {}) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const settings = resolvePayslipSettings(tenant)
  const branchLabel = run?.branchId?.name || run?.branchId?.code || 'All branches'
  const employeeName = payslip.employeeName || payslip.employeeCode || 'Employee'
  const fileName = buildPayslipPdfFileName(run, payslip)

  const pageWidth = doc.internal.pageSize.getWidth()
  const left = 42
  const right = pageWidth - 42
  const contentWidth = right - left

  doc.setFillColor(248, 250, 252)
  doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), 'F')
  doc.setFillColor(28, 64, 133)
  doc.rect(0, 0, pageWidth, 96, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(settings.companyDisplayName, left, 42)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(settings.headerSubtitle, left, 60)
  if (settings.companyAddressLine) {
    doc.text(settings.companyAddressLine, left, 76)
  }

  doc.setDrawColor(219, 227, 238)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(left, 112, contentWidth, 102, 10, 10, 'FD')

  drawLabelValue(doc, 'Employee', employeeName, left + 18, 136, 180)
  drawLabelValue(doc, 'Employee Code', payslip.employeeCode || '—', left + 18, 178, 180)
  drawLabelValue(doc, 'Payroll Period', fmtDateRange(run.cutoffStart, run.cutoffEnd), left + 230, 136, 180)
  drawLabelValue(doc, 'Branch', branchLabel, left + 230, 178, 180)
  drawLabelValue(doc, 'Status', humanize(run.status), right - 120, 136, 100)
  drawLabelValue(doc, 'Generated', fmtDate(new Date()), right - 120, 178, 100)

  const earningsBottom = drawMoneyTable(doc, 'Earnings', [
    { label: 'Basic Pay', value: fmtCurrencyDoc(payslip.basicPay) },
    { label: 'Overtime Pay', value: fmtCurrencyDoc(payslip.overtimePay) },
    { label: 'Holiday Pay', value: fmtCurrencyDoc(payslip.holidayPay) },
    { label: 'Night Differential', value: fmtCurrencyDoc(payslip.nightDiffPay) },
    { label: 'Allowances', value: fmtCurrencyDoc(payslip.allowances) },
    { label: 'Gross Pay', value: fmtCurrencyDoc(payslip.grossPay), emphasize: true },
  ], left, 236, contentWidth / 2 - 10)

  const deductionsBottom = drawMoneyTable(doc, 'Deductions', [
    { label: 'Late Deduction', value: fmtCurrencyDoc(payslip.lateDeduction) },
    { label: 'Undertime Deduction', value: fmtCurrencyDoc(payslip.undertimeDeduction) },
    { label: 'SSS', value: fmtCurrencyDoc(payslip.sssContribution) },
    { label: 'PhilHealth', value: fmtCurrencyDoc(payslip.philHealthContribution) },
    { label: 'Pag-IBIG', value: fmtCurrencyDoc(payslip.pagIbigContribution) },
    { label: 'Withholding Tax', value: fmtCurrencyDoc(payslip.withholdingTax) },
    { label: 'Other Deductions', value: fmtCurrencyDoc(payslip.otherDeductions) },
    { label: 'Total Deductions', value: fmtCurrencyDoc(payslip.totalDeductions), emphasize: true },
  ], left + contentWidth / 2 + 10, 236, contentWidth / 2 - 10)

  const metricsY = Math.max(earningsBottom, deductionsBottom) + 18
  doc.setFillColor(14, 116, 144)
  doc.roundedRect(left, metricsY, contentWidth, 68, 10, 10, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Attendance Metrics', left + 18, metricsY + 20)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const metrics = [
    ['Regular Hours', Number(payslip.regularHours || 0).toFixed(2)],
    ['Overtime Hours', Number(payslip.overtimeHours || 0).toFixed(2)],
    ['Night Diff Hours', Number(payslip.nightDiffHours || 0).toFixed(2)],
    ['Late Minutes', payslip.lateMinutes || 0],
    ['Undertime Minutes', payslip.undertimeMinutes || 0],
    ['Absent Days', payslip.absentDays || 0],
  ]
  metrics.forEach(([label, value], index) => {
    const column = index % 3
    const row = Math.floor(index / 3)
    const cellX = left + 18 + (column * 170)
    const cellY = metricsY + 40 + (row * 18)
    doc.text(`${label}: ${value}`, cellX, cellY)
  })

  const netY = metricsY + 92
  doc.setDrawColor(209, 215, 225)
  doc.roundedRect(left, netY, contentWidth, 70, 10, 10)
  doc.setTextColor(34, 47, 66)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Net Pay', left + 18, netY + 28)
  const netPayText = fmtCurrencyDoc(payslip.netPay)
  let netFontSize = 24
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(netFontSize)
  while (doc.getTextWidth(netPayText) > (contentWidth - 48) && netFontSize > 16) {
    netFontSize -= 1
    doc.setFontSize(netFontSize)
  }
  doc.text(netPayText, right - 18, netY + 42, { align: 'right' })

  const sigY = netY + 116
  const signatures = [
    [settings.signatories.preparedByName, settings.signatories.preparedByTitle],
    [settings.signatories.reviewedByName, settings.signatories.reviewedByTitle],
    [settings.signatories.approvedByName, settings.signatories.approvedByTitle],
    [employeeName, settings.signatories.receivedByLabel],
  ]

  signatures.forEach(([name, title], index) => {
    const sectionWidth = 118
    const x = left + (index * 130)
    doc.setDrawColor(123, 137, 159)
    doc.line(x, sigY, x + sectionWidth, sigY)
    doc.setTextColor(34, 47, 66)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(name || '—', x + sectionWidth / 2, sigY + 14, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(title || '—', x + sectionWidth / 2, sigY + 28, { align: 'center' })
  })

  doc.setTextColor(113, 130, 154)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(settings.footerNote, left, 790, { maxWidth: contentWidth })

  if (options.returnBlob) {
    return {
      fileName,
      blob: doc.output('blob'),
    }
  }

  doc.save(fileName)
  return { fileName }
}

export async function exportRunExcel(run, tenant) {
  const XLSXModule = await import('xlsx-js-style')
  const XLSX = XLSXModule.default || XLSXModule
  const settings = resolvePayslipSettings(tenant)
  const branchLabel = run?.branchId?.name || run?.branchId?.code || 'All branches'
  const items = run.payslipItems || []
  const generatedAt = fmtDate(new Date())
  const workbook = XLSX.utils.book_new()
  const usedSheetNames = new Set()

  const summaryRows = [
    ['Payroll Run Report'],
    [],
    ['Run Overview'],
    ['Company', settings.companyDisplayName],
    ['Document', settings.headerSubtitle],
    ['Address', settings.companyAddressLine || '—'],
    [],
    ['Cutoff Start', fmtDate(run.cutoffStart)],
    ['Cutoff End', fmtDate(run.cutoffEnd)],
    ['Payroll Period', fmtDateRange(run.cutoffStart, run.cutoffEnd)],
    ['Branch', branchLabel],
    ['Status', humanize(run.status)],
    ['Employee Count', items.length],
    ['Total Gross', Number(run.totalGross || 0)],
    ['Total Deductions', Number(run.totalDeductions || 0)],
    ['Total Net Pay', Number(run.totalNet || 0)],
    ['Generated At', generatedAt],
    ['Notes', run.notes || ''],
    [],
    ['Signatories'],
    ['Prepared By', settings.signatories.preparedByName],
    ['Prepared By Title', settings.signatories.preparedByTitle],
    ['Reviewed By', settings.signatories.reviewedByName],
    ['Reviewed By Title', settings.signatories.reviewedByTitle],
    ['Approved By', settings.signatories.approvedByName],
    ['Approved By Title', settings.signatories.approvedByTitle],
    ['Receipt Label', settings.signatories.receivedByLabel],
    [],
    ['Footer & Notes'],
    ['Footer Note', settings.footerNote],
  ]
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
  setCellWidths(summarySheet, [24, 48])
  styleSummarySheet(XLSX, summarySheet, summaryRows.length)
  normalizeSheetCells(XLSX, summarySheet)

  const registerRows = items.map((item) => ({
    'Employee Code': item.employeeCode || '',
    'Employee Name': item.employeeName || '',
    'Regular Hours': Number(item.regularHours || 0),
    'OT Hours': Number(item.overtimeHours || 0),
    'ND Hours': Number(item.nightDiffHours || 0),
    'Late Min': Number(item.lateMinutes || 0),
    'Undertime Min': Number(item.undertimeMinutes || 0),
    'Absent Days': Number(item.absentDays || 0),
    'Gross Pay': Number(item.grossPay || 0),
    'Total Deductions': Number(item.totalDeductions || 0),
    'Net Pay': Number(item.netPay || 0),
    'Status': item.error ? 'With Error' : 'Computed',
    'Error': item.error || '',
  }))
  const registerSheet = XLSX.utils.json_to_sheet(registerRows)
  setCellWidths(registerSheet, [14, 26, 12, 10, 10, 10, 12, 10, 14, 16, 14, 14, 32])
  addAutoFilter(registerSheet, 'M', registerRows.length + 1)
  styleTabularSheet(XLSX, registerSheet, registerRows.length + 1, 13, {
    decimalColumns: [2, 3, 4],
    integerColumns: [5, 6, 7],
    currencyColumns: [8, 9, 10],
    highlightColumns: {
      'Gross Pay': { font: { bold: true, color: { rgb: '102A43' } }, fill: { fgColor: { rgb: EMPHASIS_FILL } } },
      'Total Deductions': { font: { bold: true, color: { rgb: '8A1C1C' } }, fill: { fgColor: { rgb: DANGER_FILL } } },
      'Net Pay': { font: { bold: true, color: { rgb: '1F5134' } }, fill: { fgColor: { rgb: TOTAL_FILL } } },
    },
  })
  normalizeSheetCells(XLSX, registerSheet)

  const detailedRows = items.map((item) => ({
    'Employee Code': item.employeeCode || '',
    'Employee Name': item.employeeName || '',
    'Run Period': fmtDateRange(run.cutoffStart, run.cutoffEnd),
    'Run Status': humanize(run.status),
    'Branch': branchLabel,
    'Basic Pay': Number(item.basicPay || 0),
    'Overtime Pay': Number(item.overtimePay || 0),
    'Holiday Pay': Number(item.holidayPay || 0),
    'Night Diff Pay': Number(item.nightDiffPay || 0),
    'Allowances': Number(item.allowances || 0),
    'Gross Pay': Number(item.grossPay || 0),
    'Late Deduction': Number(item.lateDeduction || 0),
    'Undertime Deduction': Number(item.undertimeDeduction || 0),
    'SSS': Number(item.sssContribution || 0),
    'PhilHealth': Number(item.philHealthContribution || 0),
    'Pag-IBIG': Number(item.pagIbigContribution || 0),
    'Withholding Tax': Number(item.withholdingTax || 0),
    'Other Deductions': Number(item.otherDeductions || 0),
    'Total Deductions': Number(item.totalDeductions || 0),
    'Net Pay': Number(item.netPay || 0),
    'Regular Hours': Number(item.regularHours || 0),
    'Overtime Hours': Number(item.overtimeHours || 0),
    'Night Diff Hours': Number(item.nightDiffHours || 0),
    'Late Minutes': Number(item.lateMinutes || 0),
    'Undertime Minutes': Number(item.undertimeMinutes || 0),
    'Absent Days': Number(item.absentDays || 0),
    'Prepared By': settings.signatories.preparedByName,
    'Reviewed By': settings.signatories.reviewedByName,
    'Approved By': settings.signatories.approvedByName,
    'Generated At': generatedAt,
    'Error': item.error || '',
  }))
  const detailsSheet = XLSX.utils.json_to_sheet(detailedRows)
  setCellWidths(detailsSheet, [14, 24, 24, 14, 20, 12, 12, 12, 14, 12, 12, 14, 16, 10, 12, 12, 14, 14, 16, 12, 12, 14, 14, 12, 12, 12, 22, 22, 22, 14, 28])
  addAutoFilter(detailsSheet, 'AE', detailedRows.length + 1)
  styleTabularSheet(XLSX, detailsSheet, detailedRows.length + 1, 31, {
    currencyColumns: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    decimalColumns: [20, 21, 22],
    integerColumns: [23, 24, 25],
    highlightColumns: {
      'Gross Pay': { font: { bold: true, color: { rgb: '102A43' } }, fill: { fgColor: { rgb: EMPHASIS_FILL } } },
      'Total Deductions': { font: { bold: true, color: { rgb: '8A1C1C' } }, fill: { fgColor: { rgb: DANGER_FILL } } },
      'Net Pay': { font: { bold: true, color: { rgb: '1F5134' } }, fill: { fgColor: { rgb: TOTAL_FILL } } },
    },
  })
  normalizeSheetCells(XLSX, detailsSheet)

  const ledgerRows = []
  items.forEach((item) => {
    const base = {
      'Employee Code': item.employeeCode || '',
      'Employee Name': item.employeeName || '',
      'Run Period': fmtDateRange(run.cutoffStart, run.cutoffEnd),
      'Run Status': humanize(run.status),
      'Branch': branchLabel,
    }

    ;[
      ['Earning', 'Basic Pay', item.basicPay],
      ['Earning', 'Overtime Pay', item.overtimePay],
      ['Earning', 'Holiday Pay', item.holidayPay],
      ['Earning', 'Night Diff Pay', item.nightDiffPay],
      ['Earning', 'Allowances', item.allowances],
      ['Earning', 'Gross Pay', item.grossPay],
      ['Deduction', 'Late Deduction', item.lateDeduction],
      ['Deduction', 'Undertime Deduction', item.undertimeDeduction],
      ['Deduction', 'SSS Contribution', item.sssContribution],
      ['Deduction', 'PhilHealth Contribution', item.philHealthContribution],
      ['Deduction', 'Pag-IBIG Contribution', item.pagIbigContribution],
      ['Deduction', 'Withholding Tax', item.withholdingTax],
      ['Deduction', 'Other Deductions', item.otherDeductions],
      ['Deduction', 'Total Deductions', item.totalDeductions],
      ['Result', 'Net Pay', item.netPay],
      ['Time', 'Regular Hours', item.regularHours],
      ['Time', 'Overtime Hours', item.overtimeHours],
      ['Time', 'Night Diff Hours', item.nightDiffHours],
      ['Time', 'Late Minutes', item.lateMinutes],
      ['Time', 'Undertime Minutes', item.undertimeMinutes],
      ['Time', 'Absent Days', item.absentDays],
    ].forEach(([category, lineItem, amount]) => {
      ledgerRows.push({
        ...base,
        Category: category,
        'Line Item': lineItem,
        Amount: Number(amount || 0),
        Error: item.error || '',
      })
    })
  })
  const ledgerSheet = XLSX.utils.json_to_sheet(ledgerRows)
  setCellWidths(ledgerSheet, [14, 24, 24, 14, 20, 12, 24, 14, 28])
  addAutoFilter(ledgerSheet, 'I', ledgerRows.length + 1)
  styleTabularSheet(XLSX, ledgerSheet, ledgerRows.length + 1, 9, {
    currencyColumns: [7],
    highlightRowsByHeaderValue: [
      {
        header: 'Line Item',
        values: ['Gross Pay', 'Total Deductions', 'Net Pay'],
        style: {
          font: { bold: true, color: { rgb: '102A43' } },
          fill: { fgColor: { rgb: EMPHASIS_FILL } },
        },
      },
    ],
  })
  normalizeSheetCells(XLSX, ledgerSheet)

  const attendanceRows = items.map((item) => ({
    'Employee Code': item.employeeCode || '',
    'Employee Name': item.employeeName || '',
    'Run Period': fmtDateRange(run.cutoffStart, run.cutoffEnd),
    'Regular Hours': Number(item.regularHours || 0),
    'Overtime Hours': Number(item.overtimeHours || 0),
    'Night Diff Hours': Number(item.nightDiffHours || 0),
    'Late Minutes': Number(item.lateMinutes || 0),
    'Undertime Minutes': Number(item.undertimeMinutes || 0),
    'Absent Days': Number(item.absentDays || 0),
  }))
  const attendanceSheet = XLSX.utils.json_to_sheet(attendanceRows)
  setCellWidths(attendanceSheet, [14, 24, 24, 14, 14, 16, 12, 16, 12])
  addAutoFilter(attendanceSheet, 'I', attendanceRows.length + 1)
  styleTabularSheet(XLSX, attendanceSheet, attendanceRows.length + 1, 9, {
    decimalColumns: [3, 4, 5],
    integerColumns: [6, 7, 8],
  })
  normalizeSheetCells(XLSX, attendanceSheet)

  XLSX.utils.book_append_sheet(workbook, summarySheet, uniqueSheetName('Run Summary', usedSheetNames))
  XLSX.utils.book_append_sheet(workbook, registerSheet, uniqueSheetName('Payroll Register', usedSheetNames))
  XLSX.utils.book_append_sheet(workbook, detailsSheet, uniqueSheetName('Employee Full Data', usedSheetNames))
  XLSX.utils.book_append_sheet(workbook, ledgerSheet, uniqueSheetName('Payroll Ledger', usedSheetNames))
  XLSX.utils.book_append_sheet(workbook, attendanceSheet, uniqueSheetName('Attendance Metrics', usedSheetNames))

  workbook.Props = {
    Title: `Payroll Run ${fmtDateRange(run.cutoffStart, run.cutoffEnd)}`,
    Subject: settings.headerSubtitle,
    Author: settings.companyDisplayName,
    Company: settings.companyDisplayName,
  }

  const fileName = buildPayrollExcelFileName(run)
  XLSX.writeFile(workbook, fileName)
  return { fileName }
}
