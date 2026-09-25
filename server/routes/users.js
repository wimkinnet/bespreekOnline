const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, requireRole } = require('../middleware/auth');

router.use(protect);

// GET /api/users - list all users (admin only). Consultants can fetch a light list for assigning purposes.
router.get('/', async (req, res) => {
  try {
    const users = await User.find().sort({ name: 1 });
    if (req.user.role === 'admin') {
      return res.json(users.map((u) => u.toSafeObject()));
    }
    // Non-admins only get id/name/role, e.g. to populate "assigned consultants" pickers
    res.json(users.filter((u) => u.active).map((u) => ({ id: u._id, name: u.name, role: u.role })));
  } catch (err) {
    res.status(500).json({ message: 'Could not load users.', error: err.message });
  }
});

// POST /api/users - create a new consultant/admin account (admin only)
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, role, phone, hourlyCost } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required.' });
    }
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: 'A user with that email already exists.' });

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      role: role === 'admin' ? 'admin' : 'consultant',
      phone,
      hourlyCost,
    });
    res.status(201).json(user.toSafeObject());
  } catch (err) {
    res.status(400).json({ message: 'Could not create user.', error: err.message });
  }
});

// PUT /api/users/:id - update a user (admin only)
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, role, phone, hourlyCost, active, password } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    if (name !== undefined) user.name = name;
    if (role !== undefined) user.role = role;
    if (phone !== undefined) user.phone = phone;
    if (hourlyCost !== undefined) user.hourlyCost = hourlyCost;
    if (active !== undefined) user.active = active;
    if (password) user.password = password;

    await user.save();
    res.json(user.toSafeObject());
  } catch (err) {
    res.status(400).json({ message: 'Could not update user.', error: err.message });
  }
});

// DELETE /api/users/:id - deactivate rather than hard-delete, to preserve time-entry history
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    user.active = false;
    await user.save();
    res.json({ message: 'User deactivated.' });
  } catch (err) {
    res.status(400).json({ message: 'Could not deactivate user.', error: err.message });
  }
});

module.exports = router;
