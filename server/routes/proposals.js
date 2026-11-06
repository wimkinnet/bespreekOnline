const express = require('express');
const router = express.Router();
const { PassThrough } = require('stream');
const Proposal = require('../models/Proposal');
const Assignment = require('../models/Assignment');
const Client = require('../models/Client');
const Setting = require('../models/Setting');
const User = require('../models/User');
const Document = require('../models/Document');
const { protect, requireRole } = require('../middleware/auth');
const { renderProposalPdf, renderProposalBuffer } = require('../utils/proposalPdf');

router.use(protect, requireRole('admin'));

const FIELDS = [
  'client', 'title', 'date', 'brand', 'status', 'consultants', 'introduction', 'goal', 'steps',
  'requirements', 'supportDays', 'supportLabel', 'dayRate', 'conditions', 'assignmentMode',
];

function pick(body) {
  return Object.fromEntries(FIELDS.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));
}

function roundCents(n) {
  return Math.round(n * 100) / 100;
}

// Days and price per budget line, and the totals
function budget(proposal) {
  const rate = proposal.dayRate || 0;
  const lines = (proposal.steps || []).map((s, i) => ({
    label: `Stap ${i + 1}: ${s.title}`,
    days: Number(s.days) || 0,
    amount: roundCents((Number(s.days) || 0) * rate),
  }));
  if (Number(proposal.supportDays) > 0) {
    lines.push({
      label: proposal.supportLabel || 'Ondersteunend werk',
      days: Number(proposal.supportDays),
      amount: roundCents(Number(proposal.supportDays) * rate),
    });
  }
  const days = lines.reduce((s, l) => s + l.days, 0);
  return { lines, days, amount: roundCents(lines.reduce((s, l) => s + l.amount, 0)) };
}

// O + YY + a sequence per year, e.g. O260001
async function nextProposalNumber() {
  const year = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric' }).format(new Date());
  const { sequence } = await Setting.findOneAndUpdate(
    { key: `proposalSequence:${year}` },
    { $inc: { sequence: 1 } },
    { upsert: true, new: true }
  );
  return `O${year.slice(-2)}${String(sequence).padStart(4, '0')}`;
}

// The assignments an accepted proposal describes, billed per day at the proposal's rate
async function createAssignments(proposal, userId) {
  const common = {
    client: proposal.client,
    billingType: 'daily',
    rate: proposal.dayRate,
    status: 'active',
    consultants: proposal.consultants,
    createdBy: userId,
  };
  const from = `Uit offerte ${proposal.number}`;
  const plans =
    proposal.assignmentMode === 'single'
      ? [{ title: proposal.title, description: from }]
      : [
          ...proposal.steps.map((s, i) => ({
            title: `Stap ${i + 1}: ${s.title}`,
            description: [from, s.description].filter(Boolean).join('\n\n'),
          })),
          ...(proposal.supportDays > 0 ? [{ title: proposal.supportLabel || 'Ondersteunend werk', description: from }] : []),
        ];
  const created = await Assignment.insertMany(plans.map((p) => ({ ...common, ...p })));
  return created.map((a) => a._id);
}

async function pdfData(proposal) {
  const [client, consultants, setting] = await Promise.all([
    Client.findById(proposal.client),
    User.find({ _id: { $in: proposal.consultants || [] } }).select('name jobTitle bio +photo photoType'),
    Setting.findOne({ key: 'company' }),
  ]);
  // Keep the order in which the consultants were chosen
  const ordered = (proposal.consultants || [])
    .map((id) => consultants.find((c) => String(c._id) === String(id)))
    .filter(Boolean);
  return { ...proposal, client, consultants: ordered, company: setting?.toObject().company || {}, budget: budget(proposal) };
}

function sendPdf(res, data, fileName) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  const stream = new PassThrough();
  stream.pipe(res);
  renderProposalPdf(data, stream);
}

const fileName = (p, client) => `offerte_${p.number || 'concept'}_${(client?.name || '').replace(/[^\w-]+/g, '_')}.pdf`;

