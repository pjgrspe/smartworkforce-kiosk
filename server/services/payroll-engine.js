/**
 * Payroll Engine
 * Converts time-engine output into a full payslip:
 * basic pay, overtime, holiday pay, night diff, allowances,
 * statutory deductions (SSS / PhilHealth / Pag-IBIG / BIR tax), and net pay.
 *
 * PH rates used: 2024 schedule.
 */

const { getPool } = require('../config/postgres');

// ── Statutory contribution helpers ────────────────────────────────

/**
 * SSS Employee contribution — 4.5 % of MSC
 * MSC clamped to 5,000–35,000 per 2023+ schedule.
 */
function computeSSS(monthlyBasic) {
  const msc = Math.max(5_000, Math.min(35_000, monthlyBasic));
  return round2(msc * 0.045);
}

/**
 * PhilHealth employee share — 2.5 % of basic
 * Floor ₱250, ceiling ₱2,500 (employee half of 5 % total).
 */
function computePhilHealth(monthlyBasic) {
  return round2(Math.max(250, Math.min(2_500, monthlyBasic * 0.025)));
}

/**
 * Pag-IBIG employee contribution — 1 % (≤ ₱1,500) or 2 %, max ₱100/month.
 */
function computePagIbig(monthlyBasic) {
  const rate = monthlyBasic <= 1_500 ? 0.01 : 0.02;
  return Math.min(100, round2(monthlyBasic * rate));
}

/**
 * BIR Withholding Tax — monthly taxable income → monthly tax (TRAIN 2023+).
 * Annualize → apply bracket → divide by 12.
 */
