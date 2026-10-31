const mongoose = require('mongoose');

// Company-wide settings, stored as a single document (key 'company')
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    company: {
      name: { type: String, trim: true }, // legal name incl. legal form, e.g. "bespreek bv"
      street: { type: String, trim: true },
      postalCode: { type: String, trim: true },
      city: { type: String, trim: true },
      country: { type: String, trim: true, default: 'België' },
      enterpriseNumber: { type: String, trim: true }, // KBO / VAT number, e.g. BE 0123.456.789
      iban: { type: String, trim: true }, // the account invoices are paid to
    },
    sequence: { type: Number }, // last invoice number used, in the document 'invoiceSequence:<year>'
  },
  { timestamps: true }
);

module.exports = mongoose.model('Setting', settingSchema);
