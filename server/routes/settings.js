const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');
const { protect, requireRole } = require('../middleware/auth');

router.use(protect, requireRole('admin'));

const COMPANY_FIELDS = ['name', 'street', 'postalCode', 'city', 'country', 'enterpriseNumber', 'iban'];

// GET /api/settings/company - the company's legal details, as printed on expense claims
router.get('/company', async (req, res) => {
  try {
    const setting = await Setting.findOne({ key: 'company' });
    res.json(setting?.company || {});
  } catch (err) {
    res.status(500).json({ message: 'Could not load company details.', error: err.message });
  }
});

// PUT /api/settings/company
router.put('/company', async (req, res) => {
  try {
    const company = {};
    for (const field of COMPANY_FIELDS) {
      if (req.body[field] !== undefined) company[`company.${field}`] = req.body[field];
    }
    const setting = await Setting.findOneAndUpdate({ key: 'company' }, { $set: company }, { upsert: true, new: true });
    res.json(setting.company);
  } catch (err) {
    res.status(400).json({ message: 'Could not save company details.', error: err.message });
  }
});

module.exports = router;