function computeMonthlyTax(monthlyTaxable) {
  if (monthlyTaxable <= 0) return 0;
  const annual = monthlyTaxable * 12;
  let annualTax = 0;
  if      (annual <=   250_000) annualTax = 0;
  else if (annual <=   400_000) annualTax = (annual -   250_000) * 0.20;
  else if (annual <=   800_000) annualTax =  30_000 + (annual -   400_000) * 0.25;
  else if (annual <= 2_000_000) annualTax = 130_000 + (annual -   800_000) * 0.30;
  else if (annual <= 8_000_000) annualTax = 490_000 + (annual - 2_000_000) * 0.32;
  else                          annualTax = 2_410_000 + (annual - 8_000_000) * 0.35;
  return round2(annualTax / 12);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function resolveDayOvertimeMultiplier(day, multipliers) {
  let multiplier = multipliers.regular || 1.25;

  if (day?.isRestDay) {
    multiplier = Math.max(multiplier, multipliers.restDay || 1.30);
  }
  if (day?.isHoliday && day?.holidayType === 'special_non_working') {
    multiplier = Math.max(multiplier, multipliers.specialHoliday || 1.30);
  }
  if (day?.isHoliday && day?.holidayType === 'regular') {
    multiplier = Math.max(multiplier, multipliers.regularHoliday || 2.00);
  }

  return multiplier;
}

// ── Main computePayslip ───────────────────────────────────────────

/**
 * Compute one employee's payslip from the time-engine summary.
 *
 * @param {object} timeSummary   – returned by computeEmployeeTime()
 * @param {object} tenantSettings – Tenant.settings
 * @returns {object} payslip line item (matches PayrollRun.payslipItems schema)
 */
async function computePayslip(timeSummary, tenantSettings = {}) {
  const {
    employeeId, employeeCode, employeeName,
    totalWorkedMinutes, totalLateMinutes, totalUndertimeMinutes,
    totalOvertimeMinutes, totalNightDiffMinutes,
    absentDays, days
  } = timeSummary;

  // Fetch active salary structure
  let salaryStruct = null;
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT *
      FROM salary_structures
      WHERE employee_id = $1
        AND is_active = TRUE
      ORDER BY effective_date DESC, created_at DESC
      LIMIT 1
    `,
    [employeeId],
  );

  if (rows[0]) {
    const row = rows[0];
    salaryStruct = {
      basicRate: row.basic_rate == null ? 0 : Number(row.basic_rate),
      salaryType: row.salary_type,
      paymentFrequency: row.payment_frequency,
      allowances: row.allowances || [],
      additionalDeductions: row.additional_deductions || [],
      overtimeEligible: row.overtime_eligible,
      nightDiffEligible: row.night_diff_eligible,
    };
  }

  if (!salaryStruct) {
    return {
      employeeId, employeeCode, employeeName,
      error: 'No active salary structure found',
      basicPay: 0, overtimePay: 0, holidayPay: 0, nightDiffPay: 0,
      allowances: 0, grossPay: 0, lateDeduction: 0, undertimeDeduction: 0,
      sssContribution: 0, philHealthContribution: 0, pagIbigContribution: 0,
      withholdingTax: 0, otherDeductions: 0, totalDeductions: 0, netPay: 0,
      regularHours: 0, overtimeHours: 0, nightDiffHours: 0,
      lateMinutes: 0, undertimeMinutes: 0, absentDays: 0
    };
  }

  const {
    basicRate,
    salaryType,
    paymentFrequency,
    allowances: allowanceList   = [],
    additionalDeductions         = [],
    overtimeEligible             = true,
    nightDiffEligible            = true,
  } = salaryStruct;

  // How many pay periods per month
  const FREQ = paymentFrequency === 'monthly'     ? 1
             : paymentFrequency === 'semi_monthly' ? 2
             : 4; // weekly

  // Standard working days / month (PH convention: 26)
  const WD_PER_MONTH = 26;

  let workDayRate, hourlyRate;
  if (salaryType === 'monthly') {
    workDayRate = basicRate / WD_PER_MONTH;
    hourlyRate  = workDayRate / 8;
  } else if (salaryType === 'daily') {
    workDayRate = basicRate;
    hourlyRate  = workDayRate / 8;
  } else {
    // hourly
    hourlyRate  = basicRate;
    workDayRate = basicRate * 8;
  }

  const payableDays = days.filter((day) => {
    if (day.isMissingOut) return false;
    if (day.isHoliday && day.isRestDay) return (day.workedMinutes || 0) > 0;
    return !day.isAbsent && !day.isRestDay;
  });
  const daysPresent = payableDays.length;

  // Basic pay (days present × day rate)
  const basicPay = round2(workDayRate * daysPresent);

  // Late & undertime deductions
  const lateDeduction      = round2((totalLateMinutes      / 60) * hourlyRate);
  const undertimeDeduction = round2((totalUndertimeMinutes / 60) * hourlyRate);

  // OT multipliers from tenant config (fallback to DOLE minimums)
  const otM = tenantSettings.overtimeMultipliers || {};
  const specialHolMult  = otM.specialHoliday || 1.30;
  const regularHolMult  = otM.regularHoliday || 2.00;
  const nightDiffRate   = otM.nightDiff       || 0.10;
  const regularHolidayDays = days.filter((day) => day.isHoliday && day.holidayType === 'regular' && !day.isAbsent && !day.isMissingOut).length;
  const specialHolidayDays = days.filter((day) => day.isHoliday && day.holidayType === 'special_non_working' && !day.isAbsent && !day.isMissingOut).length;

  // Overtime pay (regular hours)
  const overtimePay = overtimeEligible
    ? round2(days.reduce((sum, day) => {
      if (day.isMissingOut) return sum;
      const payableMinutes = day.isRestDay && !day.isHoliday
        ? (day.workedMinutes || 0)
        : (day.overtimeMinutes || 0);
      if (!payableMinutes) return sum;
      const multiplier = resolveDayOvertimeMultiplier(day, otM);
      return sum + ((payableMinutes / 60) * hourlyRate * multiplier);
    }, 0))
    : 0;

  // Holiday pay premium (extra on top of basic already counted)
  const holidayPay = round2(
    regularHolidayDays * workDayRate * (regularHolMult  - 1) +
    specialHolidayDays * workDayRate * (specialHolMult  - 1)
  );

  // Night differential pay
  const nightDiffPay = nightDiffEligible
    ? round2((totalNightDiffMinutes / 60) * hourlyRate * nightDiffRate)
    : 0;

  // Allowances prorated for pay period
  let allowancesTotal = 0;
  for (const a of allowanceList) {
    if      (a.type === 'fixed_monthly') allowancesTotal += a.amount / FREQ;
    else if (a.type === 'per_day')       allowancesTotal += a.amount * daysPresent;
    else if (a.type === 'per_hour')      allowancesTotal += a.amount * (totalWorkedMinutes / 60);
  }
  allowancesTotal = round2(allowancesTotal);

  const grossPay = round2(
    basicPay + overtimePay + holidayPay + nightDiffPay + allowancesTotal
  );
  const attendanceDeductions = round2(lateDeduction + undertimeDeduction);
  const taxablePeriodGross = round2(Math.max(0, grossPay - attendanceDeductions));

  // ── Statutory contributions (based on monthly basic equivalent) ──
  const monthlyBasic = salaryType === 'monthly' ? basicRate : workDayRate * WD_PER_MONTH;
  const sss        = round2(computeSSS(monthlyBasic)        / FREQ);
  const philHealth = round2(computePhilHealth(monthlyBasic) / FREQ);
  const pagibig    = round2(computePagIbig(monthlyBasic)    / FREQ);

  // Withholding tax on monthly taxable income → divide by FREQ
  const monthlyGross   = taxablePeriodGross * FREQ;
  const monthlyTaxable = Math.max(0,
    monthlyGross
    - computeSSS(monthlyBasic)
    - computePhilHealth(monthlyBasic)
    - computePagIbig(monthlyBasic)
  );
  const withholdingTax = round2(computeMonthlyTax(monthlyTaxable) / FREQ);

  // Additional company deductions
  let otherDeductions = 0;
  for (const d of additionalDeductions) {
    otherDeductions += d.amount || 0;
  }
  otherDeductions = round2(otherDeductions);

  const totalDeductions = round2(attendanceDeductions + sss + philHealth + pagibig + withholdingTax + otherDeductions);
  const netPay          = round2(Math.max(0, grossPay - totalDeductions));

  return {
    employeeId,
    employeeCode,
    employeeName,
    basicPay,
    overtimePay,
    holidayPay,
    nightDiffPay,
    allowances:            allowancesTotal,
    grossPay,
    lateDeduction,
    undertimeDeduction,
    sssContribution:        sss,
    philHealthContribution: philHealth,
    pagIbigContribution:    pagibig,
    withholdingTax,
    otherDeductions,
    totalDeductions,
    netPay,
    // Summary for payslip display
    regularHours:      round2(totalWorkedMinutes    / 60),
    overtimeHours:     round2(totalOvertimeMinutes  / 60),
    nightDiffHours:    round2(totalNightDiffMinutes / 60),
    lateMinutes:       totalLateMinutes,
    undertimeMinutes:  totalUndertimeMinutes,
    absentDays
  };
}

module.exports = { computePayslip, computeSSS, computePhilHealth, computePagIbig, computeMonthlyTax };
