/**
 * Attendance Page — logs with date/employee filters + exception badges.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { getAttendance, getEmployees } from '../config/api'
import { fmtDate, fmtTime, employeeName } from '../lib/format'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'

const TYPE_VARIANT = {
  IN:        'IN',
  OUT:       'OUT',
  BREAK_IN:  'warning',
  BREAK_OUT: 'info',
}

const SOURCE_LABEL = {
  face_kiosk:       'Kiosk: Facial',
  web:              'Web',
  admin_correction: 'Correction',
}

const fieldCls = `
  h-8 px-3 text-xs bg-navy-600 border border-navy-500 text-navy-100
  placeholder:text-navy-400/50 focus:outline-none
  focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent/30
  transition-colors duration-80 rounded-md
`

export default function Attendance() {
  const [logs,      setLogs]      = useState([])
  const [employees, setEmployees] = useState([])
  const [loading,   setLoading]   = useState(false)
  const [exporting, setExporting] = useState(false)
  const [filters,   setFilters]   = useState({
    employeeId: '',
    from: new Date().toISOString().slice(0, 10),
    to:   new Date().toISOString().slice(0, 10),
  })
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('timestamp')
  const [sortDir, setSortDir] = useState('desc')
  const PAGE_SIZE = 50
  const FETCH_LIMIT = 5000

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [empRes, logRes] = await Promise.all([
        getEmployees(),
        getAttendance({
          ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
          ...(filters.from ? { start_date: filters.from } : {}),
          ...(filters.to   ? { end_date:   filters.to   } : {}),
          limit: FETCH_LIMIT,
        }),
      ])
      setEmployees(empRes?.data || [])
      setLogs(logRes?.data     || [])
      setPage(1)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { loadData() }, [loadData])

  const sortedLogs = useMemo(() => {
    const safeText = (value) => String(value || '').toLowerCase()
    const safeNum = (value) => (Number.isFinite(Number(value)) ? Number(value) : -1)

    const list = [...logs]
    list.sort((a, b) => {
      let left = 0
      let right = 0

      switch (sortBy) {
        case 'employee':
          left = safeText(employeeName(a.employeeId))
          right = safeText(employeeName(b.employeeId))
          break
        case 'type':
          left = safeText(a.type)
          right = safeText(b.type)
          break
        case 'source':
          left = safeText(SOURCE_LABEL[a.source] ?? a.source)
          right = safeText(SOURCE_LABEL[b.source] ?? b.source)
          break
        case 'confidence':
          left = safeNum(a.confidenceScore)
          right = safeNum(b.confidenceScore)
          break
        case 'timestamp':
        default:
          left = new Date(a.timestamp).getTime()
          right = new Date(b.timestamp).getTime()
          break
      }

      let comparison = 0
      if (typeof left === 'string' || typeof right === 'string') {
        comparison = String(left).localeCompare(String(right))
      } else {
        comparison = Number(left) - Number(right)
      }

      if (comparison !== 0) {
        return sortDir === 'asc' ? comparison : -comparison
      }

      // Stable fallback: always keep deterministic newest-first by timestamp when values tie
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    })

    return list
  }, [logs, sortBy, sortDir])

  useEffect(() => {
    setPage(1)
  }, [sortBy, sortDir])

  const paginated  = sortedLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.ceil(sortedLogs.length / PAGE_SIZE)

  const buildExcelFileName = () => {
    const from = filters.from || 'start'
    const to = filters.to || 'end'
    const selected = employees.find((employee) => employee._id === filters.employeeId)
    const employeeTag = selected
      ? `${selected.firstName || ''}-${selected.lastName || ''}`.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
      : 'all-employees'
    return `attendance-report-${from}-to-${to}-${employeeTag}.xlsx`
  }

  const handleExportExcel = async () => {
    if (!sortedLogs.length || exporting) return

    setExporting(true)
    try {
      const XLSXModule = await import('xlsx-js-style')
      const XLSX = XLSXModule.default || XLSXModule

      const exportLogs = [...sortedLogs].sort((a, b) => {
        const employeeA = employeeName(a.employeeId).toLowerCase()
        const employeeB = employeeName(b.employeeId).toLowerCase()
        if (employeeA !== employeeB) return employeeA.localeCompare(employeeB)
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      })

      const rows = exportLogs.map((log) => {
        const exception = log.exceptions || {}
        return {
          Employee: employeeName(log.employeeId),
          Date: fmtDate(log.timestamp),
          Time: fmtTime(log.timestamp),
          Type: log.type || '',
          Source: SOURCE_LABEL[log.source] ?? log.source ?? '',
          Confidence: log.confidenceScore != null ? `${(log.confidenceScore * 100).toFixed(0)}%` : '',
          'Late Min': exception.lateMinutes || 0,
          'Undertime Min': exception.undertimeMinutes || 0,
          'OT Min': exception.overtimeMinutes || 0,
          'Missing Out': exception.isMissingOut ? 'Yes' : 'No',
          Synced: log.synced ? 'Yes' : 'No',
          Notes: log.notes || '',
        }
      })

      const workbook = XLSX.utils.book_new()
      const headerRows = [
        ['Attendance Report'],
        [`Period: ${filters.from || 'N/A'} to ${filters.to || 'N/A'}`],
        [`Employee Filter: ${filters.employeeId ? (employees.find((employee) => employee._id === filters.employeeId) ? `${employees.find((employee) => employee._id === filters.employeeId).firstName} ${employees.find((employee) => employee._id === filters.employeeId).lastName}` : 'Selected employee') : 'All employees'}`],
        [`Records: ${rows.length}`],
        [],
      ]

      const worksheet = XLSX.utils.aoa_to_sheet(headerRows)
      XLSX.utils.sheet_add_json(worksheet, rows, { origin: 'A6', skipHeader: false })

      worksheet['!cols'] = [
        { wch: 24 }, // Employee
        { wch: 13 }, // Date
        { wch: 10 }, // Time
        { wch: 10 }, // Type
        { wch: 16 }, // Source
        { wch: 11 }, // Confidence
        { wch: 10 }, // Late
        { wch: 13 }, // Undertime
        { wch: 9 },  // OT
        { wch: 12 }, // Missing out
        { wch: 8 },  // Synced
        { wch: 30 }, // Notes
      ]

      worksheet['!merges'] = [
        XLSX.utils.decode_range('A1:F1'),
      ]

      const headerRowIndex = 6
      const lastDataRow = headerRowIndex + rows.length
      worksheet['!autofilter'] = { ref: `A${headerRowIndex}:L${Math.max(headerRowIndex, lastDataRow)}` }
      worksheet['!freeze'] = { xSplit: 0, ySplit: headerRowIndex, topLeftCell: `A${headerRowIndex + 1}`, activePane: 'bottomLeft', state: 'frozen' }

      const baseBorder = {
        top: { style: 'thin', color: { rgb: 'D1D8E0' } },
        bottom: { style: 'thin', color: { rgb: 'D1D8E0' } },
        left: { style: 'thin', color: { rgb: 'D1D8E0' } },
        right: { style: 'thin', color: { rgb: 'D1D8E0' } },
      }

      const styleCell = (cellRef, style) => {
        if (!worksheet[cellRef]) return
        worksheet[cellRef].s = {
          ...(worksheet[cellRef].s || {}),
          ...style,
        }
      }

      styleCell('A1', {
        font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1E4C85' } },
        alignment: { horizontal: 'left', vertical: 'center' },
      })

      for (let r = 2; r <= 4; r += 1) {
        styleCell(`A${r}`, {
          font: { bold: r === 4, color: { rgb: '334E68' } },
          alignment: { horizontal: 'left', vertical: 'center' },
        })
      }

      for (let c = 0; c < 12; c += 1) {
        const ref = XLSX.utils.encode_cell({ c, r: headerRowIndex - 1 })
        styleCell(ref, {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '274E7A' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: baseBorder,
        })
      }

      let lastEmployee = ''
      for (let row = headerRowIndex + 1; row <= lastDataRow; row += 1) {
        const employeeRef = `A${row}`
        const employeeValue = worksheet[employeeRef]?.v || ''
        const isNewEmployee = employeeValue !== lastEmployee
        lastEmployee = employeeValue

        for (let c = 0; c < 12; c += 1) {
          const ref = XLSX.utils.encode_cell({ c, r: row - 1 })
          const numericCols = [6, 7, 8]
          styleCell(ref, {
            fill: { fgColor: { rgb: isNewEmployee ? 'EEF3FA' : (row % 2 === 0 ? 'FFFFFF' : 'F8FAFD') } },
            alignment: {
              horizontal: numericCols.includes(c) ? 'right' : c === 5 ? 'center' : 'left',
              vertical: 'center',
              wrapText: c === 11,
            },
            border: {
              ...baseBorder,
              top: {
                style: isNewEmployee ? 'medium' : 'thin',
                color: { rgb: isNewEmployee ? '9EB6CE' : 'D1D8E0' },
              },
            },
            font: c === 0 && isNewEmployee
              ? { bold: true, color: { rgb: '12344D' } }
              : { color: { rgb: '334E68' } },
          })
          if (numericCols.includes(c)) {
            styleCell(ref, { numFmt: '0' })
          }
        }
      }

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Logs')
      XLSX.writeFile(workbook, buildExcelFileName())
    } catch (error) {
      console.error('Attendance export failed:', error)
      window.alert(error.message || 'Failed to export attendance report')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-3.5
                      border-b border-navy-500 bg-navy-800">
        <h1 className="text-xs font-semibold text-navy-100 uppercase tracking-wider">
          Attendance Logs
        </h1>
        <span className="label-caps font-mono tabular">{sortedLogs.length} records</span>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-end gap-3 px-6 py-3
                      border-b border-navy-500/50 bg-navy-800">
        <div className="flex flex-col gap-1">
          <label className="label-caps">From</label>
          <input type="date" className={fieldCls}
            value={filters.from}
            onChange={e => setFilters(p => ({ ...p, from: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="label-caps">To</label>
          <input type="date" className={fieldCls}
            value={filters.to}
            onChange={e => setFilters(p => ({ ...p, to: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="label-caps">Employee</label>
          <select className={fieldCls}
            value={filters.employeeId}
            onChange={e => setFilters(p => ({ ...p, employeeId: e.target.value }))}>
            <option value="">All employees</option>
            {employees.map(e => (
              <option key={e._id} value={e._id}>
                {e.firstName} {e.lastName}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="label-caps">Sort By</label>
          <select
            className={fieldCls}
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
          >
            <option value="timestamp">Date & Time</option>
            <option value="employee">Employee</option>
            <option value="type">Type</option>
            <option value="source">Source</option>
            <option value="confidence">Confidence</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="label-caps">Order</label>
          <select
            className={fieldCls}
            value={sortDir}
            onChange={e => setSortDir(e.target.value)}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
        <div className="ml-auto">
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={loading || exporting || sortedLogs.length === 0}
            className="px-4 h-8 text-xs font-medium bg-[rgb(var(--c-signal-success))] text-white rounded-md hover:bg-[rgb(var(--c-signal-success)/0.86)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {exporting ? 'Exporting...' : 'Export Excel'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            <div className="table-shell">
              <table className="table-base">
                <thead className="sticky top-0 z-10">
                  <tr className="table-head-row">
                  {['Employee', 'Date', 'Time', 'Type', 'Source', 'Confidence', 'Exceptions'].map(h => (
                    <th key={h} className="table-th">{h}</th>
                  ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="table-empty">
                        No logs found for the selected range.
                      </td>
                    </tr>
                  ) : paginated.map((log, i) => {
                    const ex = log.exceptions || {}
                    return (
                      <tr key={log._id}
                          className={`table-row ${i % 2 !== 0 ? 'table-row-alt' : ''}`}>
                      <td className="px-4 py-2.5 font-medium text-navy-100">
                        {employeeName(log.employeeId)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-navy-300 tabular">
                        {fmtDate(log.timestamp)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-navy-300 tabular">
                        {fmtTime(log.timestamp)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={TYPE_VARIANT[log.type] ?? 'neutral'}>{log.type}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-navy-300">
                        {SOURCE_LABEL[log.source] ?? log.source ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular text-navy-300">
                        {log.confidenceScore != null
                          ? `${(log.confidenceScore * 100).toFixed(0)}%`
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1 flex-wrap">
                          {ex.isLate              && <Badge variant="warning">Late {ex.lateMinutes}m</Badge>}
                          {ex.isEarlyOut          && <Badge variant="warning">Early {ex.undertimeMinutes}m</Badge>}
                          {ex.isMissingOut        && <Badge variant="danger">Missing OUT</Badge>}
                          {ex.isOvertimeCandidate && <Badge variant="info">OT {ex.overtimeMinutes}m</Badge>}
                        </div>
                      </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 py-4 border-t border-navy-500/30">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="px-3 h-7 text-xs border border-navy-500 text-navy-200
                             hover:bg-navy-700 disabled:opacity-30 transition-colors rounded-md">
                  ← Prev
                </button>
                <span className="text-2xs text-navy-400 font-mono tabular">
                  {page} / {totalPages}
                </span>
                <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                  className="px-3 h-7 text-xs border border-navy-500 text-navy-200
                             hover:bg-navy-700 disabled:opacity-30 transition-colors rounded-md">
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}



