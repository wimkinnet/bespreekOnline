const express = require('express');
const router = express.Router();
const { PassThrough } = require('stream');
const TimeEntry = require('../models/TimeEntry');
const Document = require('../models/Document');
const Setting = require('../models/Setting');
const { protect, requireRole } = require('../middleware/auth');
const onfact = require('../utils/onfact');
const { invoiceTotals, openInvoices, pdfDetails } = require('../utils/invoiceData');
const { renderInvoicePdf, renderInvoiceBuffer, PAYMENT_TERM_DAYS } = require('../utils/invoicePdf');

router.use(protect, requireRole('admin'));

function safeFileName(client) {
  return client.name.replace(/[^\w-]+/g, '_');
}

// Today in Belgium, which is the invoice date and decides the year of the number
function belgianDate() {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date()).split('-');
  return { year, iso: `${year}-${month}-${day}`, date: new Date(`${year}-${month}-${day}T00:00:00Z`) };
}

// YYNNNN: the last two digits of the year and a sequence stored per year
async function nextInvoiceNumber(year) {
  const key = `invoiceSequence:${year}`;
  const { sequence } = await Setting.findOneAndUpdate({ key }, { $inc: { sequence: 1 } }, { upsert: true, new: true });
  return { key, sequence, number: `${year.slice(-2)}${String(sequence).padStart(4, '0')}` };
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

// The invoice date is the day it was created in Belgium; the due date follows from the payment term
function dueDate(createdAt) {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(createdAt);
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + PAYMENT_TERM_DAYS * 24 * 60 * 60 * 1000);
}

// GET /api/invoices/created - the invoices made so far, newest number first
router.get('/created', async (req, res) => {
  try {
    const documents = await Document.find({ invoiceNumber: { $exists: true } })
      .populate('client', 'name vatNumber vatExempt')
      .sort({ invoiceNumber: -1 });
    const entries = await TimeEntry.find({ invoiceNumber: { $in: documents.map((d) => d.invoiceNumber) } }).select(
      'invoiceNumber amount travelAmount'
    );
    res.json(
      documents.map((d) => ({
        _id: d._id,
        invoiceNumber: d.invoiceNumber,
        originalName: d.originalName,
        createdAt: d.createdAt,
        dueDate: dueDate(d.createdAt),
        paidAt: d.paidAt,
        client: d.client,
        ...invoiceTotals(entries.filter((e) => e.invoiceNumber === d.invoiceNumber), d.client?.vatExempt),
      }))
    );
  } catch (err) {
    res.status(500).json({ message: 'Could not load the invoices.', error: err.message });
  }
});

// PUT /api/invoices/created/:id/paid { paidAt: 'yyyy-mm-dd' | null } - marks an invoice as paid on that day, or open again
router.put('/created/:id/paid', async (req, res) => {
  try {
    const { paidAt } = req.body;
    let value = null;
    if (paidAt !== null) {
      value = /^\d{4}-\d{2}-\d{2}$/.test(String(paidAt)) ? new Date(`${paidAt}T00:00:00Z`) : null;
      if (!value || Number.isNaN(value.getTime())) return res.status(400).json({ message: 'Enter the payment date as yyyy-mm-dd.' });
      if (value > new Date()) return res.status(400).json({ message: 'The payment date cannot be in the future.' });
    }
    const doc = await Document.findOneAndUpdate(
      { _id: req.params.id, invoiceNumber: { $exists: true } },
      { $set: { paidAt: value } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'Invoice not found.' });
    res.json({ invoiceNumber: doc.invoiceNumber, paidAt: doc.paidAt });
  } catch (err) {
    res.status(500).json({ message: 'Could not save the payment.', error: err.message });
  }
});

// GET /api/invoices/:clientId/pdf?brand=bespreek|catalista - a concept without a number; changes nothing
router.get('/:clientId/pdf', async (req, res) => {
  try {
    const [invoice] = await openInvoices({ client: req.params.clientId });
    if (!invoice) return res.status(404).json({ message: 'Nothing left to invoice for this client.' });
    const details = await pdfDetails(invoice, { brand: req.query.brand, date: belgianDate().date });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="factuur-concept_${safeFileName(invoice.client)}.pdf"`);
    const stream = new PassThrough();
    stream.pipe(res);
    renderInvoicePdf(details, stream);
  } catch (err) {
    if (err instanceof onfact.OnFactError) return res.status(400).json({ message: err.message });
    res.status(500).json({ message: 'Could not create the PDF.', error: err.message });
  }
});

// POST /api/invoices/:clientId/create { brand, entries } - gives the invoice the next number, stores the PDF with the
// client's bills and marks exactly the entries on it as invoiced. `entries` is the count the user confirmed.
router.post('/:clientId/create', async (req, res) => {
  let issued;
  let storedDocument;
  try {
    const [invoice] = await openInvoices({ client: req.params.clientId });
    if (!invoice) return res.status(404).json({ message: 'Nothing left to invoice for this client.' });
    if (Number(req.body.entries) !== invoice.entries) {
      return res.status(409).json({ message: 'The time of this client has changed. Check the new numbers and try again.' });
    }
    const { client } = invoice;
    const { year, iso, date } = belgianDate();
    await pdfDetails(invoice, { brand: req.body.brand, date }); // refuses a problem before a number is used

    issued = await nextInvoiceNumber(year);
    const { number } = issued;
    const pdf = await renderInvoiceBuffer(await pdfDetails(invoice, { brand: req.body.brand, number, date }));
    storedDocument = await Document.create({
      client: client._id,
      category: 'bill',
      originalName: `factuur_${number}_${safeFileName(client)}.pdf`,
      storedFileName: `invoice-${number}.pdf`,
      mimeType: 'application/pdf',
      size: pdf.length,
      uploadedBy: req.user._id,
      notes: `Invoice date ${iso}`,
      invoiceNumber: number,
      pdf,
    });

    const entries = invoice.assignments.flatMap((a) => a.entries);
    const { modifiedCount } = await TimeEntry.updateMany(
      { _id: { $in: entries.map((e) => e._id) }, invoiced: { $ne: true } },
      { $set: { invoiced: true, invoiceDocument: storedDocument._id, invoiceNumber: number } }
    );
    res.json({
      invoiceNumber: number,
      entriesInvoiced: modifiedCount,
      document: { _id: storedDocument._id, originalName: storedDocument.originalName },
    });
  } catch (err) {
    if (err instanceof onfact.OnFactError) return res.status(400).json({ message: err.message });
    // Nothing was marked, so no invoice may stay behind, and an unused last number goes back so the series has no gap
    if (storedDocument) await Document.deleteOne({ _id: storedDocument._id }).catch(() => {});
    if (issued) {
      await Setting.updateOne({ key: issued.key, sequence: issued.sequence }, { $inc: { sequence: -1 } }).catch(() => {});
    }
    res.status(500).json({ message: 'Could not create this invoice.', error: err.message });
  }
});

module.exports = router;
