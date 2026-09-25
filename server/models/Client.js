const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['school', 'school_pool'], default: 'school' },
    // A school may optionally belong to a school group (scholengroep); school groups have no parent.
    // Assignments can be linked to either a school or a school group.
    parentPool: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    address: {
      street: String,
      postalCode: String,
      city: String,
      country: { type: String, default: 'Belgium' },
    },
    vatNumber: { type: String, trim: true },
    contactName: { type: String, trim: true },
    contactEmail: { type: String, trim: true },
    contactPhone: { type: String, trim: true },
    notes: { type: String },
    status: { type: String, enum: ['active', 'inactive', 'prospect'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

clientSchema.index({ name: 'text' });

module.exports = mongoose.model('Client', clientSchema);
