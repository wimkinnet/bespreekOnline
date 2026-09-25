const express = require('express');
const router = express.Router();
const TimeEntry = require('../models/TimeEntry');
const Assignment = require('../models/Assignment');
const { protect, requireRole } = require('../middleware/auth');

router.use(protect, requireRole('admin'));

// GET /api/reports/summary?from=&to=
// Returns totals grouped by client, by consultant, and grand totals, for a date range.
router.get('/summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    const match = {};
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to) match.date.$lte = new Date(to);
    }

    const byClient = await TimeEntry.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$client',
          hours: { $sum: { $ifNull: ['$hours', 0] } },
          days: { $sum: { $ifNull: ['$days', 0] } },
          amount: { $sum: '$amount' },
          entries: { $sum: 1 },
        },
      },
      { $lookup: { from: 'clients', localField: '_id', foreignField: '_id', as: 'client' } },
      { $unwind: '$client' },
      { $project: { clientName: '$client.name', hours: 1, days: 1, amount: 1, entries: 1 } },
      { $sort: { amount: -1 } },
    ]);

    const byConsultant = await TimeEntry.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$consultant',
          hours: { $sum: { $ifNull: ['$hours', 0] } },
          days: { $sum: { $ifNull: ['$days', 0] } },
          amount: { $sum: '$amount' },
          entries: { $sum: 1 },
        },
      },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { consultantName: '$user.name', hours: 1, days: 1, amount: 1, entries: 1 } },
      { $sort: { amount: -1 } },
    ]);

    const byAssignment = await TimeEntry.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$assignment',
          hours: { $sum: { $ifNull: ['$hours', 0] } },
          days: { $sum: { $ifNull: ['$days', 0] } },
          amount: { $sum: '$amount' },
          entries: { $sum: 1 },
          invoicedAmount: { $sum: { $cond: ['$invoiced', '$amount', 0] } },
        },
      },
      { $lookup: { from: 'assignments', localField: '_id', foreignField: '_id', as: 'assignment' } },
      { $unwind: '$assignment' },
      {
        $project: {
          assignmentTitle: '$assignment.title',
          billingType: '$assignment.billingType',
          hours: 1,
          days: 1,
          amount: 1,
          entries: 1,
          invoicedAmount: 1,
        },
      },
      { $sort: { amount: -1 } },
    ]);

    const grandTotal = byClient.reduce((sum, c) => sum + c.amount, 0);

    // Fixed-fee assignments active in range don't generate time-entry amounts,
    // so surface them separately for a complete billing picture.
    const fixedAssignments = await Assignment.find({ billingType: 'fixed' })
      .populate('client', 'name')
      .select('title client rate status');

    res.json({ byClient, byConsultant, byAssignment, grandTotal, fixedAssignments });
  } catch (err) {
    res.status(500).json({ message: 'Could not build report.', error: err.message });
  }
});

module.exports = router;
