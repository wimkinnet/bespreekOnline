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
const { renderInvoiceBuffer } = require('../utils/invoicePdf');
const { pdfDetails, belgianDate, nextInvoiceNumber, VAT_RATE } = require('../utils/invoiceData');
const onfact = require('../utils/onfact');

router.use(protect, requireRole('admin'));

const FIELDS = [
  'client', 'title', 'date', 'brand', 'status', 'consultants', 'introduction', 'goal', 'steps',
  'requirements', 'supportDays', 'supportLabel', 'dayRate', 'travelAmount', 'travelNote', 'conditions', 'assignmentMode',
];

function pick(body) {
  return Object.fromEntries(FIELDS.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));
}

function roundCents(n) {
  return Math.round(n * 100) / 100;
}

// One budget line of a step: days at the day rate (or the step's own), hours at a rate, or a fixed amount
function stepLine(step, dayRate) {
  const unit = step.unit || 'days';
  if (unit === 'hours') {
    const hours = Number(step.hours) || 0;
    return { unit, hours, rate: Number(step.rate) || 0, amount: roundCents(hours * (Number(step.rate) || 0)) };
  }
  if (unit === 'amount') return { unit, amount: roundCents(Number(step.rate) || 0) };
  const days = Number(step.days) || 0;
  const rate = Number(step.rate) || dayRate || 0;
  return { unit, days, rate, amount: roundCents(days * rate) };
}

// Quantity and price per budget line, and the totals; travel already known comes last
function budget(proposal) {
  const lines = (proposal.steps || []).map((s, i) => ({ label: `Stap ${i + 1}: ${s.title}`, ...stepLine(s, proposal.dayRate) }));
  if (Number(proposal.supportDays) > 0) {
    lines.push({
      label: proposal.supportLabel || 'Ondersteunend werk',
      ...stepLine({ unit: 'days', days: proposal.supportDays }, proposal.dayRate),
    });
  }
  if (Number(proposal.travelAmount) > 0) {
    lines.push({
      label: `Verplaatsingskosten${proposal.travelNote ? ` (${proposal.travelNote})` : ''}`,
      unit: 'travel',
      amount: roundCents(Number(proposal.travelAmount)),
    });
  }
  const days = lines.reduce((s, l) => s + (l.days || 0), 0);
  const hours = lines.reduce((s, l) => s + (l.hours || 0), 0);
  return { lines, days, hours, amount: roundCents(lines.reduce((s, l) => s + l.amount, 0)) };
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
          ...proposal.steps.map((s, i) => {
            // Each step keeps its own pricing: per day, per hour, or its amount as a fixed fee
            const line = stepLine(s, proposal.dayRate);
            const billing =
              line.unit === 'hours'
                ? { billingType: 'hourly', rate: line.rate }
                : line.unit === 'amount'
                  ? { billingType: 'fixed', rate: line.amount }
                  : { billingType: 'daily', rate: line.rate };
            return {
              title: `Stap ${i + 1}: ${s.title}`,
              description: [from, s.description].filter(Boolean).join('\n\n'),
              ...billing,
            };
          }),
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
    const data = pick(req.body);
    const proposal = await Proposal.create({
      ...data,
      ...(data.status === 'sent' ? { sentAt: new Date() } : {}),
      number: await nextProposalNumber(),
      createdBy: req.user._id,
    });
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
    if (proposal.status === 'sent' && !wasSent) proposal.sentAt = new Date();
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

// POST /api/proposals/:id/invoice - an invoice for an accepted proposal with one line referring to it, for work
// that was already invoiced in detail before; it takes the next invoice number and touches no time logs
router.post('/:id/invoice', async (req, res) => {
  let issued;
  let storedDocument;
  try {
    const proposal = await Proposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ message: 'Proposal not found.' });
    if (proposal.status !== 'accepted') return res.status(400).json({ message: 'Only an accepted proposal can be invoiced.' });
    if (proposal.invoiceNumber) {
      return res.status(400).json({ message: `This proposal was already invoiced as ${proposal.invoiceNumber}.` });
    }
    const client = await Client.findById(proposal.client);
    const totalExclVat = budget(proposal).amount;
    const vatAmount = client.vatExempt ? 0 : roundCents(totalExclVat * VAT_RATE);
    const invoice = {
      client,
      summary: `Prestaties zoals beschreven in offerte ${proposal.number}`,
      totalExclVat,
      vatAmount,
      totalInclVat: roundCents(totalExclVat + vatAmount),
      vatRate: VAT_RATE,
    };
    const { year, iso, date } = belgianDate();
    await pdfDetails(invoice, { brand: proposal.brand, date }); // refuses a problem before a number is used

    issued = await nextInvoiceNumber(year);
    const { number } = issued;
    const pdf = await renderInvoiceBuffer(await pdfDetails(invoice, { brand: proposal.brand, number, date }));
    storedDocument = await Document.create({
      client: client._id,
      category: 'bill',
      originalName: `factuur_${number}_${client.name.replace(/[^\w-]+/g, '_')}.pdf`,
      storedFileName: `invoice-${number}.pdf`,
      mimeType: 'application/pdf',
      size: pdf.length,
      uploadedBy: req.user._id,
      notes: `Invoice date ${iso}, for proposal ${proposal.number}`,
      invoiceNumber: number,
      pdf,
      totalExclVat,
      vatAmount,
      proposal: proposal._id,
    });
    proposal.invoiceNumber = number;
    await proposal.save();
    res.json({ invoiceNumber: number, document: { _id: storedDocument._id, originalName: storedDocument.originalName } });
  } catch (err) {
    // No invoice may stay behind, and an unused last number goes back so the series has no gap
    if (storedDocument) await Document.deleteOne({ _id: storedDocument._id }).catch(() => {});
    if (issued) {
      await Setting.updateOne({ key: issued.key, sequence: issued.sequence }, { $inc: { sequence: -1 } }).catch(() => {});
    }
    if (err instanceof onfact.OnFactError) return res.status(400).json({ message: err.message });
    res.status(500).json({ message: 'Could not create the invoice.', error: err.message });
  }
});

// DELETE /api/proposals/:id - not once it created assignments
router.delete('/:id', async (req, res) => {
  try {
    const proposal = await Proposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ message: 'Proposal not found.' });
    if (proposal.createdAssignments.length || proposal.invoiceNumber) {
      return res.status(400).json({ message: 'This proposal created assignments or an invoice, so it is kept.' });
    }
    await proposal.deleteOne();
    res.json({ message: 'Proposal deleted.' });
  } catch (err) {
    res.status(400).json({ message: 'Could not delete the proposal.', error: err.message });
  }
});

module.exports = router;
