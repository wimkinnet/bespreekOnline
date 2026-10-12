const PDFDocument = require('pdfkit');
const { LEGACY_RATE, LEGACY_ROUNDING } = require('./kmRates');

// Renders an expense claim (onkostennota) for km driven with one's own car, in Dutch, as an A4 PDF.

const INK = '#14302f';
const SOFT = '#4a5e5d';
const LINE = '#d9e3e3';
const ACCENT = '#00807d';

const eur = (n, digits = 2) =>
  new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
const num = (n) => new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 1 }).format(n);
const day = (d) => new Intl.DateTimeFormat('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d));
const isoToDay = (iso) => iso.split('-').reverse().join('/');

// Country only for addresses abroad
function addressLines(p) {
  const abroad = p.country && !/^(belgium|belgië|belgique)$/i.test(p.country.trim());
  return [p.street, [p.postalCode, p.city].filter(Boolean).join(' '), abroad ? p.country : null].filter(Boolean);
}

module.exports = function renderTravelClaimPdf(claim, stream) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: `Onkostennota ${claim.number}` } });
  doc.pipe(stream);
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  // Title and document data
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text('Onkostennota', left, 50);
  doc.font('Helvetica').fontSize(10.5).fillColor(SOFT).text('Kilometervergoeding voor dienstverplaatsingen met eigen wagen');

  const meta = [
    ['Nummer', claim.number],
    ['Datum', day(claim.issueDate)],
    ['Periode', `${day(claim.periodFrom)} – ${day(claim.periodTo)}`],
  ];
  let y = 52;
  for (const [label, value] of meta) {
    doc.font('Helvetica').fontSize(9).fillColor(SOFT).text(label, left + width - 190, y, { width: 60 });
    doc.font('Helvetica-Bold').fillColor(INK).text(value, left + width - 130, y, { width: 130, align: 'right' });
    y += 14;
  }

  // Parties
  y = 115;
  const colW = width / 2 - 10;
  const party = (title, p, extra, x) => {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(ACCENT).text(title.toUpperCase(), x, y, { width: colW, characterSpacing: 0.5 });
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(p.name || '', x, y + 14, { width: colW });
    doc.font('Helvetica').fontSize(9.5).fillColor(INK);
    for (const line of [...addressLines(p), ...extra]) doc.text(line, { width: colW });
    return doc.y;
  };
  const endA = party('Begunstigde', claim.beneficiary, claim.beneficiary.iban ? [`IBAN ${claim.beneficiary.iban}`] : [], left);
  const endB = party(
    'Aan',
    claim.company,
    claim.company.enterpriseNumber ? [`Ondernemingsnr. ${claim.company.enterpriseNumber}`] : [],
    left + width / 2 + 10
  );
  y = Math.max(endA, endB) + 18;

  doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(
    `Vergoeding voor verplaatsingen met eigen wagen in opdracht van ${claim.company.name}, telkens heen en terug ` +
      'tussen de woonplaats van de begunstigde en de klant.',
    left,
    y,
    { width }
  );
  y = doc.y + 12;

  // Trips table
  const cols = [
    { label: 'Datum', w: 62 },
    { label: 'Klant / bestemming', w: 150 },
    { label: 'Opdracht', w: 128 },
    { label: 'Km (h/t)', w: 50, align: 'right' },
    { label: 'Tarief/km', w: 55, align: 'right' },
    { label: 'Bedrag', w: width - 445, align: 'right' },
  ];
  const drawRow = (values, { bold = false, header = false } = {}) => {
    doc.font(bold || header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 8 : 9).fillColor(header ? SOFT : INK);
    const heights = values.map((v, i) => doc.heightOfString(String(v), { width: cols[i].w - 6 }));
    const h = Math.max(...heights) + 8;
    if (y + h > doc.page.height - doc.page.margins.bottom - 20) {
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

  drawRow(cols.map((c) => c.label), { header: true });
  const anyEstimated = claim.lines.some((l) => l.kmEstimated);
  for (const l of claim.lines) {
    drawRow([
      day(l.date),
      l.destination ? `${l.clientName}, ${l.destination}` : l.clientName,
      l.assignmentTitle,
      `${num(l.km)}${l.kmEstimated ? ' *' : ''}`,
      eur(l.rate, 4),
      eur(l.amount),
    ]);
  }
  drawRow(['', 'Totaal', '', num(claim.totalKm), '', eur(claim.totalAmount)], { bold: true });

  // Total to pay
  y += 14;
  if (y > doc.page.height - 260) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  doc.rect(left + width - 220, y, 220, 30).fill('#e0f4f4');
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK)
    .text('Te betalen', left + width - 210, y + 10)
    .text(eur(claim.totalAmount), left + width - 210, y + 10, { width: 200, align: 'right' });
  y += 46;

  // Basis and notes
  const notes = [
    'Tarief: het forfaitaire bedrag per km voor dienstverplaatsingen met eigen wagen dat geldt voor het federaal ' +
      'overheidspersoneel (jaarlijks bedrag), door de fiscus en de RSZ aanvaard als kosten eigen aan de werkgever. ' +
      'Toegepast per verplaatsingsdatum: ' +
      claim.rates.map((r) => `${isoToDay(r.from)} – ${isoToDay(r.to)}: ${eur(r.rate, 4)}/km (${r.source})`).join('; ') +
      '.',
    'Terugbetaling van kosten aan een natuurlijke persoon: geen btw van toepassing.',
  ];
  if (anyEstimated) {
    notes.push(
      `* Km afgeleid uit het eerder geregistreerde verplaatsingsbedrag (${eur(LEGACY_RATE)}/km, naar boven afgerond ` +
        `op ${eur(LEGACY_ROUNDING, 0)}); de ondergrens is genomen.`
    );
  }
  if (claim.beneficiary.iban) {
    notes.push(`Te betalen op rekening ${claim.beneficiary.iban} op naam van ${claim.beneficiary.name}, met vermelding ${claim.number}.`);
  }
  doc.font('Helvetica').fontSize(8.5).fillColor(SOFT);
  for (const note of notes) {
    doc.text(note, left, y, { width });
    y = doc.y + 5;
  }

  // Signatures
  y += 18;
  const sign = (title, name, x) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(title, x, y, { width: colW });
    doc.font('Helvetica').fontSize(9).fillColor(SOFT).text(name, x, y + 13, { width: colW });
    doc.text('Datum:', x, y + 34).text('Handtekening:', x, y + 52);
    doc.moveTo(x + 70, y + 62).lineTo(x + colW, y + 62).lineWidth(0.5).strokeColor(SOFT).stroke();
  };
  sign('Voor echt en waar verklaard', claim.beneficiary.name, left);
  sign(`Goedgekeurd voor ${claim.company.name}`, 'Naam:', left + width / 2 + 10);

  // Page numbers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // the footer sits below the bottom margin
    doc.font('Helvetica').fontSize(8).fillColor(SOFT).text(
      `${claim.number} · pagina ${i + 1} van ${range.count}`,
      left,
      doc.page.height - 35,
      { width, align: 'center', lineBreak: false }
    );
  }
  doc.end();
};
