const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Assignment = require('../models/Assignment');
const Document = require('../models/Document');
const TimeEntry = require('../models/TimeEntry');
const { protect, requireRole } = require('../middleware/auth');

router.use(protect);

// Enforce the hierarchy: only a school can have a parent, and that parent must be a school group.
// Returns an error message, or null when the data is valid.
async function validateHierarchy(data, clientId) {
  if (data.type === 'school_pool') {
    data.parentPool = null;
    if (clientId) return null;
  }
  if (clientId && data.type === 'school') {
    const memberCount = await Client.countDocuments({ parentPool: clientId });
    if (memberCount > 0) {
      return `This school group still has ${memberCount} school(s). Unlink them before changing its type.`;
    }
  }
  if (!data.parentPool) {
    if (data.parentPool === '') data.parentPool = null;
    return null;
  }
  if (clientId && String(data.parentPool) === String(clientId)) {
    return 'A school cannot be its own school group.';
  }
  const parent = await Client.findById(data.parentPool).select('type');
  if (!parent || parent.type !== 'school_pool') return 'The selected school group does not exist.';
  return null;
}

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
    const schools =
      client.type === 'school_pool'
        ? await Client.find({ parentPool: client._id }).select('name address.city status').sort({ name: 1 })
        : [];
    // Assignments made directly with the school group also apply to its schools
    const groupAssignments = client.parentPool
      ? await Assignment.find({ client: client.parentPool._id }).sort({ createdAt: -1 })
      : [];

    res.json({ client, assignments, documentCount, schools, groupAssignments });
  } catch (err) {
    res.status(500).json({ message: 'Could not load client.', error: err.message });
  }
});

// POST /api/clients - admin only; consultants have read access to clients
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const data = { ...req.body };
    const hierarchyError = await validateHierarchy(data);
    if (hierarchyError) return res.status(400).json({ message: hierarchyError });
    const client = await Client.create({ ...data, createdBy: req.user._id });
    res.status(201).json(client);
  } catch (err) {
    res.status(400).json({ message: 'Could not create client.', error: err.message });
  }
});

// PUT /api/clients/:id - admin only
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const existing = await Client.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    const data = { ...req.body, type: req.body.type || existing.type };
    const hierarchyError = await validateHierarchy(data, existing._id);
    if (hierarchyError) return res.status(400).json({ message: hierarchyError });
    const client = await Client.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    });
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    res.json(client);
  } catch (err) {
    res.status(400).json({ message: 'Could not update client.', error: err.message });
  }
});

// DELETE /api/clients/:id - admin only, blocked if assignments or member schools still exist
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const memberCount = await Client.countDocuments({ parentPool: req.params.id });
    if (memberCount > 0) {
      return res.status(400).json({
        message: `This school group still has ${memberCount} school(s). Unlink them first.`,
      });
    }
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
