const Employee = require('../../models/Employee');
const Branch = require('../../models/Branch');
const Department = require('../../models/Department');
const Schedule = require('../../models/Schedule');

function getArchivedEmployeeCode(employeeCode) {
  return `${employeeCode}__archived__${Date.now().toString(36)}`;
}

async function releaseInactiveEmployeeCodeReservation(tenantId, employeeCode) {
  if (!employeeCode) return;

  const inactiveEmployee = await Employee.findOne({
    tenantId,
    employeeCode,
    isActive: false,
  }).select('_id employeeCode email').lean();

  if (!inactiveEmployee) return;

  const archivedSuffix = Date.now().toString(36);
  await Employee.findByIdAndUpdate(inactiveEmployee._id, {
    $set: {
      employeeCode: getArchivedEmployeeCode(inactiveEmployee.employeeCode),
      ...(inactiveEmployee.email ? { email: `${inactiveEmployee.email}.archived.${archivedSuffix}` } : {}),
    },
  });
}

async function ensureEmployeeCodeAvailable(tenantId, employeeCode, currentEmployeeId = null) {
  if (!employeeCode) return;

  const existingEmployee = await Employee.findOne({
    tenantId,
    employeeCode,
    ...(currentEmployeeId ? { _id: { $ne: currentEmployeeId } } : {}),
  }).select('_id isActive').lean();

  if (!existingEmployee) return;

  if (existingEmployee.isActive) {
    const err = new Error(`Employee code "${employeeCode}" is already in use.`);
    err.code = 'DUPLICATE_EMPLOYEE_CODE';
    throw err;
  }

  await releaseInactiveEmployeeCodeReservation(tenantId, employeeCode);
}

async function validateEmployeeRelations(payload, tenantId) {
  if (!payload.branchId) {
    throw new Error('branchId is required');
  }

  const branch = await Branch.findOne({ _id: payload.branchId, tenantId }).select('_id').lean();
  if (!branch) {
    throw new Error('Invalid branch for current tenant');
  }

  if (payload.departmentId) {
    const department = await Department.findOne({ _id: payload.departmentId, tenantId }).select('_id').lean();
    if (!department) throw new Error('Invalid department for current tenant');
  }

  if (payload.scheduleId) {
    const schedule = await Schedule.findOne({ _id: payload.scheduleId, tenantId }).select('_id').lean();
    if (!schedule) throw new Error('Invalid schedule for current tenant');
  }
}

async function getProfile({ user }) {
  return Employee.findOne({
    _id: user.employeeId,
    tenantId: user.tenantId,
    isActive: true,
  })
    .select('-faceData.encodings -faceData.reEnrollmentHistory')
    .populate('branchId', 'name code')
    .lean();
}

async function listActive({ user }) {
  const filter = {
    tenantId: user.tenantId,
    isActive: true,
  };

  if (user.role !== 'super_admin' && user.branchId) {
    filter.branchId = user.branchId;
  }

  return Employee.find(filter)
    .select('-faceData.encodings -faceData.reEnrollmentHistory')
    .sort('lastName')
    .lean();
}

async function listActiveForPayroll({ tenantId, branchId }) {
  return Employee.find({
    tenantId,
    ...(branchId ? { branchId } : {}),
    isActive: true,
    'employment.status': 'active',
  }).lean();
}

async function getById({ user, id }) {
  const filter = {
    _id: id,
    tenantId: user.tenantId,
  };

  if (user.role !== 'super_admin' && user.branchId) {
    filter.branchId = user.branchId;
  }

  return Employee.findOne(filter).lean();
}

async function findActiveEmployeeById({ id, tenantId }) {
  return Employee.findOne({ _id: id, tenantId, isActive: true }).lean();
}

async function createEmployee({ user, payload }) {
  await validateEmployeeRelations(payload, user.tenantId);
  await ensureEmployeeCodeAvailable(user.tenantId, payload.employeeCode);

  const emp = await new Employee(payload).save();
  return emp.toObject();
}

async function updateEmployee({ user, id, patch }) {
  const emp = await Employee.findById(id);
  if (!emp || emp.tenantId.toString() !== user.tenantId) {
    return null;
  }

  if (patch.employeeCode && patch.employeeCode !== emp.employeeCode) {
    await ensureEmployeeCodeAvailable(user.tenantId, patch.employeeCode, emp._id);
  }

  const nextRelations = {
    branchId: patch.branchId || emp.branchId,
    departmentId: Object.prototype.hasOwnProperty.call(patch, 'departmentId') ? patch.departmentId : emp.departmentId,
    scheduleId: Object.prototype.hasOwnProperty.call(patch, 'scheduleId') ? patch.scheduleId : emp.scheduleId,
  };

  await validateEmployeeRelations(nextRelations, user.tenantId);

  return Employee.findByIdAndUpdate(
    id,
    { $set: patch },
    { new: true, runValidators: true }
  ).lean();
}

async function enrollFace({ user, id, descriptors }) {
  return Employee.findOneAndUpdate(
    { _id: id, tenantId: user.tenantId },
    {
      $set: {
        'faceData.faceApiDescriptors': descriptors,
        'faceData.enrollmentDate': new Date(),
        'faceData.enrollmentBranchId': user.branchId || null,
      },
      $push: {
        'faceData.reEnrollmentHistory': {
          enrolledAt: new Date(),
          enrolledBy: user.sub,
          note: `Browser enrollment - ${descriptors.length} sample(s)`,
        },
      },
    },
    { new: true, runValidators: false }
  ).lean();
}

async function softDeleteEmployee({ user, id }) {
  const emp = await Employee.findById(id);
  if (!emp || emp.tenantId.toString() !== user.tenantId) {
    return null;
  }

  await Employee.findByIdAndUpdate(id, {
    $set: {
      isActive: false,
      employeeCode: getArchivedEmployeeCode(emp.employeeCode),
      ...(emp.email ? { email: `${emp.email}.archived.${Date.now().toString(36)}` } : {}),
      'employment.status': 'inactive',
    },
  });

  return true;
}

module.exports = {
  getProfile,
  listActive,
  listActiveForPayroll,
  getById,
  findActiveEmployeeById,
  createEmployee,
  updateEmployee,
  enrollFace,
  softDeleteEmployee,
};
