const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', default: null },
    category: { type: String, enum: ['document', 'bill'], default: 'document' },
    originalName: { type: String, required: true },
    storedFileName: { type: String, required: true }, // name on disk
    mimeType: { type: String },
    size: { type: Number }, // bytes
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, trim: true },
    // A created invoice: its number, and the PDF itself so the record does not depend on the server's disk
    invoiceNumber: { type: String },
    pdf: { type: Buffer, select: false },
    paidAt: { type: Date, default: null }, // set by hand on the Invoices tab
  },
  { timestamps: true }
);

documentSchema.index({ client: 1 });
documentSchema.index({ assignment: 1 });
documentSchema.index({ invoiceNumber: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Document', documentSchema);
