require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
const CLEAN = process.argv.includes('--clean');

// ── Helpers ────────────────────────────────────────────────────────────────
function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pad(n) { return String(n).padStart(2, '0'); }
function timeStr(h, m) { return `${pad(h)}:${pad(m)}`; }

function genAttendance(dateStr, emp) {
  if (Math.random() < emp.absentRate) return null;
  let inH = 8, inM = rnd(0, 4);
  if (Math.random() < emp.lateRate) { inM = rnd(8, 55); if (inM >= 60) { inH = 9; inM -= 60; } }
  let outH = 17, outM = rnd(0, 20);
  if (Math.random() < emp.overtimeRate) { outH = rnd(18, 19); outM = rnd(0, 30); }
  return {
    in:       `${dateStr}T${timeStr(inH, inM)}:00+08:00`,
    breakOut: `${dateStr}T12:${pad(rnd(0,10))}:00+08:00`,
    breakIn:  `${dateStr}T13:${pad(rnd(0,10))}:00+08:00`,
    out:      `${dateStr}T${timeStr(outH, outM)}:00+08:00`,
  };
}

function getWorkdays(calendarDays) {
  const dates = [];
  const today = new Date('2026-03-16');
  for (let i = calendarDays; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// ── Clean ──────────────────────────────────────────────────────────────────
async function clean(client) {
  // Delete in reverse FK order; only touch mock employee codes
  const MOCK_CODES = ['EMP-001','EMP-002','EMP-003','EMP-004','EMP-005'];

  const { rows: emps } = await client.query(
    `SELECT id FROM employees WHERE employee_code = ANY($1)`, [MOCK_CODES]
  );
  const empIds = emps.map(e => e.id);

  if (empIds.length) {
    await client.query(`DELETE FROM attendance_logs   WHERE employee_id = ANY($1)`, [empIds]);
    await client.query(`DELETE FROM salary_structures WHERE employee_id = ANY($1)`, [empIds]);
    await client.query(`DELETE FROM users             WHERE employee_id = ANY($1)`, [empIds]);
    await client.query(`DELETE FROM employees         WHERE id          = ANY($1)`, [empIds]);
  }

  // Departments only if they were created by this script
  const MOCK_DEPT_CODES = ['HR','IT','OPS','FIN'];
  await client.query(`DELETE FROM departments WHERE code = ANY($1)`, [MOCK_DEPT_CODES]);

  // Schedule
  await client.query(`DELETE FROM schedules WHERE code = 'DAY'`);

  // Holidays
  await client.query(`DELETE FROM holidays WHERE date BETWEEN '2026-01-01' AND '2026-12-31'`);

  console.log('✅ Mock data removed. Admin users and tenant/branch untouched.');
}

// ── Seed ───────────────────────────────────────────────────────────────────
async function seed(client) {
  const { rows: [tenant] } = await client.query(
    `SELECT id FROM tenants WHERE code = 'DEWEBNET' LIMIT 1`
  );
  if (!tenant) throw new Error('Run seed-postgres-admin.js first');
  const tenantId = tenant.id;

  const { rows: [branch] } = await client.query(
    `SELECT id FROM branches WHERE code = 'HO' AND tenant_id = $1 LIMIT 1`, [tenantId]
  );
  const branchId = branch.id;

  // Schedule
  const { rows: [schedule] } = await client.query(`
    INSERT INTO schedules
      (tenant_id, name, code, type, shift_start, shift_end,
       break_start, break_end, break_duration_minutes, is_paid_break,
       grace_period_minutes, undertime_policy_minutes, rest_days)
    VALUES ($1,'Day Shift (8AM-5PM)','DAY','fixed','08:00','17:00',
      '12:00','13:00',60,false,5,15,'["Sunday","Saturday"]'::jsonb)
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `, [tenantId]);
  const scheduleId = schedule.id;

  // Departments
  const deptData = [
    { name: 'Human Resources',       code: 'HR'  },
    { name: 'Information Technology',code: 'IT'  },
    { name: 'Operations',            code: 'OPS' },
    { name: 'Finance',               code: 'FIN' },
  ];
  const deptIds = {};
  for (const d of deptData) {
    const { rows } = await client.query(`
      INSERT INTO departments (tenant_id, branch_id, name, code)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [tenantId, branchId, d.name, d.code]);
    if (rows[0]) {
      deptIds[d.code] = rows[0].id;
    } else {
      const { rows: ex } = await client.query(
        `SELECT id FROM departments WHERE tenant_id=$1 AND code=$2`, [tenantId, d.code]
      );
      deptIds[d.code] = ex[0].id;
    }
  }

  // Employees
  const employeeData = [
    {
      code: 'EMP-001', firstName: 'Maria',    middleName: 'Santos',   lastName: 'Reyes',
      gender: 'Female', dob: '1992-04-15', contact: '09171234001',
      email: 'maria.reyes@dewebnet.com',      dept: 'HR',
      position: 'HR Manager',               status: 'regular',       salary: 45000,
      absentRate: 0.03, lateRate: 0.05, overtimeRate: 0.20,
    },
    {
      code: 'EMP-002', firstName: 'Juan',     middleName: 'Cruz',     lastName: 'Dela Cruz',
      gender: 'Male',   dob: '1990-08-22', contact: '09181234002',
      email: 'juan.delacruz@dewebnet.com',    dept: 'IT',
      position: 'Systems Developer',         status: 'regular',       salary: 52000,
      absentRate: 0.02, lateRate: 0.08, overtimeRate: 0.35,
    },
    {
      code: 'EMP-003', firstName: 'Ana',      middleName: 'Lim',      lastName: 'Garcia',
      gender: 'Female', dob: '1995-01-30', contact: '09191234003',
      email: 'ana.garcia@dewebnet.com',       dept: 'OPS',
      position: 'Operations Coordinator',    status: 'regular',       salary: 32000,
      absentRate: 0.05, lateRate: 0.15, overtimeRate: 0.10,
    },
    {
      code: 'EMP-004', firstName: 'Roberto',  middleName: 'Tan',      lastName: 'Villanueva',
      gender: 'Male',   dob: '1988-11-05', contact: '09171234004',
      email: 'roberto.villanueva@dewebnet.com', dept: 'FIN',
      position: 'Finance Analyst',           status: 'regular',       salary: 40000,
      absentRate: 0.02, lateRate: 0.04, overtimeRate: 0.25,
    },
    {
      code: 'EMP-005', firstName: 'Kristine', middleName: 'Bautista', lastName: 'Mendoza',
      gender: 'Female', dob: '1997-06-18', contact: '09181234005',
      email: 'kristine.mendoza@dewebnet.com', dept: 'IT',
      position: 'Junior Developer',          status: 'probationary',  salary: 28000,
      absentRate: 0.04, lateRate: 0.12, overtimeRate: 0.15,
    },
  ];

  const seededEmps = [];
  for (const e of employeeData) {
    const employment = {
      position: e.position, status: e.status, date_hired: '2024-01-15',
      sss: `34-${rnd(1000000,9999999)}-${rnd(1,9)}`,
      philhealth: `${rnd(10,99)}-${rnd(100000000,999999999)}-${rnd(1,9)}`,
      pagibig: `${rnd(1000,9999)}-${rnd(1000,9999)}-${rnd(1000,9999)}`,
    };

    const { rows: [emp] } = await client.query(`
      INSERT INTO employees
        (tenant_id, branch_id, department_id, employee_code,
         first_name, middle_name, last_name, gender, date_of_birth,
         contact_number, email, employment, gov_ids, schedule_id, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE)
      ON CONFLICT (tenant_id, employee_code) DO UPDATE
        SET first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
            schedule_id=EXCLUDED.schedule_id, updated_at=NOW()
      RETURNING id
    `, [
      tenantId, branchId, deptIds[e.dept], e.code,
      e.firstName, e.middleName, e.lastName, e.gender, e.dob,
      e.contact, e.email,
      JSON.stringify(employment),
      JSON.stringify({ tin: `${rnd(100,999)}-${rnd(100,999)}-${rnd(100,999)}` }),
      scheduleId,
    ]);

    seededEmps.push({ id: emp.id, ...e });

    // Salary structure
    await client.query(`
      INSERT INTO salary_structures
        (tenant_id, employee_id, salary_type, basic_rate, payment_frequency, allowances, is_active)
      VALUES ($1,$2,'monthly',$3,'semi_monthly',
        '[{"type":"transportation","amount":2000},{"type":"meal","amount":1500}]'::jsonb, TRUE)
      ON CONFLICT DO NOTHING
    `, [tenantId, emp.id, e.salary]);

    // Employee user account
    const pwHash = await bcrypt.hash('employee123', 10);
    await client.query(`
      INSERT INTO users
        (tenant_id, branch_id, email, password_hash, first_name, last_name, role, employee_id, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,'employee',$7,TRUE)
      ON CONFLICT (email) DO UPDATE SET employee_id=EXCLUDED.employee_id, updated_at=NOW()
    `, [tenantId, branchId, e.email, pwHash, e.firstName, e.lastName, emp.id]);
  }

  // Attendance — past ~30 workdays
  const workdays = getWorkdays(45);
  let attDays = 0;
  for (const emp of seededEmps) {
    for (const dateStr of workdays) {
      const att = genAttendance(dateStr, emp);
      if (!att) continue;
      const score = (0.85 + Math.random() * 0.14).toFixed(4);
      await client.query(`
        INSERT INTO attendance_logs (tenant_id,branch_id,employee_id,timestamp,type,source,confidence_score,synced)
        VALUES ($1,$2,$3,$4,'IN','face_kiosk',$5,TRUE) ON CONFLICT DO NOTHING
      `, [tenantId, branchId, emp.id, att.in, score]);
      await client.query(`
        INSERT INTO attendance_logs (tenant_id,branch_id,employee_id,timestamp,type,source,synced)
        VALUES ($1,$2,$3,$4,'BREAK_OUT','web',TRUE) ON CONFLICT DO NOTHING
      `, [tenantId, branchId, emp.id, att.breakOut]);
      await client.query(`
        INSERT INTO attendance_logs (tenant_id,branch_id,employee_id,timestamp,type,source,synced)
        VALUES ($1,$2,$3,$4,'BREAK_IN','web',TRUE) ON CONFLICT DO NOTHING
      `, [tenantId, branchId, emp.id, att.breakIn]);
      await client.query(`
        INSERT INTO attendance_logs (tenant_id,branch_id,employee_id,timestamp,type,source,confidence_score,synced)
        VALUES ($1,$2,$3,$4,'OUT','face_kiosk',$5,TRUE) ON CONFLICT DO NOTHING
      `, [tenantId, branchId, emp.id, att.out, score]);
      attDays++;
    }
  }

  // PH Holidays 2026
  const holidays = [
    { name: "New Year's Day",         date: '2026-01-01', type: 'regular' },
    { name: 'Araw ng Kagitingan',      date: '2026-04-09', type: 'regular' },
    { name: 'Maundy Thursday',         date: '2026-04-02', type: 'regular' },
    { name: 'Good Friday',             date: '2026-04-03', type: 'regular' },
    { name: 'Labor Day',               date: '2026-05-01', type: 'regular' },
    { name: 'Independence Day',        date: '2026-06-12', type: 'regular' },
    { name: 'Ninoy Aquino Day',        date: '2026-08-21', type: 'special_non_working' },
    { name: 'National Heroes Day',     date: '2026-08-31', type: 'regular' },
    { name: 'All Saints Day',          date: '2026-11-01', type: 'special_non_working' },
    { name: 'Bonifacio Day',           date: '2026-11-30', type: 'regular' },
    { name: 'Immaculate Conception',   date: '2026-12-08', type: 'special_non_working' },
    { name: 'Christmas Day',           date: '2026-12-25', type: 'regular' },
    { name: 'Rizal Day',               date: '2026-12-30', type: 'regular' },
    { name: "New Year's Eve",          date: '2026-12-31', type: 'special_non_working' },
  ];
  for (const h of holidays) {
    await client.query(`
      INSERT INTO holidays (tenant_id, name, date, type) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING
    `, [tenantId, h.name, h.date, h.type]);
  }

  console.log('\n✅ Mock data seeded\n');
  console.log(`Employees:  ${seededEmps.length}`);
  console.log(`Attendance: ~${attDays * 4} log entries over ${workdays.length} workdays`);
  console.log(`Holidays:   ${holidays.length} PH holidays 2026`);
  console.log('\nEmployee logins (password: employee123):');
  for (const e of seededEmps) {
    console.log(`  ${e.email.padEnd(40)} ${e.position}`);
  }
  console.log('\nTo reset:  node scripts/seed-mock-data.js --clean');
}

// ── Main ───────────────────────────────────────────────────────────────────
(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (CLEAN) {
      await clean(client);
    } else {
      await seed(client);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
