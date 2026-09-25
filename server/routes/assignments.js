const express = require('express');
const router = express.Router();
const Assignment = require('../models/Assignment');
const TimeEntry = require('../models/TimeEntry');
const Document = require('../models/Document');
const { protect, requireRole } = require('../middleware/auth');

router.use(protect);

// GET /api/assignments?client=&status=&mine=true
router.get('/', async (req, res) => {
  try {
    const { client, status, mine } = req.query;
    const filter = {};
    if (client) filter.client = client;
    if (status) filter.status = status;
    if (mine === 'true') filter.consultants = req.user._id;

    const assignments = await Assignment.find(filter)
      .populate('client', 'name type')
      .populate('consultants', 'name')
      .sort({ createdAt: -1 });
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: 'Could not load assignments.', error: err.message });
  }
});

// GET /api/assignments/:id
router.get('/:id', async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate('client', 'name type')
      .populate('consultants', 'name email');
    if (!assignment) return res.status(404).json({ message: 'Assignment not found.' });

    const timeEntries = await TimeEntry.find({ assignment: assignment._id })
      .populate('consultant', 'name')
      .sort({ date: -1 });

    const totals = timeEntries.reduce(
      (acc, e) => {
        acc.hours += e.hours || 0;
        acc.days += e.days || 0;
        acc.amount += e.amount || 0;
        return acc;
      },
      { hours: 0, days: 0, amount: 0 }
    );
    if (assignment.billingType === 'fixed') totals.amount = assignment.rate;

    const documents = await Document.find({ assignment: assignment._id }).sort({ createdAt: -1 });

    res.json({ assignment, timeEntries, totals, documents });
  } catch (err) {
    res.status(500).json({ message: 'Could not load assignment.', error: err.message });
  }
});

// POST /api/assignments - admin only
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const assignment = await Assignment.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json(assignment);
  } catch (err) {
    res.status(400).json({ message: 'Could not create assignment.', error: err.message });
  }
});

// PUT /api/assignments/:id - admin only (rate/billing changes shouldn't be casual)
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const assignment = await Assignment.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!assignment) return res.status(404).json({ message: 'Assignment not found.' });
    res.json(assignment);
  } catch (err) {
    res.status(400).json({ message: 'Could not update assignment.', error: err.message });
  }
});

// DELETE /api/assignments/:id - admin only, blocked if time entries exist
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const entryCount = await TimeEntry.countDocuments({ assignment: req.params.id });
    if (entryCount > 0) {
      return res.status(400).json({
        message: `This assignment has ${entryCount} time entr${entryCount === 1 ? 'y' : 'ies'} logged. Remove them first.`,
      });
    }
    const assignment = await Assignment.findByIdAndDelete(req.params.id);
    if (!assignment) return res.status(404).json({ message: 'Assignment not found.' });
    res.json({ message: 'Assignment deleted.' });
  } catch (err) {
    res.status(400).json({ message: 'Could not delete assignment.', error: err.message });
  }
});

module.exports = router;
