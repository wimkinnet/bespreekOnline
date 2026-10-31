const TimeEntry = require('../models/TimeEntry');
const Setting = require('../models/Setting');
const onfact = require('./onfact');

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

// Everything the PDF shows besides the invoice itself. Refuses a country that does not fit the client's VAT treatment.
async function pdfDetails(invoice, { brand, number, date }) {
  const { client } = invoice;
  const country = onfact.invoiceCountry(client);
  const setting = await Setting.findOne({ key: 'company' });
  if (!setting?.company?.iban) throw new onfact.OnFactError('Add the bank account to the company details first.');
  return {
    ...invoice,
    brand,
    company: setting?.toObject().company || {},
    number,
    date,
    address: onfact.billingAddress(client) || {},
    contactName: client.billing?.contactName || client.contactName,
    vatNote: client.vatExempt ? onfact.reverseChargeNote(country) : null,
  };
}

module.exports = { buildInvoice, openInvoices, pdfDetails };
