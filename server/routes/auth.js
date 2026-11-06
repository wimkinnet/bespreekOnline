const express = require('express');
const router = express.Router();
const User = require('../models/User');
const generateToken = require('../utils/generateToken');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.active) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const match = await user.comparePassword(password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    res.json({ token: generateToken(user._id), user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: 'Login failed.', error: err.message });
  }
});

module.exports = router;
