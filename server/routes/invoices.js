const express = require('express');
const router = express.Router();
const TimeEntry = require('../models/TimeEntry');
const Setting = require('../models/Setting');
const { protect, requireRole } = require('../middleware/auth');
const onfact = require('../utils/onfact');
const renderInvoicePdf = require('../utils/invoicePdf');

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
    .populate('assignment', 'title');
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

// GET /api/invoices/:clientId/pdf - specification of one client; marks nothing as invoiced
router.get('/:clientId/pdf', async (req, res) => {
  try {
    const [invoice] = await openInvoices({ client: req.params.clientId });
    if (!invoice) return res.status(404).json({ message: 'Nothing left to invoice for this client.' });
    const { client } = invoice;
    const country = onfact.invoiceCountry(client);
    const setting = await Setting.findOne({ key: 'company' });
    const safeName = client.name.replace(/[^\w-]+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="factuurspecificatie_${safeName}.pdf"`);
    renderInvoicePdf(
      {
        ...invoice,
        company: setting?.toObject().company || {},
        address: onfact.billingAddress(client) || {},
        contactName: client.billing?.contactName || client.contactName,
        vatNote: client.vatExempt ? onfact.reverseChargeNote(country) : null,
      },
      res
    );
  } catch (err) {
    if (err instanceof onfact.OnFactError) return res.status(400).json({ message: err.message });
    res.status(500).json({ message: 'Could not create the PDF.', error: err.message });
  }
});

module.exports = router;
