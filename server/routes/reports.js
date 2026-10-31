const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const TimeEntry = require('../models/TimeEntry');
const { protect, requireRole } = require('../middleware/auth');

router.use(protect, requireRole('admin'));

const VAT_RATE = 0.21;
const BILLABLE = { billable: { $ne: false } };
const NON_BILLABLE = { billable: false };

function roundCents(n) {
  return Math.round(n * 100) / 100;
}

function dateMatch({ from, to }) {
  const match = {};
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = new Date(from);
    if (to) match.date.$lte = new Date(to);
  }
  return match;
}

// Totals per client, with VAT applied to the amount plus travel costs (none for VAT-exempt foreign clients)
async function totalsByClient(match) {
  const rows = await TimeEntry.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$client',
        hours: { $sum: { $ifNull: ['$hours', 0] } },
        days: { $sum: { $ifNull: ['$days', 0] } },
        amount: { $sum: '$amount' },
        travelAmount: { $sum: { $ifNull: ['$travelAmount', 0] } },
        entries: { $sum: 1 },
      },
    },
    { $lookup: { from: 'clients', localField: '_id', foreignField: '_id', as: 'client' } },
    { $unwind: '$client' },
    {
      $project: {
        clientName: '$client.name',
        vatExempt: { $ifNull: ['$client.vatExempt', false] },
        hours: 1,
        days: 1,
        amount: 1,
        travelAmount: 1,
        entries: 1,
      },
    },
    { $sort: { amount: -1 } },
  ]);
  return rows.map((c) => {
    const totalExclVat = roundCents(c.amount + c.travelAmount);
    const vatAmount = c.vatExempt ? 0 : roundCents(totalExclVat * VAT_RATE);
    return { ...c, totalExclVat, vatAmount, totalInclVat: roundCents(totalExclVat + vatAmount) };
  });
}

function totalsByConsultant(match) {
  return TimeEntry.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$consultant',
        hours: { $sum: { $ifNull: ['$hours', 0] } },
        days: { $sum: { $ifNull: ['$days', 0] } },
        amount: { $sum: '$amount' },
        travelAmount: { $sum: { $ifNull: ['$travelAmount', 0] } },
        entries: { $sum: 1 },
      },
    },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $project: { consultantName: '$user.name', hours: 1, days: 1, amount: 1, travelAmount: 1, entries: 1 } },
    { $sort: { amount: -1 } },
  ]);
}

function totalsByAssignment(match) {
  return TimeEntry.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$assignment',
        hours: { $sum: { $ifNull: ['$hours', 0] } },
        days: { $sum: { $ifNull: ['$days', 0] } },
        amount: { $sum: '$amount' },
        travelAmount: { $sum: { $ifNull: ['$travelAmount', 0] } },
        entries: { $sum: 1 },
        invoicedAmount: { $sum: { $cond: ['$invoiced', '$amount', 0] } },
      },
    },
    { $lookup: { from: 'assignments', localField: '_id', foreignField: '_id', as: 'assignment' } },
    { $unwind: '$assignment' },
    { $lookup: { from: 'clients', localField: 'assignment.client', foreignField: '_id', as: 'client' } },
    { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        assignmentTitle: '$assignment.title',
        clientName: '$client.name',
        billingType: '$assignment.billingType',
        hours: 1,
        days: 1,
        amount: 1,
        travelAmount: 1,
        entries: 1,
        invoicedAmount: 1,
      },
    },
    { $sort: { amount: -1 } },
  ]);
}

async function groupedTotals(match) {
  const [byClient, byConsultant, byAssignment] = await Promise.all([
    totalsByClient(match),
    totalsByConsultant(match),
    totalsByAssignment(match),
  ]);
  return { byClient, byConsultant, byAssignment };
}

// GET /api/reports/summary?from=&to=
// Returns billable and non-billable totals per client, consultant and assignment for a date range.
// Income and VAT only count billable entries; non-billable ones are never charged.
router.get('/summary', async (req, res) => {
  try {
    const match = dateMatch(req.query);
    const [billable, nonBillable] = await Promise.all([
      groupedTotals({ ...match, ...BILLABLE }),
      groupedTotals({ ...match, ...NON_BILLABLE }),
    ]);
    const { byClient } = billable;
    const sumOf = (rows, key) => roundCents(rows.reduce((sum, c) => sum + c[key], 0));

    const grandTotal = sumOf(byClient, 'amount');
    const travelTotal = sumOf(byClient, 'travelAmount');
    const nonBillableTotal = sumOf(nonBillable.byClient, 'amount');

    const vatTotal = sumOf(byClient, 'vatAmount');
    const totalInclVat = sumOf(byClient, 'totalInclVat');

    res.json({ billable, nonBillable, grandTotal,
      travelTotal,
      nonBillableTotal,
      vatRate: VAT_RATE,
      vatTotal,
      totalInclVat,
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not build report.', error: err.message });
  }
});

// GET /api/reports/by-client.xlsx?from=&to=
// Excel export of the billable totals per client, including VAT, with non-billable work listed separately.
router.get('/by-client.xlsx', async (req, res) => {
  try {
    const { from, to } = req.query;
    const match = dateMatch(req.query);
    const rows = await totalsByClient({ ...match, ...BILLABLE });
    const nonBillableRows = await totalsByClient({ ...match, ...NON_BILLABLE });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('By client');
    const period = `${from || '…'} – ${to || '…'}`;
    sheet.addRow([`Report by client, ${period}`]).font = { bold: true, size: 13 };
    sheet.addRow([]);
    sheet.addRow(['Billable']).font = { bold: true };

    const vatLabel = `VAT ${Math.round(VAT_RATE * 100)}%`;
    const header = sheet.addRow([
      'Client', 'Hours', 'Days', 'Entries', 'Amount', 'Travel', 'Total excl. VAT', vatLabel, 'Total incl. VAT',
    ]);
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8ECF2' } };
      cell.border = { bottom: { style: 'thin' } };
    });

    for (const c of rows) {
      sheet.addRow([
        c.vatExempt ? `${c.clientName} (no VAT)` : c.clientName,
        c.hours, c.days, c.entries, c.amount, c.travelAmount, c.totalExclVat, c.vatAmount, c.totalInclVat,
      ]);
    }

    const sum = (key) => roundCents(rows.reduce((s, c) => s + c[key], 0));
    const totalRow = sheet.addRow([
      'Total', sum('hours'), sum('days'), sum('entries'), sum('amount'), sum('travelAmount'),
      sum('totalExclVat'), sum('vatAmount'), sum('totalInclVat'),
    ]);
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => (cell.border = { top: { style: 'thin' } }));

    if (nonBillableRows.length > 0) {
      sheet.addRow([]);
      sheet.addRow(['Non-billable (not charged)']).font = { bold: true };
      const nonBillableHeader = sheet.addRow(['Client', 'Hours', 'Days', 'Entries', 'Value', 'Travel']);
      nonBillableHeader.font = { bold: true };
      nonBillableHeader.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8ECF2' } };
        cell.border = { bottom: { style: 'thin' } };
      });
      for (const c of nonBillableRows) {
        sheet.addRow([c.clientName, c.hours, c.days, c.entries, c.amount, c.travelAmount]);
      }
    }

    sheet.columns.forEach((col, i) => {
      col.width = i === 0 ? 36 : 16;
      if (i === 1 || i === 2) col.numFmt = '0.00';
      if (i >= 4) col.numFmt = '€ #,##0.00';
    });

    const filename = `report-by-client_${from || 'start'}_${to || 'today'}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ message: 'Could not export report.', error: err.message });
  }
});

module.exports = router;
