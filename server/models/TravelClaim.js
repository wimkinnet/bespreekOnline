const mongoose = require('mongoose');

// Expense claim (onkostennota) for the km a consultant drove with their own car, reimbursed by the company
// at the official km rate. Numbered per consultant per year; the data is a snapshot so the PDF never changes.
const lineSchema = new mongoose.Schema(
  {
    timeEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'TimeEntry' },
    date: Date,
    clientName: String,
    destination: String, // client's city or address
    assignmentTitle: String,
    km: Number, // round trip
    kmEstimated: Boolean, // derived from a legacy travel amount, see utils/kmRates.js
    rate: Number,
    amount: Number,
  },
  { _id: false }
);

const partySchema = new mongoose.Schema(
  {
    name: String,
    street: String,
    postalCode: String,
    city: String,
    country: String,
    enterpriseNumber: String,
    iban: String,
  },
  { _id: false }
);

const travelClaimSchema = new mongoose.Schema(
  {
    consultant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    year: { type: Number, required: true },
    sequence: { type: Number, required: true },
    number: { type: String, required: true }, // e.g. KM-2026-001
    issueDate: { type: Date, required: true },
    periodFrom: Date,
    periodTo: Date,
    beneficiary: partySchema, // the consultant
    company: partySchema,
    lines: [lineSchema],
    rates: [{ from: String, to: String, rate: Number, source: String, _id: false }],
    totalKm: Number,
    totalAmount: Number,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

travelClaimSchema.index({ consultant: 1, year: 1, sequence: 1 }, { unique: true });

module.exports = mongoose.model('TravelClaim', travelClaimSchema);
