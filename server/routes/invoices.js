const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { PassThrough } = require('stream');
const TimeEntry = require('../models/TimeEntry');
const Document = require('../models/Document');
const Assignment = require('../models/Assignment');
const Setting = require('../models/Setting');
const { protect, requireRole } = require('../middleware/auth');
const onfact = require('../utils/onfact');
const renderInvoicePdf = require('../utils/invoicePdf');
const { UPLOAD_ROOT } = require('../middleware/upload');

router.use(protect, requireRole('admin'));

const VAT_RATE = 0.21;

function roundCents(n) {
  return Math.round(n * 100) / 100;
}

// The billable entries of one client, per assignment, with the totals of the invoice
function buildInvoice(client, entries, nonBillableEntries) {
  const assignments = new Map();
  for (const entry of entries) {
    const key = String(entry.assignment?._id);
    if (!assignments.has(key)) assignments.set(key, { title: entry.assignment?.title || '—', amount: 0, entries: [] });
    const assignment = assignments.get(key);
    assignment.entries.push(entry);
    assignment.amount = roundCents(assignment.amount + entry.amount);
  }

  const sum = (field) => roundCents(entries.reduce((total, e) => total + (e[field] || 0), 0));
  const amount = sum('amount');
  const travelAmount = sum('travelAmount');
  const totalExclVat = roundCents(amount + travelAmount);
  const vatAmount = client.vatExempt ? 0 : roundCents(totalExclVat * VAT_RATE);

  return {
    client,
    assignments: [...assignments.values()],
    travel: onfact.travelLine(entries),
    entries: entries.length,
    nonBillableEntries,
    amount,
    travelAmount,
    totalExclVat,
    vatAmount,
    totalInclVat: roundCents(totalExclVat + vatAmount),
    vatRate: VAT_RATE,
  };
}

// All time not yet invoiced, as one invoice per client. Non-billable entries are never charged, so they are
// only counted. A client without billable entries has nothing to invoice and is left out.
async function openInvoices(filter = {}) {
  const entries = await TimeEntry.find({ ...filter, invoiced: { $ne: true } })
    .sort({ date: 1 })
    .populate('client')
    .populate('assignment', 'title')
    .populate('consultant', 'name');
  const billable = new Map();
  const nonBillable = new Map();
  for (const entry of entries) {
    if (!entry.client) continue;
    const key = String(entry.client._id);
    const target = entry.billable === false ? nonBillable : billable;
    target.set(key, [...(target.get(key) || []), entry]);
  }
  return [...billable.entries()]
    .map(([key, list]) => buildInvoice(list[0].client, list, nonBillable.get(key)?.length || 0))
    .sort((a, b) => a.client.name.localeCompare(b.client.name));
}

function safeFileName(client) {
  return client.name.replace(/[^\w-]+/g, '_');
}

// Everything the PDF shows besides the invoice itself. Refuses a country that does not fit the client's VAT treatment.
async function pdfDetails(invoice, brand) {
  const { client } = invoice;
  const country = onfact.invoiceCountry(client);
  const setting = await Setting.findOne({ key: 'company' });
  return {
    ...invoice,
    brand,
    company: setting?.toObject().company || {},
    address: onfact.billingAddress(client) || {},
    contactName: client.billing?.contactName || client.contactName,
    vatNote: client.vatExempt ? onfact.reverseChargeNote(country) : null,
  };
}

// The given assignments that have nothing left to bill. Non-billable entries are never on an invoice, so they do
// not keep an assignment open.
async function fullyInvoicedAssignments(assignmentIds) {
  const assignments = await Assignment.find({ _id: { $in: assignmentIds }, status: { $ne: 'invoiced' } }).select('title');
  const result = [];
  for (const assignment of assignments) {
    const open = { assignment: assignment._id, invoiced: { $ne: true } };
    if (await TimeEntry.exists({ ...open, billable: { $ne: false } })) continue;
    const nonBillableEntries = await TimeEntry.countDocuments(open);
    result.push({ _id: assignment._id, title: assignment.title, nonBillableEntries });
  }
  return result;
}

// GET /api/invoices/open - what can still be invoiced, per client
router.get('/open', async (req, res) => {
  try {
    const invoices = await openInvoices();
    res.json(
      invoices.map((invoice) => ({
        ...invoice,
        client: {
          _id: invoice.client._id,
          name: invoice.client.name,
          vatNumber: invoice.client.vatNumber,
          vatExempt: invoice.client.vatExempt,
        },
        assignments: invoice.assignments.map((a) => ({ title: a.title, entries: a.entries.length, amount: a.amount })),
      }))
    );
  } catch (err) {
    res.status(500).json({ message: 'Could not load the time to invoice.', error: err.message });
  }
});

