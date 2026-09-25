const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema(
  {
    // Either a school or a school group (a Client with type 'school_pool')
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String },
    status: {
      type: String,
      enum: ['prospect', 'active', 'on_hold', 'completed', 'cancelled'],
      default: 'active',
    },
    // How this assignment is billed. Rate's meaning depends on billingType:
    // hourly  -> rate is EUR per hour
    // daily   -> rate is EUR per day
    // fixed   -> rate is the total fixed fee for the whole assignment
    billingType: { type: String, enum: ['hourly', 'daily', 'fixed'], default: 'hourly' },
    rate: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'EUR' },
    budgetHours: { type: Number }, // optional cap, for internal tracking / alerts
    startDate: { type: Date },
    endDate: { type: Date },
    consultants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

assignmentSchema.index({ client: 1, status: 1 });

module.exports = mongoose.model('Assignment', assignmentSchema);
