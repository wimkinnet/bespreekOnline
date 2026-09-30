const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const TimeEntry = require('../models/TimeEntry');
const { protect, requireRole } = require('../middleware/auth');

router.use(protect, requireRole('admin'));

const VAT_RATE = 0.21;

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

// Totals per client, with VAT applied to the amount plus travel costs
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
    { $project: { clientName: '$client.name', hours: 1, days: 1, amount: 1, travelAmount: 1, entries: 1 } },
    { $sort: { amount: -1 } },
  ]);
  return rows.map((c) => {
    const totalExclVat = roundCents(c.amount + c.travelAmount);
    const vatAmount = roundCents(totalExclVat * VAT_RATE);
    return { ...c, totalExclVat, vatAmount, totalInclVat: roundCents(totalExclVat + vatAmount) };
  });
}

// GET /api/reports/summary?from=&to=
// Returns totals grouped by client, by consultant, and grand totals, for a date range.
// Income only counts what was registered as time entries (including fixed fees).
router.get('/summary', async (req, res) => {
  try {
    const match = dateMatch(req.query);
    const byClient = await totalsByClient(match);

    const byConsultant = await TimeEntry.aggregate([
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

    const byAssignment = await TimeEntry.aggregate([
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
      {
        $project: {
          assignmentTitle: '$assignment.title',
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

    const grandTotal = byClient.reduce((sum, c) => sum + c.amount, 0);
    const travelTotal = byClient.reduce((sum, c) => sum + c.travelAmount, 0);

    const vatTotal = roundCents(byClient.reduce((sum, c) => sum + c.vatAmount, 0));
    const totalInclVat = roundCents(byClient.reduce((sum, c) => sum + c.totalInclVat, 0));

    res.json({ byClient, byConsultant, byAssignment, grandTotal, travelTotal, vatRate: VAT_RATE, vatTotal, totalInclVat });
  } catch (err) {
    res.status(500).json({ message: 'Could not build report.', error: err.message });
  }
});

// GET /api/reports/by-client.xlsx?from=&to=
// Excel export of the totals per client, including VAT.
router.get('/by-client.xlsx', async (req, res) => {
  try {
    const { from, to } = req.query;
    const rows = await totalsByClient(dateMatch(req.query));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('By client');
    const period = `${from || '…'} – ${to || '…'}`;
    sheet.addRow([`Report by client, ${period}`]).font = { bold: true, size: 13 };
    sheet.addRow([]);

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
        c.clientName, c.hours, c.days, c.entries, c.amount, c.travelAmount, c.totalExclVat, c.vatAmount, c.totalInclVat,
      ]);
    }

    const sum = (key) => roundCents(rows.reduce((s, c) => s + c[key], 0));
    const totalRow = sheet.addRow([
      'Total', sum('hours'), sum('days'), sum('entries'), sum('amount'), sum('travelAmount'),
      sum('totalExclVat'), sum('vatAmount'), sum('totalInclVat'),
    ]);
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => (cell.border = { top: { style: 'thin' } }));

    sheet.columns.forEach((col, i) => {
      col.width = i === 0 ? 36 : 16;
      if (i === 1 || i === 2) col.numFmt = '0.0';
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
