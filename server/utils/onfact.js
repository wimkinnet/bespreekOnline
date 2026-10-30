// Creates invoices in OnFact (https://onfact.stoplight.io). Only active when ONFACT_BASE_URL, ONFACT_API_KEY and
// ONFACT_COMPANY_UUID are all set; there is deliberately no default URL, so nothing reaches OnFact by accident.
//
// Fields follow the "Create Invoice" reference, but this has not been tried against the real API yet.
// The API has no draft status: a created invoice gets the next number of its journal.

class OnFactError extends Error {}

const COUNTRIES = {
  Belgium: { code: 'BEL', eu: true },
  Netherlands: { code: 'NLD', eu: true },
  Germany: { code: 'DEU', eu: true },
  France: { code: 'FRA', eu: true },
  Luxembourg: { code: 'LUX', eu: true },
  'United Kingdom': { code: 'GBR', eu: false },
};

function isEnabled() {
  return Boolean(process.env.ONFACT_BASE_URL && process.env.ONFACT_API_KEY && process.env.ONFACT_COMPANY_UUID);
}

function formatDay(date) {
  return new Date(date).toLocaleDateString('nl-BE', { timeZone: 'UTC' });
}

function roundCents(n) {
  return Math.round(n * 100) / 100;
}

// Quantity and unit price of one time log; a fixed fee is billed as one amount.
// unit_code_id is a UN/ECE code; without one OnFact uses its default (ZZ).
function lineQuantity(entry) {
  if (entry.billingType === 'hourly') return { quantity: entry.hours, unit_code_id: 'HUR', price: entry.rateApplied };
  if (entry.billingType === 'daily') return { quantity: entry.days, unit_code_id: 'DAY', price: entry.rateApplied };
  if (entry.billingType === 'half_day') return { quantity: entry.days * 2, unitName: 'halve dag', price: entry.rateApplied };
  return { quantity: 1, price: entry.amount };
}

// OnFact wants the street and its number separately. "Schoolstraat 12 bus 3" -> Schoolstraat / 12 bus 3;
// an address that does not fit this pattern stays whole in the street field.
function splitStreet(street = '') {
  const match = street.trim().match(/^(.+?)\s+(\d.*)$/);
  return match ? { street: match[1], number: match[2] } : { street: street.trim() };
}

// One line per time log, plus one line for all travel of the invoice
function buildLines(entries, vatPercent) {
  const lines = entries.map((entry) => {
    const { unitName, ...quantity } = lineQuantity(entry);
    const name = [formatDay(entry.date), entry.assignment?.title, unitName].filter(Boolean).join(' - ');
    return { ...quantity, name, text: entry.description || undefined, vat: vatPercent };
  });
  const travelAmount = roundCents(entries.reduce((sum, e) => sum + (e.travelAmount || 0), 0));
  if (travelAmount > 0) {
    const km = entries.reduce((sum, e) => sum + (e.travelKm || 0), 0);
    const notes = entries.filter((e) => e.travelType === 'other').map((e) => e.travelNote);
    const details = [km > 0 ? `${Math.round(km * 10) / 10} km` : null, ...new Set(notes)].filter(Boolean);
    const name = details.length ? `Verplaatsingskosten (${details.join(' + ')})` : 'Verplaatsingskosten';
    lines.push({ quantity: 1, name, price: travelAmount, vat: vatPercent });
  }
  return lines;
}

function buildInvoice(client, entries, vatRate) {
  const countryName = client.address?.country || 'Belgium';
  const country = COUNTRIES[countryName];
  if (!country) throw new OnFactError(`Country "${countryName}" is not supported for invoicing.`);
  if (client.vatExempt && country.code === 'BEL') {
    throw new OnFactError('This client is invoiced without VAT as a foreign client, but its country is Belgium.');
  }

  const { street, number } = splitStreet(client.address?.street);
  const invoice = {
    vattype: 'excl',
    vat_exception: '03', // standard Belgian VAT
    customer_name: client.name,
    customer_street: street || undefined,
    customer_streetnumber: number,
    customer_citycode: client.address?.postalCode || undefined,
    customer_city: client.address?.city || undefined,
    customer_vat: client.vatNumber || undefined,
    customer_email: client.contactEmail || undefined,
    country_id: country.code,
    invoice_lines: buildLines(entries, client.vatExempt ? 0 : Math.round(vatRate * 100)),
  };
  if (client.vatExempt) {
    // VAT declaration box: 44 = intra-community services, 47 = services outside the EU (for the accountant to confirm)
    invoice.vat_exception = country.eu ? '44' : '47';
    invoice.text = country.eu
      ? 'Btw verlegd - art. 21 §2 WBTW en art. 196 Richtlijn 2006/112/EG'
      : 'Niet onderworpen aan Belgische btw - art. 21 §2 WBTW';
  }
  return invoice;
}

// Creates one invoice and returns its OnFact id. Not retried: a timeout may still have created the invoice.
async function createInvoice(client, entries, vatRate) {
  const invoice = buildInvoice(client, entries, vatRate);
  const res = await fetch(new URL('invoices.json', process.env.ONFACT_BASE_URL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SESSION-KEY': process.env.ONFACT_API_KEY,
      'X-COMPANY-UUID': process.env.ONFACT_COMPANY_UUID,
      'X-ACTIONS': 'FIND-OR-CREATE-CUSTOMER',
    },
    body: JSON.stringify(invoice),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    throw new OnFactError(data.message || `OnFact answered with status ${res.status}.`);
  }
  return String(data.id);
}

module.exports = { isEnabled, buildInvoice, createInvoice, OnFactError };
