/**
 * Time Engine
 * Calculates worked hours, late, undertime, overtime, and night diff
 * per employee per calendar day within a cutoff period.
 */

const { getPool } = require('../config/postgres');
const { getEmployeeDayOffRepository } = require('../repositories/employee-day-off');

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
  const pool = getPool();
  const employeeRes = await pool.query(
    `
      SELECT id, tenant_id, employee_code, first_name, last_name, schedule_id
      FROM employees
      WHERE id = $1
      LIMIT 1
    `,
    [employeeId],
  );

  if (!employeeRes.rowCount) throw new Error(`Employee ${employeeId} not found`);
  const employeeRow = employeeRes.rows[0];
  const employee = {
    _id: employeeRow.id,
    tenantId: employeeRow.tenant_id,
    employeeCode: employeeRow.employee_code,
    firstName: employeeRow.first_name,
    lastName: employeeRow.last_name,
    scheduleId: employeeRow.schedule_id,
  };

  const endBuffer = new Date(new Date(cutoffEnd).getTime() + 86_400_000);
  const logRes = await pool.query(
    `
      SELECT timestamp, type
      FROM attendance_logs
      WHERE employee_id = $1
        AND timestamp >= $2
        AND timestamp <= $3
      ORDER BY timestamp ASC
    `,
    [employeeId, new Date(cutoffStart), endBuffer],
  );
  const logs = logRes.rows;

  const holidayRes = await pool.query(
    `
      SELECT date, type
      FROM holidays
      WHERE tenant_id = $1
        AND date >= $2
        AND date <= $3
    `,
    [employee.tenantId, new Date(cutoffStart), new Date(cutoffEnd)],
  );
  const holidays = holidayRes.rows;

  const dayOffRepo = getEmployeeDayOffRepository();
  const employeeDayOffs = await dayOffRepo.listForRange({
    tenantId:   employee.tenantId,
    employeeId: employee._id,
    startDate:  new Date(cutoffStart),
    endDate:    new Date(cutoffEnd),
  });

  let schedule = null;
  if (employee.scheduleId) {
    const scheduleRes = await pool.query(
      `
        SELECT
          id,
          shift_start,
          shift_end,
          break_duration_minutes,
          is_paid_break,
          grace_period_minutes,
          rounding_rule_minutes,
          rest_days
        FROM schedules
        WHERE id = $1
        LIMIT 1
      `,
      [employee.scheduleId],
    );

    if (scheduleRes.rowCount) {
      const row = scheduleRes.rows[0];
      schedule = {
        _id: row.id,
        shiftStart: row.shift_start,
        shiftEnd: row.shift_end,
        breakDurationMinutes: row.break_duration_minutes,
        isPaidBreak: row.is_paid_break,
        gracePeriodMinutes: row.grace_period_minutes,
        roundingRuleMinutes: row.rounding_rule_minutes,
        restDays: Array.isArray(row.rest_days) ? row.rest_days : [],
      };
    }
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

    const scheduleRestDay = (schedule.restDays || []).includes(dayOfWeek);
    const dayOff          = employeeDayOffs.find(x => x.date === dateStr) || null;
    const isFullDayOff    = dayOff?.type === 'full_day';
    const isRestDay       = scheduleRestDay || isFullDayOff;

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

    // Compute effective schedule boundaries for partial day-offs
    let effectiveStartMin = scheduledStartMin;
    let effectiveEndMin   = scheduledEndMin;
    let effectiveWork     = scheduledEffective;

    if (dayOff && !isFullDayOff) {
      const midpoint = Math.round((scheduledStartMin + scheduledEndMin) / 2);
      if (dayOff.type === 'half_day_am') {
        // Morning off — employee expected from midpoint onwards
        effectiveStartMin = midpoint;
        effectiveWork     = Math.max(0, scheduledEndMin - midpoint - Math.round(unpaidBreak / 2));
      } else if (dayOff.type === 'half_day_pm') {
        // Afternoon off — employee expected to leave at midpoint
        effectiveEndMin = midpoint;
        effectiveWork   = Math.max(0, midpoint - scheduledStartMin - Math.round(unpaidBreak / 2));
      } else if (dayOff.type === 'custom') {
        const offStart   = timeStrToMinutes(dayOff.startTime) ?? scheduledStartMin;
        const offEnd     = timeStrToMinutes(dayOff.endTime)   ?? scheduledEndMin;
        const offMinutes = Math.max(0, offEnd - offStart);
        effectiveWork    = Math.max(0, scheduledEffective - offMinutes);
        // If off covers the start of the shift, late measured from offEnd
        if (offStart <= scheduledStartMin + grace) effectiveStartMin = offEnd;
        // If off covers the end of the shift, undertime measured to offStart
        if (offEnd >= scheduledEndMin)             effectiveEndMin   = offStart;
      }
    }

    let workedMinutes     = 0;
    let lateMinutes       = 0;
    let undertimeMinutes  = 0;
    let overtimeMinutes   = 0;
    let nightDiffMinutes  = 0;

    if (inLog && !isMissingOut) {
      const actualInMin  = toManilaMinutes(inLog.timestamp);
      const actualOutMin = toManilaMinutes(outLog.timestamp);

      // Late (measured against effective start for the day)
      let late = Math.max(0, actualInMin - (effectiveStartMin + grace));
      if (rounding > 0 && late > 0) {
        late = Math.ceil(late / rounding) * rounding;
      }
      lateMinutes = late;

      // Undertime (measured against effective end for the day)
      undertimeMinutes = outLog ? Math.max(0, effectiveEndMin - actualOutMin) : 0;

      // Worked (gross out-in minus unpaid break)
      let gross = actualOutMin - actualInMin;
      if (gross < 0) gross += 1440; // midnight crossover
      workedMinutes = Math.max(0, gross - unpaidBreak);

      // Overtime (against effective worked hours for the day)
      overtimeMinutes = Math.max(0, workedMinutes - effectiveWork);

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
      logCount: dayLogs.length,
      dayOff:   dayOff ? { type: dayOff.type, reason: dayOff.reason, startTime: dayOff.startTime, endTime: dayOff.endTime } : null,
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
