const express = require('express');
const router = express.Router();
const TimeEntry = require('../models/TimeEntry');
const Assignment = require('../models/Assignment');
const { protect, requireRole } = require('../middleware/auth');
const Client = require('../models/Client');
const User = require('../models/User');
const computeAmount = require('../utils/computeAmount');
const { travelForConsultant, travelRatePerKm, DistanceError } = require('../utils/distance');

router.use(protect);

// Travel fields for a time entry. Uses the km the consultant confirmed (they may correct the
// suggested distance), or looks up the round-trip distance from their home address to the client.
// The rate per km is chosen per entry; without one, the default from TRAVEL_RATE_PER_KM applies.
async function computeTravel({ includeTravel, travelKm, travelRate }, consultantId, clientId) {
  if (!includeTravel) {
    return { travelIncluded: false, travelKm: undefined, travelRate: undefined, travelAmount: 0 };
  }
  let km = travelKm !== undefined && travelKm !== '' && travelKm !== null ? Number(travelKm) : null;
  if (km !== null && (!Number.isFinite(km) || km < 0)) {
    throw new DistanceError('Travel distance must be a positive number of km.');
  }
  if (km === null) {
    const [consultant, client] = await Promise.all([
      User.findById(consultantId).select('name homeAddress'),
      Client.findById(clientId).select('name address'),
    ]);
    km = (await travelForConsultant(consultant, client)).roundTripKm;
  }
  const rate =
    travelRate !== undefined && travelRate !== '' && travelRate !== null ? Number(travelRate) : travelRatePerKm();
  if (!Number.isFinite(rate) || rate < 0) {
    throw new DistanceError('Travel rate must be a positive amount per km.');
  }
  return { travelIncluded: true, travelKm: km, travelRate: rate, travelAmount: Math.round(km * rate * 100) / 100 };
}

// A fixed fee is billed by registering (parts of) it; the registered total may not exceed the fee.
// Returns an error message, or null when the amount is valid.
async function validateFeeAmount(assignment, feeAmount, excludeEntryId) {
  const fee = Number(feeAmount);
  if (!Number.isFinite(fee) || fee <= 0) return 'This is a fixed-fee assignment - enter the amount to bill.';
  const others = await TimeEntry.find({ assignment: assignment._id, _id: { $ne: excludeEntryId } }).select('amount');
  const alreadyBilled = others.reduce((sum, e) => sum + (e.amount || 0), 0);
  const remaining = Math.round((assignment.rate - alreadyBilled) * 100) / 100;
  if (fee > remaining + 0.005) {
    return `Only €${remaining.toFixed(2)} of the €${assignment.rate.toFixed(2)} fixed fee is left to bill.`;
  }
  return null;
}

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
    const {
      assignment: assignmentId,
      date,
      hours,
      days,
      feeAmount,
      description,
      billable,
      includeTravel,
      travelKm,
      travelRate,
    } = req.body;

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
    if (['daily', 'half_day'].includes(assignment.billingType) && !days) {
      return res.status(400).json({ message: 'This assignment is billed per (half) day - enter days.' });
    }
    if (assignment.billingType === 'half_day' && (days * 2) % 1 !== 0) {
      return res.status(400).json({ message: 'This assignment is billed per half day - enter days in steps of 0.5.' });
    }

    if (assignment.billingType === 'fixed') {
      const feeError = await validateFeeAmount(assignment, feeAmount);
      if (feeError) return res.status(400).json({ message: feeError });
    }

    const { amount, rateApplied, billingType } = computeAmount(assignment, { hours, days, feeAmount });
    const consultantId = req.user.role === 'admin' && req.body.consultant ? req.body.consultant : req.user._id;
    const travel = await computeTravel({ includeTravel, travelKm, travelRate }, consultantId, assignment.client);

    const entry = await TimeEntry.create({
      consultant: consultantId,
      assignment: assignment._id,
      client: assignment.client,
      date,
      hours: billingType === 'hourly' ? hours : undefined,
      days: billingType === 'hourly' ? undefined : days || undefined,
      description,
      billable: billable !== undefined ? billable : true,
      billingType,
      rateApplied,
      amount,
      ...travel,
    });

    const populated = await entry.populate([
      { path: 'consultant', select: 'name' },
      { path: 'assignment', select: 'title billingType rate' },
      { path: 'client', select: 'name' },
    ]);

    res.status(201).json(populated);
  } catch (err) {
    if (err instanceof DistanceError) return res.status(422).json({ message: err.message });
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

    const { date, hours, days, feeAmount, description, billable, includeTravel, travelKm, travelRate } = req.body;
    if (date !== undefined) entry.date = date;
    if (description !== undefined) entry.description = description;
    if (billable !== undefined) entry.billable = billable;

    if (hours !== undefined || days !== undefined || feeAmount !== undefined) {
      const isFixed = entry.assignment.billingType === 'fixed';
      const fee = feeAmount !== undefined ? feeAmount : entry.amount;
      if (isFixed) {
        const feeError = await validateFeeAmount(entry.assignment, fee, entry._id);
        if (feeError) return res.status(400).json({ message: feeError });
      }
      const { amount, rateApplied, billingType } = computeAmount(entry.assignment, {
        hours: hours !== undefined ? hours : entry.hours,
        days: days !== undefined ? days : entry.days,
        feeAmount: fee,
      });
      entry.hours = billingType === 'hourly' ? (hours !== undefined ? hours : entry.hours) : undefined;
      entry.days = billingType === 'hourly' ? undefined : (days !== undefined ? days : entry.days) || undefined;
      entry.amount = amount;
      entry.rateApplied = rateApplied;
    }

    if (includeTravel !== undefined || travelKm !== undefined || travelRate !== undefined) {
      const travel = await computeTravel(
        {
          includeTravel: includeTravel !== undefined ? includeTravel : entry.travelIncluded,
          travelKm: travelKm !== undefined ? travelKm : entry.travelKm,
          travelRate: travelRate !== undefined ? travelRate : entry.travelRate,
        },
        entry.consultant,
        entry.client
      );
      Object.assign(entry, travel);
    }

    await entry.save();
    res.json(entry);
  } catch (err) {
    if (err instanceof DistanceError) return res.status(422).json({ message: err.message });
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
