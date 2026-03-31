/**
 * seed-mock.js — Realistic mock data seeder for DE WEBNET
 *
 * Run from Apollo/server:  node scripts/seed-mock.js
 *
 * Idempotent: safe to run multiple times.
 * Creates outbox events so all data syncs to HQ automatically.
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const bcrypt          = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { connectPostgres, getPool } = require('../config/postgres');
const { enqueueOutboxEvent }       = require('../services/sync-outbox');

// ─── helpers ────────────────────────────────────────────────────────────────

const PW_HASH = bcrypt.hashSync('employee123', 12);

function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr)       { return arr[Math.floor(Math.random() * arr.length)]; }

/** Working days in the past N calendar days (Mon-Fri, skip weekends). */
function workingDays(calendarDays) {
  const days = [];
  const now  = new Date();
  for (let i = calendarDays; i >= 1; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (d.getDay() !== 0 && d.getDay() !== 6) days.push(d);
  }
  return days;
}

/** Format date as YYYY-MM-DD. */
function ymd(d) { return d.toISOString().slice(0, 10); }

/** Build a timestamp for a given date and HH:MM string. */
function makeTs(date, hhmm, offsetMinutes = 0) {
  const [h, m] = hhmm.split(':').map(Number);
  const ts = new Date(date);
  ts.setHours(h, m + offsetMinutes, 0, 0);
  return ts;
}

async function upsertRow(pool, table, conflictCols, data, returning = 'id') {
  // Check if row already exists
  const where    = conflictCols.map((c, i) => `${c} = $${i + 1}`).join(' AND ');
  const existing = await pool.query(
    `SELECT ${returning} FROM ${table} WHERE ${where} LIMIT 1`,
    conflictCols.map(c => data[c]),
  );
  if (existing.rows[0]) return existing.rows[0];

  // Insert new row
  const keys = Object.keys(data);
  const cols = keys.join(', ');
  const vals = keys.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query(
    `INSERT INTO ${table} (${cols}) VALUES (${vals}) RETURNING ${returning}`,
    Object.values(data),
  );
  return rows[0];
}

// ─── seed function ───────────────────────────────────────────────────────────