// Keeps the PDF as sent with the client's documents; each time a proposal is set to Sent, its version then
async function storeSentPdf(proposal, userId) {
  const data = await pdfData(proposal.toObject());
  const pdf = await renderProposalBuffer(data);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
  const doc = await Document.create({
    client: proposal.client,
    category: 'proposal',
    originalName: fileName(proposal, data.client).replace(/\.pdf$/, `_${today}.pdf`),
    storedFileName: `proposal-${proposal.number}-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    size: pdf.length,
    uploadedBy: userId,
    notes: `Proposal ${proposal.number}, sent on ${today}`,
    pdf,
  });
  return doc.originalName;
}

// GET /api/proposals - newest first, with the totals
router.get('/', async (req, res) => {
  try {
    const proposals = await Proposal.find().populate('client', 'name').sort({ createdAt: -1 });
    res.json(proposals.map((p) => ({ ...p.toObject(), budget: budget(p) })));
  } catch (err) {
    res.status(500).json({ message: 'Could not load proposals.', error: err.message });
  }
});

// GET /api/proposals/:id
router.get('/:id', async (req, res) => {
  try {
    const proposal = await Proposal.findById(req.params.id).populate('createdAssignments', 'title status');
    if (!proposal) return res.status(404).json({ message: 'Proposal not found.' });
    res.json(proposal);
  } catch (err) {
    res.status(500).json({ message: 'Could not load the proposal.', error: err.message });
  }
});

// POST /api/proposals/preview - the PDF of unsaved edits, so the dialog can show them; stores nothing
router.post('/preview', async (req, res) => {
  try {
    const data = await pdfData({ number: req.body.number, ...pick(req.body) });
    if (!data.client) return res.status(400).json({ message: 'Choose a client first.' });
    sendPdf(res, data, fileName(data, data.client));
  } catch (err) {
    res.status(500).json({ message: 'Could not create the PDF.', error: err.message });
  }
});

// POST /api/proposals
router.post('/', async (req, res) => {
  try {
    const proposal = await Proposal.create({ ...pick(req.body), number: await nextProposalNumber(), createdBy: req.user._id });
    const storedDocument = proposal.status === 'sent' ? await storeSentPdf(proposal, req.user._id) : null;
    res.status(201).json({ proposal, storedDocument });
  } catch (err) {
    res.status(400).json({ message: 'Could not save the proposal.', error: err.message });
  }
});

// PUT /api/proposals/:id - accepting it creates its assignments once, when that option is chosen
router.put('/:id', async (req, res) => {
  try {
    const proposal = await Proposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ message: 'Proposal not found.' });
    const wasSent = proposal.status === 'sent';
    proposal.set(pick(req.body));
    let createdNow = [];
    if (proposal.status === 'accepted' && proposal.assignmentMode !== 'none' && proposal.createdAssignments.length === 0) {
      await proposal.validate();
      createdNow = await createAssignments(proposal, req.user._id);
      proposal.createdAssignments = createdNow;
    }
    await proposal.save();
    const storedDocument = proposal.status === 'sent' && !wasSent ? await storeSentPdf(proposal, req.user._id) : null;
    await proposal.populate('createdAssignments', 'title status');
    res.json({ proposal, assignmentsCreated: createdNow.length, storedDocument });
  } catch (err) {
    res.status(400).json({ message: 'Could not save the proposal.', error: err.message });
  }
});

// GET /api/proposals/:id/pdf
router.get('/:id/pdf', async (req, res) => {
  try {
    const proposal = await Proposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ message: 'Proposal not found.' });
    const data = await pdfData(proposal.toObject());
    sendPdf(res, data, fileName(proposal, data.client));
  } catch (err) {
    res.status(500).json({ message: 'Could not create the PDF.', error: err.message });
  }
});

// DELETE /api/proposals/:id - not once it created assignments
router.delete('/:id', async (req, res) => {
  try {
    const proposal = await Proposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ message: 'Proposal not found.' });
    if (proposal.createdAssignments.length) {
      return res.status(400).json({ message: 'This proposal created assignments, so it is kept.' });
    }
    await proposal.deleteOne();
    res.json({ message: 'Proposal deleted.' });
  } catch (err) {
    res.status(400).json({ message: 'Could not delete the proposal.', error: err.message });
  }
});

module.exports = router;
