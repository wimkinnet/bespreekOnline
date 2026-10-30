// Stand-in for OnFact in the test environment: checks a request against the "Create Invoice" reference and stores
// it, so the invoices can be inspected at /v1/invoices.json. It does not prove the real API accepts these invoices.
// A customer name containing "FAIL" gets an error, to try out what happens when OnFact refuses an invoice.
const fs = require('fs');
const express = require('express');

// The body fields in the "Create Invoice" reference
const INVOICE_FIELDS = new Set([
  'journal_id', 'currency_id', 'number', 'date', 'delivery_date', 'order_reference', 'template_id', 'customer_id',
  'customer_name', 'customer_attn', 'customer_street', 'customer_streetnumber', 'customer_citycode', 'customer_city',
  'customer_vat', 'customer_email', 'country_id', 'language_id', 'vattype', 'vat_exception', 'discount',
  'discount_type', 'exchange_rate', 'term', 'term_end_of_month', 'section_behavior', 'settlement_discount',
  'settlement_term', 'automatic_reminders', 'text', 'toptext', 'nota', 'returned_empty_goods_value', 'external_pdf',
  'deleted', 'locked', 'invoice_lines', 'payable_rounding_amount', 'eid', 'lawrules',
]);
const LINE_FIELDS = new Set([
  'unit_code_id', 'type', 'quantity', 'name', 'text', 'price', 'purchase_price', 'empty_goods_value', 'vat',
  'discount', 'discount_type', 'product_id', 'g_l_account_code',
]);
const VAT_EXCEPTIONS = new Set([
  '00', '03', '44', '45', '46', '47', '47/AS', '47/DI', '47/EE', '47/EI', '47/EX', '47/TO', 'NA', 'OSS', 'MA',
]);

// Returns what is wrong with an invoice, or null when it fits the reference
function invoiceProblem(invoice) {
  const { customer_name: customer, invoice_lines: lines, vat_exception: vatException } = invoice;
  if (!customer || !Array.isArray(lines) || lines.length === 0) return 'customer_name and invoice_lines are required.';
  const unknown = Object.keys(invoice).find((key) => !INVOICE_FIELDS.has(key));
  if (unknown) return `Unknown field: ${unknown}.`;
  if (vatException !== undefined && !VAT_EXCEPTIONS.has(vatException)) return `Invalid vat_exception: ${vatException}.`;
  for (const line of lines) {
    const unknownLine = Object.keys(line).find((key) => !LINE_FIELDS.has(key));
    if (unknownLine) return `Unknown line field: ${unknownLine}.`;
    if (typeof line.quantity !== 'number' || !line.name || typeof line.price !== 'number') {
      return 'Each invoice line needs a quantity, name and price.';
    }
  }
  return null;
}

function startFakeOnFact({ port, file, apiKey, companyUuid }) {
  const read = () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []);
  const app = express();
  app.use(express.json());

  app.get('/v1/invoices.json', (req, res) => res.json(read()));

  app.post('/v1/invoices.json', (req, res) => {
    if (req.get('X-SESSION-KEY') !== apiKey || req.get('X-COMPANY-UUID') !== companyUuid) {
      return res.status(401).json({ code: 'Unauthorized', message: 'No access token was provided' });
    }
    const problem = invoiceProblem(req.body);
    if (problem) return res.status(400).json({ code: 'BadRequest', message: problem });
    if (req.body.customer_name.includes('FAIL')) {
      return res.status(500).json({ code: 'Error', message: 'Simulated OnFact failure.' });
    }
    const invoices = read();
    const id = invoices.length + 1;
    invoices.push({ id, actions: req.get('X-ACTIONS'), ...req.body });
    fs.writeFileSync(file, JSON.stringify(invoices, null, 2));
    res.status(201).json({ id, code: 'Created' });
  });

  return app.listen(port);
}

module.exports = startFakeOnFact;