async function seed() {
  await connectPostgres();
  const pool = getPool();

  // ── 0. Fetch existing tenant ──────────────────────────────────────────────
  const { rows: tenantRows } = await pool.query(
    `SELECT id FROM tenants WHERE code = 'DEWEBNET' LIMIT 1`,
  );
  if (!tenantRows[0]) {
    console.error('Tenant DEWEBNET not found. Run seed-postgres-admin.js first.');
    process.exit(1);
  }
  const tenantId = tenantRows[0].id;
  console.log(`✓ Tenant: ${tenantId}`);

  // ── 1. Branches ───────────────────────────────────────────────────────────
  console.log('\n[1/8] Branches...');

  const branchDefs = [
    {
      id:   uuidv4(), code: 'HO',
      name: 'Head Office',
      address: '123 Ayala Avenue, Makati City, Metro Manila',
      phone: '(02) 8123-4567',
    },
    {
      id:   uuidv4(), code: 'CBU',
      name: 'Cebu Branch',
      address: '45 Colon Street, Cebu City, Cebu',
      phone: '(032) 234-5678',
    },
    {
      id:   uuidv4(), code: 'DVO',
      name: 'Davao Branch',
      address: '78 JP Laurel Avenue, Davao City, Davao del Sur',
      phone: '(082) 345-6789',
    },
  ];

  const branches = {};
  for (const b of branchDefs) {
    const row = await upsertRow(pool, 'branches', ['tenant_id', 'code'], {
      id: b.id, tenant_id: tenantId, name: b.name, code: b.code,
      address: b.address, phone: b.phone, timezone: 'Asia/Manila', is_active: true,
    });
    branches[b.code] = row.id;
    await enqueueOutboxEvent({
      branchId: row.id, eventType: 'branch.created', entityType: 'branch',
      entityId: row.id,
      payload: { id: row.id, tenantId, name: b.name, code: b.code, isActive: true },
      idempotencyKey: `seed:branch:${b.code}`,
    });
    console.log(`  ✓ ${b.name} (${row.id})`);
  }

  // ── 2. Departments ────────────────────────────────────────────────────────
  console.log('\n[2/8] Departments...');

  const deptDefs = [
    { code: 'HR',    name: 'Human Resources',    description: 'HR and People Management' },
    { code: 'IT',    name: 'Information Technology', description: 'IT Systems and Development' },
    { code: 'OPS',   name: 'Operations',          description: 'Business Operations' },
    { code: 'FIN',   name: 'Finance & Accounting', description: 'Financial Management' },
    { code: 'SALES', name: 'Sales & Marketing',   description: 'Sales and Client Relations' },
  ];

  const depts = {}; // { 'HO:HR': uuid, ... }
  for (const [bCode, bId] of Object.entries(branches)) {
    for (const d of deptDefs) {
      const row = await upsertRow(pool, 'departments', ['tenant_id', 'branch_id', 'code'], {
        id: uuidv4(), tenant_id: tenantId, branch_id: bId,
        name: d.name, code: d.code, description: d.description, is_active: true,
      });
      depts[`${bCode}:${d.code}`] = row.id;
      await enqueueOutboxEvent({
        branchId: bId, eventType: 'department.created', entityType: 'department',
        entityId: row.id,
        payload: { id: row.id, tenantId, branchId: bId, name: d.name, code: d.code, isActive: true },
        idempotencyKey: `seed:dept:${bCode}:${d.code}`,
      });
    }
    console.log(`  ✓ Departments for ${bCode}`);
  }

  // ── 3. Schedules ──────────────────────────────────────────────────────────
  console.log('\n[3/8] Schedules...');

  const scheduleDefs = [
    {
      code: 'DAY', name: 'Day Shift (8AM-5PM)', type: 'fixed',
      shift_start: '08:00', shift_end: '17:00',
      break_start: '12:00', break_end: '13:00',
      break_duration_minutes: 60, is_paid_break: false,
      grace_period_minutes: 5, undertime_policy_minutes: 15,
      rounding_rule_minutes: 0, allow_multiple_punches: false,
      rest_days: JSON.stringify(['Sunday', 'Saturday']),
    },
    {
      code: 'NIGHT', name: 'Night Shift (10PM-7AM)', type: 'fixed',
      shift_start: '22:00', shift_end: '07:00',
      break_start: '02:00', break_end: '03:00',
      break_duration_minutes: 60, is_paid_break: false,
      grace_period_minutes: 5, undertime_policy_minutes: 15,
      rounding_rule_minutes: 0, allow_multiple_punches: false,
      rest_days: JSON.stringify(['Sunday', 'Saturday']),
    },
    {
      code: 'FLEXI', name: 'Flexible Hours', type: 'flexible',
      shift_start: null, shift_end: null,
      break_start: null, break_end: null,
      break_duration_minutes: 60, is_paid_break: false,
      grace_period_minutes: 0, undertime_policy_minutes: 0,
      rounding_rule_minutes: 0, allow_multiple_punches: true,
      rest_days: JSON.stringify(['Sunday']),
    },
  ];

  const schedules = {};
  for (const s of scheduleDefs) {
    const row = await upsertRow(pool, 'schedules', ['tenant_id', 'code'], {
      id: uuidv4(), tenant_id: tenantId, ...s, is_active: true,
    });
    schedules[s.code] = row.id;
    await enqueueOutboxEvent({
      branchId: branches.HO, eventType: 'schedule.created', entityType: 'schedule',
      entityId: row.id,
      payload: { id: row.id, tenantId, name: s.name, code: s.code, type: s.type, isActive: true },
      idempotencyKey: `seed:schedule:${s.code}`,
    });
    console.log(`  ✓ ${s.name}`);
  }

  // ── 4. Employees ──────────────────────────────────────────────────────────
  console.log('\n[4/8] Employees...');

  const employeeDefs = [
    // ── Head Office ──
    {
      code: 'EMP-001', branch: 'HO', dept: 'HR', schedule: 'DAY',
      firstName: 'Maria', middleName: 'Santos', lastName: 'Reyes',
      gender: 'Female', dob: '1992-04-15',
      contact: '09171234001', email: 'maria.reyes@dewebnet.com',
      address: '12 Mabini St., Pasay City, Metro Manila',
      position: 'HR Manager', status: 'regular', dateHired: '2020-03-01',
      sss: '34-5678901-2', philhealth: '120345678901', pagibig: '120134567890',
      tin: '123-456-789-000', bank: 'BDO', acct: '002345678901',
      salary: 45000, absentRate: 0.03, lateRate: 0.05, otRate: 0.20,
      userRole: 'hr_payroll',
    },
    {
      code: 'EMP-002', branch: 'HO', dept: 'IT', schedule: 'DAY',
      firstName: 'Juan', middleName: 'Cruz', lastName: 'Dela Cruz',
      gender: 'Male', dob: '1990-08-22',
      contact: '09181234002', email: 'juan.delacruz@dewebnet.com',
      address: '34 Rizal Ave., Mandaluyong City, Metro Manila',
      position: 'Systems Developer', status: 'regular', dateHired: '2019-06-15',
      sss: '45-6789012-3', philhealth: '120456789012', pagibig: '120145678901',
      tin: '234-567-890-000', bank: 'Metrobank', acct: '012345678901',
      salary: 52000, absentRate: 0.02, lateRate: 0.08, otRate: 0.35,
      userRole: 'employee',
    },
    {
      code: 'EMP-003', branch: 'HO', dept: 'OPS', schedule: 'DAY',
      firstName: 'Ana', middleName: 'Lim', lastName: 'Garcia',
      gender: 'Female', dob: '1995-01-30',
      contact: '09191234003', email: 'ana.garcia@dewebnet.com',
      address: '56 Quezon Blvd., Quezon City, Metro Manila',
      position: 'Operations Coordinator', status: 'regular', dateHired: '2021-09-01',
      sss: '56-7890123-4', philhealth: '120567890123', pagibig: '120156789012',
      tin: '345-678-901-000', bank: 'BPI', acct: '1234567890',
      salary: 32000, absentRate: 0.05, lateRate: 0.15, otRate: 0.10,
      userRole: 'employee',
    },
    {
      code: 'EMP-004', branch: 'HO', dept: 'FIN', schedule: 'DAY',
      firstName: 'Roberto', middleName: 'Tan', lastName: 'Villanueva',
      gender: 'Male', dob: '1988-11-05',
      contact: '09171234004', email: 'roberto.villanueva@dewebnet.com',
      address: '78 Shaw Blvd., Pasig City, Metro Manila',
      position: 'Finance Analyst', status: 'regular', dateHired: '2018-02-14',
      sss: '67-8901234-5', philhealth: '120678901234', pagibig: '120167890123',
      tin: '456-789-012-000', bank: 'Metrobank', acct: '023456789012',
      salary: 40000, absentRate: 0.02, lateRate: 0.04, otRate: 0.25,
      userRole: 'employee',
    },
    {
      code: 'EMP-005', branch: 'HO', dept: 'IT', schedule: 'DAY',
      firstName: 'Kristine', middleName: 'Bautista', lastName: 'Mendoza',
      gender: 'Female', dob: '1997-06-18',
      contact: '09181234005', email: 'kristine.mendoza@dewebnet.com',
      address: '90 EDSA, Mandaluyong City, Metro Manila',
      position: 'Junior Developer', status: 'probationary', dateHired: '2025-09-01',
      sss: '78-9012345-6', philhealth: '120789012345', pagibig: '120178901234',
      tin: '567-890-123-000', bank: 'BDO', acct: '034567890123',
      salary: 28000, absentRate: 0.04, lateRate: 0.12, otRate: 0.15,
      userRole: 'employee',
    },
    // ── Cebu Branch ──
    {
      code: 'EMP-006', branch: 'CBU', dept: 'OPS', schedule: 'DAY',
      firstName: 'Jose', middleName: 'Ramos', lastName: 'Santos',
      gender: 'Male', dob: '1985-03-20',
      contact: '09221234006', email: 'jose.santos@dewebnet.com',
      address: '15 Osmena Blvd., Cebu City, Cebu',
      position: 'Branch Manager', status: 'regular', dateHired: '2017-07-01',
      sss: '89-0123456-7', philhealth: '120890123456', pagibig: '120189012345',
      tin: '678-901-234-000', bank: 'BDO', acct: '045678901234',
      salary: 55000, absentRate: 0.01, lateRate: 0.02, otRate: 0.30,
      userRole: 'branch_manager',
    },
    {
      code: 'EMP-007', branch: 'CBU', dept: 'SALES', schedule: 'DAY',
      firstName: 'Maricel', middleName: 'Cruz', lastName: 'Reyes',
      gender: 'Female', dob: '1993-09-12',
      contact: '09231234007', email: 'maricel.reyes@dewebnet.com',
      address: '27 Jakosalem St., Cebu City, Cebu',
      position: 'Sales Agent', status: 'regular', dateHired: '2022-01-10',
      sss: '90-1234567-8', philhealth: '120901234567', pagibig: '120190123456',
      tin: '789-012-345-000', bank: 'BPI', acct: '2345678901',
      salary: 30000, absentRate: 0.04, lateRate: 0.10, otRate: 0.12,
      userRole: 'employee',
    },
    {
      code: 'EMP-008', branch: 'CBU', dept: 'FIN', schedule: 'DAY',
      firstName: 'Ferdinand', middleName: 'Lim', lastName: 'Torres',
      gender: 'Male', dob: '1991-12-25',
      contact: '09241234008', email: 'ferdinand.torres@dewebnet.com',
      address: '39 Mango Ave., Cebu City, Cebu',
      position: 'Finance Staff', status: 'regular', dateHired: '2023-03-15',
      sss: '01-2345678-9', philhealth: '120012345678', pagibig: '120101234567',
      tin: '890-123-456-000', bank: 'Metrobank', acct: '034567890124',
      salary: 26000, absentRate: 0.03, lateRate: 0.06, otRate: 0.08,
      userRole: 'employee',
    },
    // ── Davao Branch ──
    {
      code: 'EMP-009', branch: 'DVO', dept: 'OPS', schedule: 'DAY',
      firstName: 'Grace', middleName: 'Uy', lastName: 'Lim',
      gender: 'Female', dob: '1986-07-04',
      contact: '09271234009', email: 'grace.lim@dewebnet.com',
      address: '21 Magallanes St., Davao City, Davao del Sur',
      position: 'Branch Manager', status: 'regular', dateHired: '2016-05-01',
      sss: '12-3456789-1', philhealth: '120123456789', pagibig: '120112345678',
      tin: '901-234-567-000', bank: 'BDO', acct: '056789012345',
      salary: 55000, absentRate: 0.01, lateRate: 0.02, otRate: 0.28,
      userRole: 'branch_manager',
    },
    {
      code: 'EMP-010', branch: 'DVO', dept: 'SALES', schedule: 'DAY',
      firstName: 'Antonio', middleName: 'Gomez', lastName: 'Cruz',
      gender: 'Male', dob: '1994-02-14',
      contact: '09281234010', email: 'antonio.cruz@dewebnet.com',
      address: '33 Ilustre St., Davao City, Davao del Sur',
      position: 'Sales Supervisor', status: 'regular', dateHired: '2021-11-01',
      sss: '23-4567890-2', philhealth: '120234567890', pagibig: '120123456789',
      tin: '012-345-678-000', bank: 'BPI', acct: '3456789012',
      salary: 38000, absentRate: 0.03, lateRate: 0.07, otRate: 0.18,
      userRole: 'employee',
    },
    {
      code: 'EMP-011', branch: 'DVO', dept: 'HR', schedule: 'DAY',
      firstName: 'Rosario', middleName: 'Dela', lastName: 'Bautista',
      gender: 'Female', dob: '1996-10-31',
      contact: '09291234011', email: 'rosario.bautista@dewebnet.com',
      address: '45 Bolton St., Davao City, Davao del Sur',
      position: 'HR Associate', status: 'probationary', dateHired: '2025-11-01',
      sss: '34-5678901-3', philhealth: '120345678902', pagibig: '120134567891',
      tin: '123-456-789-001', bank: 'Metrobank', acct: '045678901236',
      salary: 24000, absentRate: 0.05, lateRate: 0.13, otRate: 0.05,
      userRole: 'employee',
    },
  ];

  const empIds    = {}; // code → id
  const empBranch = {}; // code → branchId

  for (const e of employeeDefs) {
    const branchId = branches[e.branch];
    const deptId   = depts[`${e.branch}:${e.dept}`];
    const schedId  = schedules[e.schedule];

    const row = await upsertRow(pool, 'employees', ['tenant_id', 'employee_code'], {
      id:            uuidv4(),
      tenant_id:     tenantId,
      branch_id:     branchId,
      department_id: deptId,
      employee_code: e.code,
      first_name:    e.firstName,
      middle_name:   e.middleName,
      last_name:     e.lastName,
      gender:        e.gender,
      date_of_birth: e.dob,
      contact_number: e.contact,
      email:         e.email,
      address:       e.address,
      employment: JSON.stringify({
        position:   e.position,
        status:     e.status,
        date_hired: e.dateHired,
        sss:        e.sss,
        philhealth: e.philhealth,
        pagibig:    e.pagibig,
      }),
      gov_ids: JSON.stringify({ tin: e.tin }),
      bank:    JSON.stringify({ bankName: e.bank, accountNumber: e.acct }),
      tax_status:  'S',
      dependents:  0,
      face_data:   JSON.stringify({}),
      schedule_id: schedId,
      is_active:   true,
    });

    empIds[e.code]    = row.id;
    empBranch[e.code] = branchId;

    await enqueueOutboxEvent({
      branchId,
      eventType:  'employee.created',
      entityType: 'employee',
      entityId:   row.id,
      payload: {
        id: row.id, tenantId, branchId, departmentId: deptId,
        employeeCode: e.code,
        firstName: e.firstName, middleName: e.middleName, lastName: e.lastName,
        gender: e.gender, dateOfBirth: e.dob, contactNumber: e.contact,
        email: e.email, address: e.address,
        employment: { position: e.position, status: e.status, date_hired: e.dateHired,
                      sss: e.sss, philhealth: e.philhealth, pagibig: e.pagibig },
        govIds: { tin: e.tin },
        bank: { bankName: e.bank, accountNumber: e.acct },
        scheduleId: schedId, isActive: true,
        updatedAt: new Date().toISOString(),
      },
      idempotencyKey: `seed:employee:${e.code}`,
    });

    console.log(`  ✓ ${e.firstName} ${e.lastName} (${e.code}) — ${e.branch}`);
  }

  // ── 5. Salary Structures ──────────────────────────────────────────────────
  console.log('\n[5/8] Salary Structures...');

  for (const e of employeeDefs) {
    const empId   = empIds[e.code];
    const branchId = empBranch[e.code];
    const existing = await pool.query(
      `SELECT id FROM salary_structures WHERE employee_id = $1 AND is_active = TRUE LIMIT 1`,
      [empId],
    );
    if (existing.rows[0]) {
      console.log(`  ↷ ${e.code} already has active salary`);
      continue;
    }

    const salId = uuidv4();
    await pool.query(`
      INSERT INTO salary_structures (
        id, tenant_id, employee_id, salary_type, basic_rate, payment_frequency,
        allowances, additional_deductions, leave_credits,
        overtime_eligible, night_diff_eligible, effective_date, is_active
      ) VALUES ($1,$2,$3,'monthly',$4,'semi_monthly',$5,$6,$7,TRUE,TRUE,NOW(),TRUE)
    `, [
      salId, tenantId, empId, e.salary,
      JSON.stringify([
        { name: 'Transportation Allowance', amount: 2000 },
        { name: 'Meal Allowance',           amount: 1500 },
      ]),
      JSON.stringify([]),
      JSON.stringify({ vacationLeave: 15, sickLeave: 15 }),
    ]);

    console.log(`  ✓ ${e.code} — ₱${e.salary.toLocaleString()}/month`);
  }

  // ── 6. User Accounts ──────────────────────────────────────────────────────
  console.log('\n[6/8] User Accounts...');

  for (const e of employeeDefs) {
    const existing = await pool.query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`, [e.email],
    );
    if (existing.rows[0]) {
      console.log(`  ↷ ${e.email} already exists`);
      continue;
    }

    const userId   = uuidv4();
    const branchId = empBranch[e.code];
    await pool.query(`
      INSERT INTO users (
        id, tenant_id, branch_id, email, password_hash,
        first_name, last_name, role, employee_id, is_active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE)
    `, [
      userId, tenantId, branchId, e.email, PW_HASH,
      e.firstName, e.lastName, e.userRole, empIds[e.code],
    ]);

    await enqueueOutboxEvent({
      branchId,
      eventType: 'user.created', entityType: 'user', entityId: userId,
      payload: {
        id: userId, tenantId, branchId, email: e.email,
        firstName: e.firstName, lastName: e.lastName,
        role: e.userRole, employeeId: empIds[e.code], isActive: true,
      },
      idempotencyKey: `seed:user:${e.email}`,
    });

    console.log(`  ✓ ${e.email} (${e.userRole})`);
  }

  // ── 7. Attendance Logs ────────────────────────────────────────────────────
  console.log('\n[7/8] Attendance Logs (past 40 working days)...');

  const days = workingDays(60); // last 60 calendar days → ~40 working days

  let attendanceCount = 0;

  for (const e of employeeDefs) {
    const empId   = empIds[e.code];
    const branchId = empBranch[e.code];

    for (const day of days) {
      // Skip absent days
      if (Math.random() < e.absentRate) continue;

      // Check if already has attendance for this day
      const dayStr = ymd(day);
      const existing = await pool.query(`
        SELECT id FROM attendance_logs
        WHERE employee_id = $1 AND DATE(timestamp) = $2 AND type = 'IN'
        LIMIT 1
      `, [empId, dayStr]);
      if (existing.rows[0]) continue;

      const isLate   = Math.random() < e.lateRate;
      const hasOT    = Math.random() < e.otRate;
      const inOffset = isLate ? Math.floor(rand(6, 45)) : Math.floor(rand(-2, 4));
      const outExtra = hasOT  ? Math.floor(rand(30, 120)) : Math.floor(rand(-5, 5));

      const logs = [
        { type: 'IN',        offset: inOffset,          base: '08:00' },
        { type: 'BREAK_OUT', offset: Math.floor(rand(-5, 5)), base: '12:00' },
        { type: 'BREAK_IN',  offset: Math.floor(rand(55, 70)), base: '12:00' },
        { type: 'OUT',       offset: outExtra,           base: '17:00' },
      ];

      for (const log of logs) {
        const ts   = makeTs(day, log.base, log.offset);
        const logId = uuidv4();
        const score = parseFloat(rand(0.87, 0.99).toFixed(4));

        await pool.query(`
          INSERT INTO attendance_logs (
            id, tenant_id, branch_id, employee_id, timestamp,
            type, source, confidence_score, exceptions, synced, synced_at
          ) VALUES ($1,$2,$3,$4,$5,$6,'face_kiosk',$7,'{}',TRUE,NOW())
          ON CONFLICT (id) DO NOTHING
        `, [logId, tenantId, branchId, empId, ts, log.type, score]);

        await enqueueOutboxEvent({
          branchId,
          eventType: 'attendance.created', entityType: 'attendance_log', entityId: logId,
          payload: {
            id: logId, tenantId, branchId, employeeId: empId,
            timestamp: ts.toISOString(), type: log.type,
            source: 'face_kiosk', confidenceScore: score,
          },
          idempotencyKey: `seed:att:${logId}`,
        });

        attendanceCount++;
      }
    }
  }

  console.log(`  ✓ ${attendanceCount} attendance records`);

  // ── 8. Philippine Holidays 2026 ───────────────────────────────────────────
  console.log('\n[8/8] Philippine Holidays 2026...');

  const holidays = [
    { name: "New Year's Day",           date: '2026-01-01', type: 'regular' },
    { name: 'Chinese New Year',         date: '2026-01-29', type: 'special_non_working' },
    { name: 'EDSA People Power Revolution', date: '2026-02-25', type: 'special_non_working' },
    { name: 'Araw ng Kagitingan',       date: '2026-04-09', type: 'regular' },
    { name: 'Maundy Thursday',          date: '2026-04-02', type: 'regular' },
    { name: 'Good Friday',              date: '2026-04-03', type: 'regular' },
    { name: 'Black Saturday',           date: '2026-04-04', type: 'special_non_working' },
    { name: 'Labor Day',                date: '2026-05-01', type: 'regular' },
    { name: 'Independence Day',         date: '2026-06-12', type: 'regular' },
    { name: 'Ninoy Aquino Day',         date: '2026-08-21', type: 'special_non_working' },
    { name: 'National Heroes Day',      date: '2026-08-31', type: 'regular' },
    { name: 'All Saints Day',           date: '2026-11-01', type: 'special_non_working' },
    { name: 'All Souls Day',            date: '2026-11-02', type: 'special_non_working' },
    { name: 'Bonifacio Day',            date: '2026-11-30', type: 'regular' },
    { name: 'Immaculate Conception',    date: '2026-12-08', type: 'special_non_working' },
    { name: 'Christmas Day',            date: '2026-12-25', type: 'regular' },
    { name: 'Rizal Day',                date: '2026-12-30', type: 'regular' },
    { name: "New Year's Eve",           date: '2026-12-31', type: 'special_non_working' },
  ];

  for (const h of holidays) {
    await upsertRow(pool, 'holidays', ['tenant_id', 'date'], {
      id: uuidv4(), tenant_id: tenantId, name: h.name, date: h.date, type: h.type,
    });
  }
  console.log(`  ✓ ${holidays.length} holidays`);

  // ── done ──────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════');
  console.log('  Mock data seeded successfully!');
  console.log('  Outbox events created — sync worker will');
  console.log('  push all data to HQ within ~10 seconds.');
  console.log('══════════════════════════════════════════════\n');

  await pool.end();
  process.exit(0);
}

seed().catch(err => {
  console.error('\n✗ Seed failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
