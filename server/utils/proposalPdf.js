const path = require('path');
const { PassThrough } = require('stream');
const PDFDocument = require('pdfkit');

// Renders a proposal (offerte) in Dutch as an A4 PDF: cover, situation, team, plan, budget and conditions.

const asset = (file) => path.join(__dirname, '..', 'assets', file);
const BRANDS = {
  catalista: {
    logo: asset('catalista-logo.png'),
    tagline: 'Van inzicht naar impact!',
    main: '#3f5a7e',
    band: '#edcd73',
    accent: '#f28e8c',
    dark: '#4e7673',
    line: (company) => `Catalista, merk van ${company.name}`,
  },
  bespreek: {
    logo: asset('bespreek-logo.png'),
    wordmark: 'bespreek',
    tagline: null,
    main: '#00807d', // the app's teal for title bands and the cover, instead of near-black
    band: '#02c8c9',
    accent: '#02c8c9',
    dark: '#00615f',
    line: (company) => company.name,
  },
};
const INK = '#2b3a4a';
const SOFT = '#5b6b7a';
const RULE = '#c9d2dc';

const INVOICING = {
  monthly: 'Facturatie gebeurt maandelijks op basis van de uitgevoerde dagdelen',
  per_step: 'Facturatie gebeurt na elke afgeronde stap',
  end: 'Facturatie gebeurt na afloop van de begeleiding',
};

// Optional clauses in the order they are printed; `name` is who the proposal is from
const CLAUSES = {
  // The processor's main duties under article 28 GDPR, so the proposal itself carries them
  gdpr: (name) =>
    `Voor zover ${name} bij deze opdracht persoonsgegevens verwerkt, zoals leerlingengegevens, treedt zij op als verwerker in de zin van artikel 28 van de AVG (GDPR). Zij verwerkt die gegevens uitsluitend volgens de instructies van de opdrachtgever en enkel voor deze opdracht, legt wie ermee werkt geheimhouding op, neemt passende beveiligingsmaatregelen, schakelt geen andere verwerkers in zonder voorafgaand akkoord, helpt de opdrachtgever bij verzoeken van betrokkenen en meldt een datalek onverwijld. Na afloop van de opdracht worden de gegevens verwijderd of terugbezorgd`,
  cancellation: () =>
    'Bij annulering of verplaatsing van een begeleidingsmoment minder dan 10 werkdagen vooraf wordt 50% van dat moment aangerekend, minder dan 2 werkdagen vooraf 100%',
  validity: () => 'Deze offerte is 60 dagen geldig vanaf de offertedatum',
  latePayment: () =>
    'Bij laattijdige betaling zijn van rechtswege en zonder ingebrekestelling de wettelijke verwijlintresten en een forfaitaire schadevergoeding verschuldigd, volgens de wet betreffende de bestrijding van de betalingsachterstand bij handelstransacties',
  extraWork: () => 'Bijkomende dagen of dagdelen worden aangerekend aan het dagtarief van deze offerte, na akkoord van de opdrachtgever',
  liability: (name) =>
    `${name} levert een inspanningsverbintenis. De aansprakelijkheid is beperkt tot het gefactureerde bedrag van deze opdracht`,
  materials: (name) =>
    `De opdrachtgever mag het voor deze opdracht ontwikkelde materiaal intern gebruiken. ${name} behoudt de rechten op haar methodes, sjablonen en instrumenten`,
  confidentiality: () => 'Beide partijen behandelen alle vertrouwelijke informatie die ze van elkaar ontvangen als vertrouwelijk',
  indexation: () => 'Het dagtarief wordt jaarlijks op 1 januari aangepast aan de evolutie van de gezondheidsindex',
  acceptance: () => 'De offerte wordt aanvaard door ondertekening of door bevestiging per e-mail',
  law: (name, company) =>
    `Op deze overeenkomst is het Belgisch recht van toepassing. Bij een geschil zijn de rechtbanken van het gerechtelijk arrondissement van de zetel van ${company.name} bevoegd`,
};

const eur = (n) => new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(n);
const num = (n) => new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 2 }).format(n);
const longDate = (d) => new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d));

