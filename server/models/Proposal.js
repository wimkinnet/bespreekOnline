const mongoose = require('mongoose');

// A proposal (offerte) to a client: the plan in steps, the budget in days and the conditions.
// Accepting it can create the assignments it describes.
const stepSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true },
    proposedDates: { type: String, trim: true }, // free text, e.g. "28/09 voormiddag"
    days: { type: Number, min: 0, default: 0.5 }, // working days with the client
  },
  { _id: false }
);

const proposalSchema = new mongoose.Schema(
  {
    number: { type: String, unique: true }, // O + YY + sequence, e.g. O260001
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    title: { type: String, required: true, trim: true },
    date: { type: Date, default: Date.now },
    brand: { type: String, enum: ['bespreek', 'catalista'], default: 'catalista' },
    status: { type: String, enum: ['draft', 'sent', 'accepted', 'declined'], default: 'draft' },
    sentAt: { type: Date }, // when the status last became Sent; the dashboard counts the waiting days from it
    consultants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    introduction: { type: String, trim: true }, // "Aanleiding"
    goal: { type: String, trim: true }, // "Doelstelling"
    steps: [stepSchema],
    requirements: { type: String, trim: true }, // what the client provides, below the plan
    supportDays: { type: Number, min: 0, default: 0 }, // preparation and follow-up without the client
    supportLabel: { type: String, trim: true },
    dayRate: { type: Number, min: 0, default: 950 },
    conditions: {
      travelRate: { type: Number, min: 0, default: 0.45 },
      invoicing: { type: String, enum: ['monthly', 'per_step', 'end'], default: 'monthly' },
      paymentTermDays: { type: Number, default: 30 },
      clientCosts: { type: Boolean, default: true },
      // Market-practice clauses, each switched on or off per proposal (texts in utils/proposalPdf.js)
      gdpr: { type: Boolean, default: true },
      cancellation: { type: Boolean, default: true },
      validity: { type: Boolean, default: true },
      latePayment: { type: Boolean, default: true },
      extraWork: { type: Boolean, default: true },
      liability: { type: Boolean, default: true },
      materials: { type: Boolean, default: true },
      confidentiality: { type: Boolean, default: true },
      indexation: { type: Boolean, default: false },
      acceptance: { type: Boolean, default: true },
      law: { type: Boolean, default: true },
    },
    // What accepting the proposal creates: nothing, one assignment, or one per step
    assignmentMode: { type: String, enum: ['none', 'single', 'per_step'], default: 'none' },
    createdAssignments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

proposalSchema.index({ client: 1 });

module.exports = mongoose.model('Proposal', proposalSchema);
