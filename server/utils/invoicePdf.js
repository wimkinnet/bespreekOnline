const PDFDocument = require('pdfkit');

// Renders the time to invoice for one client, in Dutch, as an A4 PDF to use with an invoice in OnFact.
// It has no invoice number: only OnFact hands those out.

const INK = '#14302f';
const SOFT = '#4a5e5d';
const LINE = '#d9e3e3';
const ACCENT = '#00807d';

const eur = (n) => new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(n);
const num = (n) => new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 2 }).format(n);
const day = (d) =>
  new Intl.DateTimeFormat('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(d));

function quantityLabel(entry) {
  if (entry.billingType === 'hourly') return `${num(entry.hours)} u`;
  if (entry.billingType === 'daily') return `${num(entry.days)} dag`;
  if (entry.billingType === 'half_day') return `${num(entry.days * 2)} halve dag`;
  return 'Vast bedrag';
}

function rateLabel(entry) {
  if (entry.billingType === 'hourly') return `${eur(entry.rateApplied)} / u`;
  if (entry.billingType === 'daily') return `${eur(entry.rateApplied)} / dag`;
  if (entry.billingType === 'half_day') return `${eur(entry.rateApplied)} / halve dag`;
  return '';
}

// Country only for addresses abroad
function addressLines(address) {
  const abroad = address.country && !/^(belgium|belgië|belgique)$/i.test(address.country.trim());
  return [
    address.street,
    [address.postalCode, address.city].filter(Boolean).join(' '),
    abroad ? address.country : null,
  ].filter(Boolean);
}

module.exports = function renderInvoicePdf(invoice, stream) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: 'Factuurspecificatie' } });
  doc.pipe(stream);
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 20;

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text('Factuurspecificatie', left, 50);
  doc.font('Helvetica').fontSize(10.5).fillColor(SOFT).text(`Opgesteld op ${day(new Date())}`);

  // Parties
  let y = 100;
  const colW = width / 2 - 10;
  const party = (title, name, lines, x) => {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(ACCENT).text(title.toUpperCase(), x, y, { width: colW, characterSpacing: 0.5 });
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(name || '', x, y + 14, { width: colW });
    doc.font('Helvetica').fontSize(9.5).fillColor(INK);
    for (const line of lines) doc.text(line, { width: colW });
    return doc.y;
  };
  const { company, client } = invoice;
  const endA = party(
    'Van',
    company.name,
    [...addressLines(company), ...(company.enterpriseNumber ? [`Btw ${company.enterpriseNumber}`] : [])],
    left
  );
  const endB = party(
    'Aan',
    client.name,
    [
      ...(invoice.contactName ? [`t.a.v. ${invoice.contactName}`] : []),
      ...addressLines(invoice.address),
      ...(client.vatNumber ? [`Btw ${client.vatNumber}`] : []),
    ],
    left + width / 2 + 10
  );
  y = Math.max(endA, endB) + 20;

  // Time per assignment
  const cols = [
    { label: 'Datum', w: 62 },
    { label: 'Omschrijving', w: width - 302 },
    { label: 'Aantal', w: 70, align: 'right' },
    { label: 'Tarief', w: 95, align: 'right' },
    { label: 'Bedrag', w: 75, align: 'right' },
  ];
  const drawRow = (values, { bold = false, header = false } = {}) => {
    doc.font(bold || header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 8 : 9).fillColor(header ? SOFT : INK);
    const h = Math.max(...values.map((v, i) => doc.heightOfString(String(v), { width: cols[i].w - 6 }))) + 8;
    if (y + h > bottom()) {
      doc.addPage();
      y = doc.page.margins.top;
      if (!header) drawRow(cols.map((c) => c.label), { header: true });
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(INK);
    }
    let x = left;
    values.forEach((v, i) => {
      doc.text(String(v), x + 3, y + 4, { width: cols[i].w - 6, align: cols[i].align || 'left' });
      x += cols[i].w;
    });
    y += h;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(header ? 1 : 0.5).strokeColor(header ? SOFT : LINE).stroke();
  };
  // A heading stays together with the start of what follows it
  const heading = (text, { size, color, needed }) => {
    if (y + needed > bottom()) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    doc.font('Helvetica-Bold').fontSize(size).fillColor(color).text(text, left, y, { width });
    y = doc.y + 5;
  };

  heading(`Klant: ${client.name}`, { size: 11.5, color: ACCENT, needed: 90 });
  for (const assignment of invoice.assignments) {
    heading(`Opdracht: ${assignment.title}`, { size: 10, color: INK, needed: 70 });
    drawRow(cols.map((c) => c.label), { header: true });
    for (const entry of assignment.entries) {
      drawRow([day(entry.date), entry.description || '', quantityLabel(entry), rateLabel(entry), eur(entry.amount)]);
    }
    drawRow(['', 'Subtotaal opdracht', '', '', eur(assignment.amount)], { bold: true });
    y += 12;
  }

  // Totals
  const rows = [
    ['Prestaties', eur(invoice.amount)],
    ...(invoice.travel ? [[invoice.travel.name, eur(invoice.travel.price)]] : []),
    ['Totaal excl. btw', eur(invoice.totalExclVat)],
    client.vatExempt ? ['Btw', eur(0)] : [`Btw ${Math.round(invoice.vatRate * 100)}%`, eur(invoice.vatAmount)],
  ];
  const totalsW = 280;
  const totalsX = left + width - totalsW;
  if (y + rows.length * 18 + 80 > bottom()) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  y += 4;
  for (const [label, value] of rows) {
    doc.font('Helvetica').fontSize(9.5).fillColor(INK);
    const h = doc.heightOfString(label, { width: totalsW - 90 });
    doc.text(label, totalsX, y, { width: totalsW - 90 });
    doc.text(value, totalsX, y, { width: totalsW, align: 'right' });
    y += h + 5;
  }
  doc.rect(totalsX, y, totalsW, 30).fill('#e0f4f4');
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK)
    .text('Totaal incl. btw', totalsX + 10, y + 10)
    .text(eur(invoice.totalInclVat), totalsX + 10, y + 10, { width: totalsW - 20, align: 'right' });
  y += 46;

  const notes = [
    ...(invoice.vatNote ? [invoice.vatNote] : []),
    'Het factuurnummer wordt toegekend in OnFact.',
  ];
  doc.font('Helvetica').fontSize(8.5).fillColor(SOFT);
  for (const note of notes) {
    doc.text(note, left, y, { width });
    y = doc.y + 4;
  }

  // Page numbers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // the footer sits below the bottom margin
    doc.font('Helvetica').fontSize(8).fillColor(SOFT).text(
      `pagina ${i + 1} van ${range.count}`,
      left,
      doc.page.height - 35,
      { width, align: 'center', lineBreak: false }
    );
  }
  doc.end();
};
