const path = require('path');
const { PassThrough } = require('stream');
const PDFDocument = require('pdfkit');

// Renders the invoice of one client, in Dutch, as an A4 PDF. Without a number it is a concept.

const INK = '#14302f';
const SOFT = '#4a5e5d';
const LINE = '#d9e3e3';
const ACCENT = '#00807d';
const PAYMENT_TERM_DAYS = 30;
const asset = (file) => path.join(__dirname, '..', 'assets', file);
// Who the PDF is presented as; the legal details are always those of the company itself
const BRANDS = {
  bespreek: { logo: asset('bespreek-logo.png'), size: 56 },
  catalista: { tradeName: 'Catalista', logo: asset('catalista-logo.png'), size: 72 },
};

const eur = (n) => new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(n);
const num = (n) => new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 2 }).format(n);
const day = (d) =>
  new Intl.DateTimeFormat('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(d));

function quantityLabel(entry) {
  if (entry.billingType === 'hourly') return `${num(entry.hours)} u`;
  if (entry.billingType === 'daily') return `${num(entry.days)} ${entry.days > 1 ? 'dagen' : 'dag'}`;
  if (entry.billingType === 'half_day') return `${num(entry.days * 2)} ${entry.days > 0.5 ? 'halve dagen' : 'halve dag'}`;
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

function renderInvoicePdf(invoice, stream) {
  const title = invoice.number ? `Factuur ${invoice.number}` : 'Factuur (concept)';
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: title } });
  doc.pipe(stream);
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 20;

  const brand = BRANDS[invoice.brand] || BRANDS.bespreek;
  doc.image(brand.logo, left + width - brand.size, 40, { fit: [brand.size, brand.size] });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text(title, left, 50);
  doc.font('Helvetica').fontSize(10.5).fillColor(SOFT).text(`Factuurdatum ${day(invoice.date)}`);
  const dueDate = new Date(new Date(invoice.date).getTime() + PAYMENT_TERM_DAYS * 24 * 60 * 60 * 1000);
  doc.text(`Vervaldatum ${day(dueDate)}`);
  if (!invoice.number) doc.text('Nog geen factuur: het nummer volgt bij het aanmaken.');

  // Parties
  let y = 120;
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
    brand.tradeName || company.name,
    [...(brand.tradeName ? [`merk van ${company.name}`] : []), ...addressLines(company), ...(company.enterpriseNumber ? [`Btw ${company.enterpriseNumber}`] : [])],
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
  const columns = (withConsultant) => [
    { label: 'Datum', w: 62 },
    ...(withConsultant ? [{ label: 'Consultant', w: 85 }] : []),
    { label: 'Omschrijving', w: width - 302 - (withConsultant ? 85 : 0) },
    { label: 'Aantal', w: 70, align: 'right' },
    { label: 'Tarief', w: 95, align: 'right' },
    { label: 'Bedrag', w: 75, align: 'right' },
  ];
  let cols = columns(false);
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
    // One consultant goes next to the assignment; with several, each line names its own
    const names = [...new Set(assignment.entries.map((e) => e.consultant?.name || ''))];
    const perLine = names.length > 1;
    const title = `Opdracht: ${assignment.title}`;
    heading(perLine || !names[0] ? title : `${title} - Consultant: ${names[0]}`, { size: 10, color: INK, needed: 70 });
    cols = columns(perLine);
    drawRow(cols.map((c) => c.label), { header: true });
    for (const entry of assignment.entries) {
      drawRow([
        day(entry.date),
        ...(perLine ? [entry.consultant?.name || ''] : []),
        entry.description || '',
        quantityLabel(entry),
        rateLabel(entry),
        eur(entry.amount),
      ]);
    }
    drawRow(['', ...(perLine ? [''] : []), 'Subtotaal opdracht', '', '', eur(assignment.amount)], { bold: true });
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
  if (y + rows.length * 18 + 130 > bottom()) {
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

  // How to pay
  const payment = [
    `Te betalen binnen ${PAYMENT_TERM_DAYS} dagen, uiterlijk op ${day(dueDate)}`,
    `Op rekening ${company.iban} op naam van ${company.name}`,
    ...(invoice.number ? [`Met mededeling: Factuur ${invoice.number}`] : []),
  ];
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK);
  for (const line of payment) {
    doc.text(line, left, y, { width });
    y = doc.y + 2;
  }
  y += 8;

  if (invoice.vatNote) {
    doc.font('Helvetica').fontSize(8.5).fillColor(SOFT).text(invoice.vatNote, left, y, { width });
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
}

function renderInvoiceBuffer(invoice) {
  return new Promise((resolve, reject) => {
    const stream = new PassThrough();
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    renderInvoicePdf(invoice, stream);
  });
}

module.exports = { renderInvoicePdf, renderInvoiceBuffer };
