const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const Document = require('../models/Document');
const { protect, requireRole } = require('../middleware/auth');
const { upload, UPLOAD_ROOT } = require('../middleware/upload');

router.use(protect);

// Bills and invoices are for admins; a consultant only sees the ones they uploaded themselves
function canSeeBill(doc, user) {
  return user.role === 'admin' || (doc.uploadedBy && doc.uploadedBy.toString() === user._id.toString());
}

// Where a stored file is. Uploads used to send the file before the client, which put them in 'unfiled'.
function storedFilePath(doc) {
  const inClientFolder = path.join(UPLOAD_ROOT, doc.client.toString(), doc.storedFileName);
  if (fs.existsSync(inClientFolder)) return inClientFolder;
  const unfiled = path.join(UPLOAD_ROOT, 'unfiled', doc.storedFileName);
  return fs.existsSync(unfiled) ? unfiled : null;
}

// GET /api/documents?client=&assignment=&category=
router.get('/', async (req, res) => {
  try {
    const { client, assignment, category } = req.query;
    const filter = {};
    if (client) filter.client = client;
    if (assignment) filter.assignment = assignment;
    if (category) filter.category = category;
    if (req.user.role !== 'admin') {
      filter.$or = [{ category: { $ne: 'bill' } }, { uploadedBy: req.user._id }];
    }

    const documents = await Document.find(filter)
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(documents);
  } catch (err) {
    res.status(500).json({ message: 'Could not load documents.', error: err.message });
  }
});

// POST /api/documents - multipart upload, field name "file"
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file was uploaded.' });
    const { client, assignment, category, notes } = req.body;
    if (!client) return res.status(400).json({ message: 'A client is required.' });

    const doc = await Document.create({
      client,
      assignment: assignment || null,
      category: category === 'bill' ? 'bill' : 'document',
      originalName: req.file.originalname,
      storedFileName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user._id,
      notes,
    });

    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ message: 'Upload failed.', error: err.message });
  }
});

// GET /api/documents/:id/download
router.get('/:id/download', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id).select('+pdf');
    if (!doc || (doc.category === 'bill' && !canSeeBill(doc, req.user))) {
      return res.status(404).json({ message: 'Document not found.' });
    }
    if (doc.pdf) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${doc.originalName}"`);
      return res.send(doc.pdf);
    }

    const filePath = storedFilePath(doc);
    if (!filePath) {
      return res.status(404).json({ message: 'File is missing from storage.' });
    }
    res.download(filePath, doc.originalName);
  } catch (err) {
    res.status(500).json({ message: 'Could not download file.', error: err.message });
  }
});

// DELETE /api/documents/:id - uploader or admin
router.delete('/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    const isUploader = doc.uploadedBy && doc.uploadedBy.toString() === req.user._id.toString();
    if (req.user.role !== 'admin' && !isUploader) {
      return res.status(403).json({ message: 'You can only delete files you uploaded.' });
    }
    if (doc.invoiceNumber) {
      return res.status(400).json({ message: 'A created invoice cannot be deleted.' });
    }

    const filePath = storedFilePath(doc);
    if (filePath) fs.unlinkSync(filePath);

    await doc.deleteOne();
    res.json({ message: 'Document deleted.' });
  } catch (err) {
    res.status(400).json({ message: 'Could not delete document.', error: err.message });
  }
});

module.exports = router;
