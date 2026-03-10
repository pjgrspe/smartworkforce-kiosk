const express = require('express');
const router  = express.Router();
const AttendanceCorrectionRequest = require('../models/AttendanceCorrectionRequest');
const { authenticate, authorize } = require('../middleware/auth');
const logger  = require('../utils/logger');

router.use(authenticate);

// GET /api/corrections?status=pending&employeeId=xxx
router.get('/', async (req, res) => {
  try {
    const filter = { tenantId: req.user.tenantId };
    if (req.query.status)     filter.status     = req.query.status;
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;

    const corrections = await AttendanceCorrectionRequest.find(filter)
      .populate('employeeId',  'firstName lastName employeeCode')
      .populate('requestedBy', 'firstName lastName email')
      .populate('reviewedBy',  'firstName lastName email')
      .sort('-createdAt').lean();
    return res.json({ data: corrections });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/corrections — submit a correction request
router.post('/', async (req, res) => {
  try {
    const correction = await new AttendanceCorrectionRequest({
      ...req.body,
      tenantId:    req.user.tenantId,
      requestedBy: req.user.sub,
      status:      'pending'
    }).save();
    logger.info(`Correction request created: ${correction._id}`);
    return res.status(201).json({ data: correction.toObject() });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/corrections/:id/approve
router.patch(
  '/:id/approve',
  authorize('super_admin', 'client_admin', 'hr_payroll', 'branch_manager'),
  async (req, res) => {
    try {
      const correction = await AttendanceCorrectionRequest.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.user.tenantId, status: 'pending' },
        { status: 'approved', reviewedBy: req.user.sub, reviewedAt: new Date(), reviewNotes: req.body.notes },
        { new: true }
      ).lean();
      if (!correction) return res.status(404).json({ error: 'Not found or already reviewed' });
      logger.info(`Correction ${req.params.id} approved by ${req.user.email}`);
      return res.json({ data: correction });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

// PATCH /api/corrections/:id/reject
router.patch(
  '/:id/reject',
  authorize('super_admin', 'client_admin', 'hr_payroll', 'branch_manager'),
  async (req, res) => {
    try {
      const correction = await AttendanceCorrectionRequest.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.user.tenantId, status: 'pending' },
        { status: 'rejected', reviewedBy: req.user.sub, reviewedAt: new Date(), reviewNotes: req.body.notes },
        { new: true }
      ).lean();
      if (!correction) return res.status(404).json({ error: 'Not found or already reviewed' });
      return res.json({ data: correction });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
