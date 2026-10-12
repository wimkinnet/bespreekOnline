const express = require('express');
const router = express.Router();
const TimeEntry = require('../models/TimeEntry');
const TravelClaim = require('../models/TravelClaim');
const Setting = require('../models/Setting');
const User = require('../models/User');
const { protect, requireRole } = require('../middleware/auth');
const { ANNUAL_RATES, officialRateFor, claimKm, KmRateError } = require('../utils/kmRates');
const renderTravelClaimPdf = require('../utils/travelClaimPdf');

router.use(protect, requireRole('admin'));

function roundCents(n) {
  return Math.round(n * 100) / 100;
}

function formatAddress(address) {
  if (!address) return '';
  return [address.street, [address.postalCode, address.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

// What is still missing to issue a valid expense claim
function missingDetails(company, consultant) {
  const missing = [];
  if (!company.name) missing.push('company name');
  if (!company.street || !company.postalCode || !company.city) missing.push('company address');
  if (!company.enterpriseNumber) missing.push('company enterprise number');
  const home = consultant.homeAddress || {};
  if (!home.street || !home.postalCode || !home.city) missing.push("consultant's home address");
  if (!consultant.iban) missing.push("consultant's IBAN");
  return missing;
}

// Trips of a consultant in a period whose travel is not yet on an expense claim,
// valued at the official km rate of each trip's date
async function buildClaim({ consultant, from, to }) {
  const match = {
    consultant,
    travelClaim: null,
    $or: [{ travelIncluded: true }, { travelAmount: { $gt: 0 } }],
  };
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = new Date(from);
    if (to) match.date.$lte = new Date(to);
  }
  const entries = await TimeEntry.find(match)
    .sort({ date: 1 })
    .populate('client', 'name address')
    .populate('assignment', 'title');

  const lines = [];
  let clientCharged = 0;
  for (const e of entries) {
    const { km, estimated } = claimKm(e);
    if (!km) continue;
    const { rate } = officialRateFor(e.date);
    clientCharged += e.travelAmount || 0;
    lines.push({
      timeEntry: e._id,
      date: e.date,
      clientName: e.client?.name || '',
      destination: e.client?.address?.city || formatAddress(e.client?.address),
      assignmentTitle: e.assignment?.title || '',
      km,
      kmEstimated: estimated,
      rate,
      amount: roundCents(km * rate),
    });
  }
  const totalKm = Math.round(lines.reduce((s, l) => s + l.km, 0) * 10) / 10;
  const totalAmount = roundCents(lines.reduce((s, l) => s + l.amount, 0));
  const usedRates = ANNUAL_RATES.filter((r) => lines.some((l) => l.rate === r.rate));
  return { lines, totalKm, totalAmount, clientCharged: roundCents(clientCharged), rates: usedRates };
}

async function loadParties(consultantId) {
  const [setting, consultant] = await Promise.all([
    Setting.findOne({ key: 'company' }),
    User.findById(consultantId),
  ]);
  return { company: setting?.toObject().company || {}, consultant };
}

// GET /api/travel-claims/preview?consultant=&from=&to=
router.get('/preview', async (req, res) => {
  try {
    const { consultant: consultantId, from, to } = req.query;
    const { company, consultant } = await loadParties(consultantId);
    if (!consultant) return res.status(404).json({ message: 'Consultant not found.' });
    const claim = await buildClaim({ consultant: consultant._id, from, to });
    res.json({ ...claim, missing: missingDetails(company, consultant) });
  } catch (err) {
    if (err instanceof KmRateError) return res.status(422).json({ message: err.message });
    res.status(500).json({ message: 'Could not prepare the expense claim.', error: err.message });
  }
});

// GET /api/travel-claims?consultant= - issued claims, newest first
router.get('/', async (req, res) => {
  try {
    const filter = req.query.consultant ? { consultant: req.query.consultant } : {};
    const claims = await TravelClaim.find(filter)
      .select('number issueDate periodFrom periodTo totalKm totalAmount consultant year sequence')
      .sort({ year: -1, sequence: -1 });
    res.json(claims);
  } catch (err) {
    res.status(500).json({ message: 'Could not load expense claims.', error: err.message });
  }
});

// POST /api/travel-claims { consultant, from, to }
// Issues a numbered expense claim and locks the travel of its time entries.
router.post('/', async (req, res) => {
  try {
    const { consultant: consultantId, from, to } = req.body;
    const { company, consultant } = await loadParties(consultantId);
    if (!consultant) return res.status(404).json({ message: 'Consultant not found.' });
    const missing = missingDetails(company, consultant);
    if (missing.length) return res.status(400).json({ message: `Missing: ${missing.join(', ')}.` });

    const claim = await buildClaim({ consultant: consultant._id, from, to });
    if (!claim.lines.length) return res.status(400).json({ message: 'No unclaimed trips in this period.' });

    const issueDate = new Date();
    const year = issueDate.getFullYear();
    const last = await TravelClaim.findOne({ consultant: consultant._id, year }).sort({ sequence: -1 });
    const sequence = (last?.sequence || 0) + 1;
    const home = consultant.homeAddress || {};

    const doc = await TravelClaim.create({
      consultant: consultant._id,
      year,
      sequence,
      number: `KM-${year}-${String(sequence).padStart(3, '0')}`,
      issueDate,
      periodFrom: from ? new Date(from) : claim.lines[0].date,
      periodTo: to ? new Date(to) : claim.lines[claim.lines.length - 1].date,
      beneficiary: {
        name: consultant.name,
        street: home.street,
        postalCode: home.postalCode,
        city: home.city,
        country: home.country,
        iban: consultant.iban,
      },
      company,
      lines: claim.lines,
      rates: claim.rates,
      totalKm: claim.totalKm,
      totalAmount: claim.totalAmount,
      createdBy: req.user._id,
    });

    await TimeEntry.updateMany(
      { _id: { $in: claim.lines.map((l) => l.timeEntry) } },
      { $set: { travelClaim: doc._id } }
    );
    res.status(201).json(doc);
  } catch (err) {
    if (err instanceof KmRateError) return res.status(422).json({ message: err.message });
    res.status(400).json({ message: 'Could not issue the expense claim.', error: err.message });
  }
});

// GET /api/travel-claims/:id/pdf
router.get('/:id/pdf', async (req, res) => {
  try {
    const claim = await TravelClaim.findById(req.params.id);
    if (!claim) return res.status(404).json({ message: 'Expense claim not found.' });
    const safeName = claim.beneficiary.name.replace(/[^\w-]+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${claim.number}_${safeName}.pdf"`);
    renderTravelClaimPdf(claim, res);
  } catch (err) {
    res.status(500).json({ message: 'Could not create the PDF.', error: err.message });
  }
});

// DELETE /api/travel-claims/:id - only the latest claim of a consultant's series, so numbering has no gaps
router.delete('/:id', async (req, res) => {
  try {
    const claim = await TravelClaim.findById(req.params.id);
    if (!claim) return res.status(404).json({ message: 'Expense claim not found.' });
    const later = await TravelClaim.exists({ consultant: claim.consultant, year: claim.year, sequence: { $gt: claim.sequence } });
    if (later) return res.status(400).json({ message: 'Only the most recent expense claim of a consultant can be withdrawn.' });

    await TimeEntry.updateMany({ travelClaim: claim._id }, { $set: { travelClaim: null } });
    await claim.deleteOne();
    res.json({ message: `Expense claim ${claim.number} withdrawn.` });
  } catch (err) {
    res.status(400).json({ message: 'Could not withdraw the expense claim.', error: err.message });
  }
});

module.exports = router;