// GET /api/invoices/:clientId/pdf?brand=bespreek|catalista - specification of one client; marks nothing as invoiced
router.get('/:clientId/pdf', async (req, res) => {
  try {
    const [invoice] = await openInvoices({ client: req.params.clientId });
    if (!invoice) return res.status(404).json({ message: 'Nothing left to invoice for this client.' });
    const details = await pdfDetails(invoice, req.query.brand);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="overzicht-prestaties_${safeFileName(invoice.client)}.pdf"`);
    renderInvoicePdf(details, res);
  } catch (err) {
    if (err instanceof onfact.OnFactError) return res.status(400).json({ message: err.message });
    res.status(500).json({ message: 'Could not create the PDF.', error: err.message });
  }
});

// POST /api/invoices/:clientId/sent { brand, entries } - the client received this invoice: stores the PDF with the
// client's bills and marks exactly the entries on it as invoiced. `entries` is the count the user confirmed.
// Sending itself happens outside the app.
router.post('/:clientId/sent', async (req, res) => {
  let storedPath;
  let storedDocument;
  try {
    const [invoice] = await openInvoices({ client: req.params.clientId });
    if (!invoice) return res.status(404).json({ message: 'Nothing left to invoice for this client.' });
    if (Number(req.body.entries) !== invoice.entries) {
      return res.status(409).json({ message: 'The time of this client has changed. Check the new numbers and try again.' });
    }
    const { client } = invoice;
    const details = await pdfDetails(invoice, req.body.brand);

    const today = new Date().toISOString().slice(0, 10);
    const storedFileName = `${Date.now()}-overzicht-prestaties.pdf`;
    const folder = path.join(UPLOAD_ROOT, String(client._id));
    fs.mkdirSync(folder, { recursive: true });
    storedPath = path.join(folder, storedFileName);
    const pdf = new PassThrough();
    renderInvoicePdf(details, pdf);
    await pipeline(pdf, fs.createWriteStream(storedPath));

    storedDocument = await Document.create({
      client: client._id,
      category: 'bill',
      originalName: `overzicht-prestaties_${safeFileName(client)}_${today}.pdf`,
      storedFileName,
      mimeType: 'application/pdf',
      size: fs.statSync(storedPath).size,
      uploadedBy: req.user._id,
    });

    const entries = invoice.assignments.flatMap((a) => a.entries);
    const { modifiedCount } = await TimeEntry.updateMany(
      { _id: { $in: entries.map((e) => e._id) }, invoiced: { $ne: true } },
      { $set: { invoiced: true, invoiceDocument: storedDocument._id } }
    );
    const assignmentIds = [...new Set(entries.map((e) => e.assignment?._id).filter(Boolean))];
    res.json({
      entriesInvoiced: modifiedCount,
      document: storedDocument.originalName,
      fullyInvoicedAssignments: await fullyInvoicedAssignments(assignmentIds),
    });
  } catch (err) {
    if (err instanceof onfact.OnFactError) return res.status(400).json({ message: err.message });
    // Nothing was marked, so nothing may stay behind that looks like a sent invoice
    if (storedPath && fs.existsSync(storedPath)) fs.unlinkSync(storedPath);
    if (storedDocument) await Document.deleteOne({ _id: storedDocument._id }).catch(() => {});
    res.status(500).json({ message: 'Could not store this invoice.', error: err.message });
  }
});

// POST /api/invoices/assignments/:id/close - the user confirmed this fully invoiced assignment is finished.
// Its remaining non-billable entries are marked too, as Reports does, because invoiced is final.
router.post('/assignments/:id/close', async (req, res) => {
  try {
    const [assignment] = await fullyInvoicedAssignments([req.params.id]);
    if (!assignment) return res.status(400).json({ message: 'This assignment still has time to invoice or is already invoiced.' });
    await TimeEntry.updateMany({ assignment: assignment._id, invoiced: { $ne: true } }, { $set: { invoiced: true } });
    await Assignment.updateOne({ _id: assignment._id }, { $set: { status: 'invoiced' } });
    res.json({ message: `${assignment.title} is now invoiced.` });
  } catch (err) {
    res.status(500).json({ message: 'Could not set this assignment to invoiced.', error: err.message });
  }
});

module.exports = router;
