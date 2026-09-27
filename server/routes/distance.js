const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { travelForConsultant, DistanceError } = require('../utils/distance');

router.use(protect);

// GET /api/distance?client=<id>&consultant=<id>
// Driving distance from the consultant's home address to the client, plus the resulting travel cost.
// Consultant defaults to the logged-in user; only admins may look up another consultant.
router.get('/', async (req, res) => {
  try {
    const { client: clientId, consultant: consultantId } = req.query;
    if (!clientId) return res.status(400).json({ message: 'A client is required.' });

    if (consultantId && consultantId !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You can only look up your own travel distance.' });
    }

    const client = await Client.findById(clientId).select('name address');
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    const consultant = consultantId ? await User.findById(consultantId).select('name homeAddress') : req.user;
    if (!consultant) return res.status(404).json({ message: 'Consultant not found.' });

    res.json(await travelForConsultant(consultant, client));
  } catch (err) {
    if (err instanceof DistanceError) return res.status(422).json({ message: err.message });
    res.status(502).json({ message: 'Could not calculate the distance.', error: err.message });
  }
});

module.exports = router;
