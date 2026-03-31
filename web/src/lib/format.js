/**
 * Formatting utilities — dates, currency, identifiers.
 * Always use PH locale for production; adjust as needed.
 */

/** "Mar 12, 2026" */
export function fmtDate(date) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

/** "09:42 AM" */
export function fmtTime(date) {
  if (!date) return '—'
  return new Date(date).toLocaleTimeString('en-PH', {
    hour: '2-digit', minute: '2-digit',
  })
}

/** "Mar 12, 2026 09:42 AM" */
export function fmtDateTime(date) {
  if (!date) return '—'
  return new Date(date).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/**
 * "Jan 1 – Jan 15, 2026"
 * Collapses when same month/year.
 */
export function fmtDateRange(start, end) {
  if (!start || !end) return '—'
  const s = new Date(start)
  const e = new Date(end)
  const sStr = s.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  const eStr = e.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${sStr} – ${eStr}`
}

/** "₱12,450.00" */
export function fmtPeso(amount) {
  if (amount == null) return '—'
  const value = Number(amount)
  const formatted = Math.abs(value).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${value < 0 ? '-' : ''}₱${formatted}`
}

/** Short form: "₱12.4K", "₱1.2M" */
export function fmtPesoShort(amount) {
  if (amount == null) return '—'
  const n = Number(amount)
  const sign = n < 0 ? '-' : ''
  if (Math.abs(n) >= 1_000_000) return `${sign}₱${(Math.abs(n) / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000)     return `${sign}₱${(Math.abs(n) / 1_000).toFixed(1)}K`
  return `${sign}₱${Math.abs(n).toFixed(2)}`
}

/**
 * Resolve employee name from a populated or raw-ID field.
 * attendanceLog.employeeId can be an object { firstName, lastName } or a raw string.
 */
export function employeeName(employeeId) {
  if (!employeeId) return '—'
  if (typeof employeeId === 'object') {
    return `${employeeId.firstName ?? ''} ${employeeId.lastName ?? ''}`.trim() || '—'
  }
  return String(employeeId)
}

/** "pending_approval" → "Pending Approval" */
export function humanize(str) {
  if (!str) return '—'
  return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** YYYY-MM-DD → value safe for <input type="date"> */
export function toDateInput(date) {
  if (!date) return ''
  return new Date(date).toISOString().split('T')[0]
}
