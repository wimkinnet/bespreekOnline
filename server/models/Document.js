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
  },
  { timestamps: true }
);

documentSchema.index({ client: 1 });
documentSchema.index({ assignment: 1 });

module.exports = mongoose.model('Document', documentSchema);
