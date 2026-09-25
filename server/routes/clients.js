const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Assignment = require('../models/Assignment');
const Document = require('../models/Document');
const TimeEntry = require('../models/TimeEntry');
const { protect, requireRole } = require('../middleware/auth');

router.use(protect);

// GET /api/clients?search=&status=&type=
router.get('/', async (req, res) => {
  try {
    const { search, status, type } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (search) filter.$text = { $search: search };

    const clients = await Client.find(filter).populate('parentPool', 'name').sort({ name: 1 });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ message: 'Could not load clients.', error: err.message });
  }
});

// GET /api/clients/:id - full detail including assignment summary
router.get('/:id', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).populate('parentPool', 'name');
    if (!client) return res.status(404).json({ message: 'Client not found.' });

    const assignments = await Assignment.find({ client: client._id }).sort({ createdAt: -1 });
    const documentCount = await Document.countDocuments({ client: client._id });

    res.json({ client, assignments, documentCount });
  } catch (err) {
    res.status(500).json({ message: 'Could not load client.', error: err.message });
  }
});

// POST /api/clients - admin only; consultants have read access to clients
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const client = await Client.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json(client);
  } catch (err) {
    res.status(400).json({ message: 'Could not create client.', error: err.message });
  }
});

// PUT /api/clients/:id - admin only
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    res.json(client);
  } catch (err) {
    res.status(400).json({ message: 'Could not update client.', error: err.message });
  }
});

// DELETE /api/clients/:id - admin only, blocked if assignments still exist
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const assignmentCount = await Assignment.countDocuments({ client: req.params.id });
    if (assignmentCount > 0) {
      return res.status(400).json({
        message: `This client has ${assignmentCount} assignment(s). Remove or reassign them first.`,
      });
    }
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    res.json({ message: 'Client deleted.' });
  } catch (err) {
    res.status(400).json({ message: 'Could not delete client.', error: err.message });
  }
});

module.exports = router;
