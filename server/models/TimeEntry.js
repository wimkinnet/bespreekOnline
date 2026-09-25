const mongoose = require('mongoose');

const timeEntrySchema = new mongoose.Schema(
  {
    consultant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true }, // denormalized for fast reporting
    date: { type: Date, required: true },
    // Only one of these is used, matching the assignment's billingType at the time of entry
    hours: { type: Number, min: 0 }, // for hourly assignments
    days: { type: Number, min: 0 }, // for daily assignments (supports 0.5 etc.)
    description: { type: String, trim: true },
    billable: { type: Boolean, default: true },
    // Snapshot of the rate/type used, so historical entries stay correct if the assignment rate changes later
    billingType: { type: String, enum: ['hourly', 'daily', 'fixed'], required: true },
    rateApplied: { type: Number, required: true },
    amount: { type: Number, required: true }, // computed: hours*rate, days*rate, or 0 for fixed
    invoiced: { type: Boolean, default: false },
  },
  { timestamps: true }
);

timeEntrySchema.index({ assignment: 1, date: -1 });
timeEntrySchema.index({ consultant: 1, date: -1 });

module.exports = mongoose.model('TimeEntry', timeEntrySchema);