function renderProposalPdf(proposal, stream) {
  const brand = BRANDS[proposal.brand] || BRANDS.catalista;
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 60, bottom: 70, left: 60, right: 60 },
    bufferPages: true,
    info: { Title: `Offerte ${proposal.number || ''} ${proposal.title}`.trim() },
  });
  doc.pipe(stream);
  const W = doc.page.width;
  const H = doc.page.height;
  const left = 60;
  const width = W - 120;

  // ---- Cover
  if (brand.wordmark) {
    doc.image(brand.logo, W / 2 - 90, 150, { fit: [180, 180] });
    doc.font('Helvetica-Bold').fontSize(40).fillColor(brand.main).text(brand.wordmark, 0, 360, { width: W, align: 'center' });
  } else {
    doc.image(brand.logo, W / 2 - 190, 70, { fit: [380, 380] });
  }
  doc.rect(0, H - 270, W, 230).fill(brand.main);
  doc.rect(0, H - 40, W, 40).fill(brand.band);
  let y = H - 230;
  if (brand.tagline) {
    doc.font('Helvetica').fontSize(20).fillColor('#ffffff').text(brand.tagline, left, y, { width, align: 'right' });
    y = doc.y + 10;
  }
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#ffffff').text(proposal.title, left, y, { width, align: 'right' });
  doc.font('Helvetica').fontSize(15).text(proposal.client?.name || '', left, doc.y + 6, { width, align: 'right' });
  doc.page.margins.bottom = 0; // the cover's last line sits below the normal bottom margin
  doc.fontSize(10).text(
    [`Offerte ${proposal.number || '(concept)'}`, longDate(proposal.date || new Date()), brand.line(proposal.company)].join('  ||  '),
    left,
    H - 70,
    { width, align: 'right', lineBreak: false }
  );

  // A page with a coloured title band; returns where the content starts
  const sectionPage = (title) => {
    doc.addPage();
    doc.rect(0, 50, W - 70, 80).fill(brand.main);
    doc.font('Helvetica').fontSize(28).fillColor('#ffffff').text(title.toUpperCase(), left, 75, { width: W - 150, lineBreak: false });
    doc.rect(W - 18, 0, 18, H).fill(brand.accent);
    return 165;
  };
  const subheading = (text, at) => {
    doc.moveTo(left, at).lineTo(left + width, at).lineWidth(1.5).strokeColor(brand.main).stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(brand.main).text(text.toUpperCase(), left, at + 8, { characterSpacing: 1.5 });
    const below = doc.y + 6;
    doc.moveTo(left, below).lineTo(left + width, below).lineWidth(1.5).strokeColor(brand.main).stroke();
    return below + 12;
  };
  const body = (text, at) => {
    doc.font('Helvetica').fontSize(11.5).fillColor(INK).text(text || '', left, at, { width, lineGap: 3 });
    return doc.y + 22;
  };

  // ---- Situation
  y = sectionPage('Situering opdracht');
  if (proposal.introduction) y = body(proposal.introduction, subheading('Aanleiding', y));
  if (proposal.goal) body(proposal.goal, subheading('Doelstelling', y));

  const split = Math.round(W * 0.42);
  const photoPages = new Set(); // their footer sits on the coloured panel

  // ---- Team, one consultant with a profile per page: photo on the left, profile on a coloured panel
  for (const consultant of (proposal.consultants || []).filter((c) => c.bio)) {
    if (!consultant.photo) {
      y = sectionPage(consultant.name);
      body(consultant.bio, subheading(consultant.jobTitle || 'Begeleider', y));
      continue;
    }
    doc.addPage();
    photoPages.add(doc.bufferedPageRange().count - 1);
    doc.save();
    doc.rect(0, 0, split, H).clip();
    doc.image(consultant.photo, 0, 0, { cover: [split, H], align: 'center', valign: 'center' });
    doc.restore();
    doc.rect(split, 0, W - split, H).fill(brand.main);
    const px = split + 28;
    const pw = W - split - 56;
    doc.font('Helvetica').fontSize(28).fillColor('#ffffff').text(consultant.name.toUpperCase(), px, 70, { width: pw, lineGap: -2 });
    let py = doc.y + 18;
    doc.moveTo(px, py).lineTo(px + pw, py).lineWidth(1.5).strokeColor('#ffffff').stroke();
    doc.font('Helvetica').fontSize(9.5).text((consultant.jobTitle || 'Begeleider').toUpperCase(), px, py + 12, { width: pw, characterSpacing: 1 });
    py = doc.y + 12;
    doc.moveTo(px, py).lineTo(px + pw, py).lineWidth(1.5).strokeColor('#ffffff').stroke();
    doc.font('Helvetica').fontSize(10).fillColor('#ffffff').text(consultant.bio, px, py + 20, { width: pw, lineGap: 2.5, height: H - py - 90 });
  }

  // ---- Plan
  y = sectionPage('Plan van aanpak');
  (proposal.steps || []).forEach((step, i) => {
    doc.font('Helvetica-Bold').fontSize(12).fillColor(brand.main).text(`Stap ${i + 1}: ${step.title}`, left, y, { width });
    if (step.description) doc.font('Helvetica').fontSize(11).fillColor(INK).text(step.description, left, doc.y + 4, { width, lineGap: 2 });
    const facts = [`${num(step.days)} dag${step.days === 1 ? '' : 'en'} met het team`, step.proposedDates && `voorstel: ${step.proposedDates}`]
      .filter(Boolean)
      .join('  ·  ');
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(SOFT).text(facts, left, doc.y + 4, { width });
    y = doc.y + 18;
  });
  if (proposal.requirements) {
    doc.font('Helvetica').fontSize(11).fillColor(INK).text(proposal.requirements, left, y, { width, lineGap: 2 });
  }

  // ---- Budget
  y = sectionPage('Offerte');
  y = subheading(`Begeleiding ${proposal.client?.name || ''}`, y);
  const cols = [
    { label: '', w: width - 170 },
    { label: 'Dagen', w: 70, align: 'center' },
    { label: 'Prijs in euro', w: 100, align: 'right' },
  ];
  const row = (values, { bold = false, fill = null, color = INK } = {}) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10.5);
    const h = Math.max(...values.map((v, i) => doc.heightOfString(String(v), { width: cols[i].w - 16 }))) + 16;
    if (fill) doc.rect(left, y, width, h).fill(fill);
    let x = left;
    values.forEach((v, i) => {
      doc.fillColor(color).text(String(v), x + 8, y + 8, { width: cols[i].w - 16, align: cols[i].align || 'left' });
      x += cols[i].w;
    });
    y += h;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.75).strokeColor(RULE).stroke();
  };
  row(cols.map((c) => c.label), { bold: true });
  for (const line of proposal.budget.lines) row([line.label, num(line.days), eur(line.amount)]);
  row(['Totaal', num(proposal.budget.days), eur(proposal.budget.amount)], { bold: true, fill: brand.dark, color: '#ffffff' });
  doc.font('Helvetica').fontSize(9.5).fillColor(SOFT).text(
    `Dagtarief ${eur(proposal.dayRate)}. Prijzen zijn exclusief btw en exclusief verplaatsingskosten.`,
    left,
    y + 10,
    { width }
  );

  // ---- Conditions
  y = sectionPage('Voorwaarden');
  y = subheading('Facturatie en betalingsvoorwaarden', y);
  const c = proposal.conditions || {};
  const from = proposal.brand === 'bespreek' ? proposal.company.name : 'Catalista';
  const bullets = [
    `Verplaatsingskosten worden aangerekend aan ${eur(c.travelRate ?? 0.45)}/km (excl. btw), heen en terug vanaf de woonplaats van de begeleider`,
    INVOICING[c.invoicing] || INVOICING.monthly,
    `Betalingstermijn van facturen is ${c.paymentTermDays || 30} dagen na factuurdatum`,
    ...(c.clientCosts !== false
      ? ['Praktische organisatie (planning scholen), kopiekosten, cateringkosten en lokaalkosten zijn voor rekening van de opdrachtgever']
      : []),
    ...Object.entries(CLAUSES)
      .filter(([key]) => (key === 'indexation' ? c[key] === true : c[key] !== false)) // indexation only when chosen
      .map(([, text]) => text(from, proposal.company)),
  ];
  for (const condition of bullets) {
    const b = /[.!?]$/.test(condition) ? condition : `${condition}.`; // every condition ends as a sentence
    // A bullet that would run into the footer starts on a new page
    doc.font('Helvetica').fontSize(11.5);
    if (y + doc.heightOfString(b, { width: width - 16, lineGap: 2 }) > H - 80) {
      doc.addPage();
      doc.rect(W - 18, 0, 18, H).fill(brand.accent);
      y = 60;
    }
    doc.circle(left + 4, y + 6, 2.5).fill(brand.main);
    doc.font('Helvetica').fontSize(11.5).fillColor(INK).text(b, left + 16, y, { width: width - 16, lineGap: 2 });
    y = doc.y + 10;
  }

  // ---- Footer on every page but the cover
  const range = doc.bufferedPageRange();
  for (let i = range.start + 1; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    const onPanel = photoPages.has(i);
    doc.font('Helvetica').fontSize(8).fillColor(onPanel ? '#ffffff' : SOFT).text(
      `Offerte ${proposal.number || '(concept)'} · ${brand.line(proposal.company)} · pagina ${i + 1} van ${range.count}`,
      onPanel ? split + 28 : left,
      H - 40,
      { width: onPanel ? W - split - 56 : width, align: 'center', lineBreak: false }
    );
  }
  doc.end();
}

function renderProposalBuffer(proposal) {
  return new Promise((resolve, reject) => {
    const stream = new PassThrough();
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    renderProposalPdf(proposal, stream);
  });
}

module.exports = { renderProposalPdf, renderProposalBuffer };
