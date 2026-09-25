const express = require('express');
const router = express.Router();
const TimeEntry = require('../models/TimeEntry');
const Assignment = require('../models/Assignment');
const { protect, requireRole } = require('../middleware/auth');
const computeAmount = require('../utils/computeAmount');

router.use(protect);

// GET /api/time-entries?consultant=&assignment=&client=&from=&to=
// Consultants only ever see their own entries; admins can see everyone's.
router.get('/', async (req, res) => {
  try {
    const { consultant, assignment, client, from, to } = req.query;
    const filter = {};

    if (req.user.role === 'admin') {
      if (consultant) filter.consultant = consultant;
    } else {
      filter.consultant = req.user._id;
    }

    if (assignment) filter.assignment = assignment;
    if (client) filter.client = client;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const entries = await TimeEntry.find(filter)
      .populate('consultant', 'name')
      .populate('assignment', 'title billingType rate')
      .populate('client', 'name')
      .sort({ date: -1 });

    res.json(entries);
  } catch (err) {
    res.status(500).json({ message: 'Could not load time entries.', error: err.message });
  }
});

// POST /api/time-entries - log time against an assignment
router.post('/', async (req, res) => {
  try {
    const { assignment: assignmentId, date, hours, days, description, billable } = req.body;

    if (!assignmentId || !date) {
      return res.status(400).json({ message: 'Assignment and date are required.' });
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return res.status(404).json({ message: 'Assignment not found.' });

    // Consultants may only log time on assignments they're actually staffed on
    const isAssigned = assignment.consultants.some((c) => c.toString() === req.user._id.toString());
    if (req.user.role !== 'admin' && !isAssigned) {
      return res.status(403).json({ message: 'You are not assigned to this assignment.' });
    }

    if (assignment.billingType === 'hourly' && !hours) {
      return res.status(400).json({ message: 'This assignment is billed hourly - enter hours.' });
    }
    if (assignment.billingType === 'daily' && !days) {
      return res.status(400).json({ message: 'This assignment is billed daily - enter days.' });
    }

    const { amount, rateApplied, billingType } = computeAmount(assignment, { hours, days });

    const entry = await TimeEntry.create({
      consultant: req.user.role === 'admin' && req.body.consultant ? req.body.consultant : req.user._id,
      assignment: assignment._id,
      client: assignment.client,
      date,
      hours: billingType === 'hourly' ? hours : undefined,
      days: billingType === 'daily' ? days : undefined,
      description,
      billable: billable !== undefined ? billable : true,
      billingType,
      rateApplied,
      amount,
    });

    const populated = await entry.populate([
      { path: 'consultant', select: 'name' },
      { path: 'assignment', select: 'title billingType rate' },
      { path: 'client', select: 'name' },
    ]);

    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: 'Could not save time entry.', error: err.message });
  }
});

// PUT /api/time-entries/:id - owner or admin only, and only while not yet invoiced
router.put('/:id', async (req, res) => {
  try {
    const entry = await TimeEntry.findById(req.params.id).populate('assignment');
    if (!entry) return res.status(404).json({ message: 'Time entry not found.' });

    const isOwner = entry.consultant.toString() === req.user._id.toString();
    if (req.user.role !== 'admin' && !isOwner) {
      return res.status(403).json({ message: 'You can only edit your own time entries.' });
    }
    if (entry.invoiced && req.user.role !== 'admin') {
      return res.status(400).json({ message: 'This entry has already been invoiced and can only be changed by an admin.' });
    }

    const { date, hours, days, description, billable } = req.body;
    if (date !== undefined) entry.date = date;
    if (description !== undefined) entry.description = description;
    if (billable !== undefined) entry.billable = billable;

    if (hours !== undefined || days !== undefined) {
      const { amount, rateApplied, billingType } = computeAmount(entry.assignment, { hours, days });
      entry.hours = billingType === 'hourly' ? hours : undefined;
      entry.days = billingType === 'daily' ? days : undefined;
      entry.amount = amount;
      entry.rateApplied = rateApplied;
    }

    await entry.save();
    res.json(entry);
  } catch (err) {
    res.status(400).json({ message: 'Could not update time entry.', error: err.message });
  }
});

// PUT /api/time-entries/:id/invoiced - admin marks entries as invoiced
router.put('/:id/invoiced', requireRole('admin'), async (req, res) => {
  try {
    const entry = await TimeEntry.findByIdAndUpdate(
      req.params.id,
      { invoiced: !!req.body.invoiced },
      { new: true }
    );
    if (!entry) return res.status(404).json({ message: 'Time entry not found.' });
    res.json(entry);
  } catch (err) {
    res.status(400).json({ message: 'Could not update time entry.', error: err.message });
  }
});

// DELETE /api/time-entries/:id - owner (if not invoiced) or admin
router.delete('/:id', async (req, res) => {
  try {
    const entry = await TimeEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Time entry not found.' });

    const isOwner = entry.consultant.toString() === req.user._id.toString();
    if (req.user.role !== 'admin' && !isOwner) {
      return res.status(403).json({ message: 'You can only delete your own time entries.' });
    }
    if (entry.invoiced && req.user.role !== 'admin') {
      return res.status(400).json({ message: 'This entry has already been invoiced.' });
    }

    await entry.deleteOne();
    res.json({ message: 'Time entry deleted.' });
  } catch (err) {
    res.status(400).json({ message: 'Could not delete time entry.', error: err.message });
  }
});

module.exports = router;
