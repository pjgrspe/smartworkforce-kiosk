/**
 * Time Engine
 * Calculates worked hours, late, undertime, overtime, and night diff
 * per employee per calendar day within a cutoff period.
 */

const AttendanceLog = require('../models/AttendanceLog');
const Schedule      = require('../models/Schedule');
const Employee      = require('../models/Employee');
const Holiday       = require('../models/Holiday');

/** Parse "HH:mm" string → minutes from midnight */
function timeStrToMinutes(str) {
  if (!str) return null;
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

/** Date → "YYYY-MM-DD" in Manila timezone */
function toManilaDateStr(date) {
  return new Date(date).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/** Date → minutes from midnight in Manila timezone */
function toManilaMinutes(date) {
  const str = new Date(date).toLocaleTimeString('en-US', {
    timeZone: 'Asia/Manila',
    hour12:   false,
    hour:     '2-digit',
    minute:   '2-digit'
  });
  const [h, m] = str.replace(/^24/, '00').split(':').map(Number);
  return h * 60 + m;
}

/**
 * Calculate the overlap of a worked window with the night diff window.
 * Night diff window typically wraps midnight (e.g. 22:00–06:00).
 */
function calcNightDiffMinutes(actualInMin, actualOutMin, ndStart, ndEnd) {
  function overlap(aS, aE, bS, bE) {
    return Math.max(0, Math.min(aE, bE) - Math.max(aS, bS));
  }
  let total = 0;
  if (ndStart > ndEnd) {
    // Wraps midnight: [ndStart..1440] ∪ [0..ndEnd]
    if (actualOutMin >= actualInMin) {
      // Shift does NOT cross midnight
      total += overlap(actualInMin, actualOutMin, ndStart, 1440);
      total += overlap(actualInMin, actualOutMin, 0, ndEnd);
    } else {
      // Shift crosses midnight
      total += overlap(actualInMin, 1440, ndStart, 1440);
      total += overlap(0, actualOutMin, 0, ndEnd);
    }
  } else {
    total += overlap(actualInMin, actualOutMin, ndStart, ndEnd);
  }
  return total;
}

/**
 * Compute time summary for one employee over a date range.
 * Returns per-day breakdown + aggregate totals.
 *
 * @param {string}  employeeId
 * @param {Date}    cutoffStart
 * @param {Date}    cutoffEnd
 * @param {object}  tenantSettings  – from Tenant.settings
 */
async function computeEmployeeTime(employeeId, cutoffStart, cutoffEnd, tenantSettings = {}) {
  const employee = await Employee.findById(employeeId).lean();
  if (!employee) throw new Error(`Employee ${employeeId} not found`);

  // Fetch attendance logs (add one extra day buffer)
  const endBuffer = new Date(new Date(cutoffEnd).getTime() + 86_400_000);
  const logs = await AttendanceLog.find({
    employeeId,
    timestamp: { $gte: new Date(cutoffStart), $lte: endBuffer }
  }).sort('timestamp').lean();

  // Fetch holidays
  const holidays = await Holiday.find({
    tenantId: employee.tenantId,
    date: { $gte: new Date(cutoffStart), $lte: new Date(cutoffEnd) }
  }).lean();

  // Resolve schedule (per-employee if set, else tenant defaults)
  let schedule = null;
  if (employee.scheduleId) {
    schedule = await Schedule.findById(employee.scheduleId).lean();
  }
  if (!schedule) {
    schedule = {
      shiftStart:            '08:00',
      shiftEnd:              '17:00',
      breakDurationMinutes:  60,
      isPaidBreak:           false,
      gracePeriodMinutes:    tenantSettings.gracePeriodMinutes    || 5,
      roundingRuleMinutes:   tenantSettings.roundingRuleMinutes   || 0,
      restDays:              [0] // Sunday
    };
  }

  const ndStart = timeStrToMinutes(tenantSettings.nightDiffWindow?.start || '22:00');
  const ndEnd   = timeStrToMinutes(tenantSettings.nightDiffWindow?.end   || '06:00');
  const scheduledStartMin = timeStrToMinutes(schedule.shiftStart) || 480; // 08:00
  const scheduledEndMin   = timeStrToMinutes(schedule.shiftEnd)   || 1020; // 17:00
  const grace             = schedule.gracePeriodMinutes || 5;
  const rounding          = schedule.roundingRuleMinutes || 0;
  const unpaidBreak       = schedule.isPaidBreak ? 0 : (schedule.breakDurationMinutes || 0);
  let scheduledWork       = scheduledEndMin - scheduledStartMin;
  if (scheduledWork < 0) scheduledWork += 1440;
  const scheduledEffective = Math.max(0, scheduledWork - unpaidBreak);
  const shiftCrossesMidnight = scheduledEndMin <= scheduledStartMin;

  // Group logs by Manila date
  const logsByDate = {};
  for (const log of logs) {
    const key = toManilaDateStr(log.timestamp);
    (logsByDate[key] = logsByDate[key] || []).push(log);
  }

  const results = [];
  const start = new Date(cutoffStart);
  const end   = new Date(cutoffEnd);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr   = toManilaDateStr(d);
    const dayOfWeek = new Date(d).getDay(); // 0=Sun … 6=Sat

    const isRestDay   = (schedule.restDays || []).includes(dayOfWeek);
    const holiday     = holidays.find(h => toManilaDateStr(h.date) === dateStr);
    const isHoliday   = !!holiday;
    const holidayType = holiday?.type || null;

    const dayLogs = logsByDate[dateStr] || [];
    const inLog   = dayLogs.find(l => l.type === 'IN');
    let outLog    = [...dayLogs].reverse().find(l => l.type === 'OUT');

    if (!outLog && inLog && shiftCrossesMidnight) {
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDateStr = toManilaDateStr(nextDay);
      outLog = (logsByDate[nextDateStr] || []).find((log) => log.type === 'OUT');
    }

    const isAbsent     = !inLog && !isRestDay;
    const isMissingOut = !!inLog && !outLog;

    let workedMinutes     = 0;
    let lateMinutes       = 0;
    let undertimeMinutes  = 0;
    let overtimeMinutes   = 0;
    let nightDiffMinutes  = 0;

    if (inLog && !isMissingOut) {
      const actualInMin  = toManilaMinutes(inLog.timestamp);
      const actualOutMin = toManilaMinutes(outLog.timestamp);

      // Late
      let late = Math.max(0, actualInMin - (scheduledStartMin + grace));
      if (rounding > 0 && late > 0) {
        late = Math.ceil(late / rounding) * rounding;
      }
      lateMinutes = late;

      // Undertime (only when there is an actual OUT)
      undertimeMinutes = outLog ? Math.max(0, scheduledEndMin - actualOutMin) : 0;

      // Worked (gross out-in minus unpaid break)
      let gross = actualOutMin - actualInMin;
      if (gross < 0) gross += 1440; // midnight crossover
      workedMinutes = Math.max(0, gross - unpaidBreak);

      // Overtime
      overtimeMinutes = Math.max(0, workedMinutes - scheduledEffective);

      // Night diff
      nightDiffMinutes = calcNightDiffMinutes(actualInMin, actualOutMin, ndStart, ndEnd);
    }

    results.push({
      date:            dateStr,
      isRestDay,
      isHoliday,
      holidayType,
      isAbsent,
      isMissingOut,
      workedMinutes,
      lateMinutes,
      undertimeMinutes,
      overtimeMinutes,
      nightDiffMinutes,
      logCount: dayLogs.length
    });
  }

  return {
    employeeId:   employee._id.toString(),
    employeeCode: employee.employeeCode,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    days:          results,
    // Aggregates
    totalWorkedMinutes:    results.reduce((s, d) => s + d.workedMinutes,    0),
    totalLateMinutes:      results.reduce((s, d) => s + d.lateMinutes,      0),
    totalUndertimeMinutes: results.reduce((s, d) => s + d.undertimeMinutes, 0),
    totalOvertimeMinutes:  results.reduce((s, d) => s + d.overtimeMinutes,  0),
    totalNightDiffMinutes: results.reduce((s, d) => s + d.nightDiffMinutes, 0),
    absentDays:         results.filter(d => d.isAbsent).length,
    regularHolidayDays: results.filter(d => d.isHoliday && d.holidayType === 'regular'               && !d.isAbsent).length,
    specialHolidayDays: results.filter(d => d.isHoliday && d.holidayType === 'special_non_working'   && !d.isAbsent).length
  };
}

module.exports = { computeEmployeeTime };
