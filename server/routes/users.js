const express = require('express');
const router = express.Router();
const multer = require('multer');
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

const PHOTO_TYPES = ['image/jpeg', 'image/png'];
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, PHOTO_TYPES.includes(file.mimetype)),
});

// GET /api/users/:id/photo - the photo shown on proposals (admin only)
router.get('/:id/photo', requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('+photo photoType');
    if (!user?.photo) return res.status(404).json({ message: 'No photo.' });
    res.setHeader('Content-Type', user.photoType);
    res.send(user.photo);
  } catch (err) {
    res.status(500).json({ message: 'Could not load the photo.', error: err.message });
  }
});

// PUT /api/users/:id/photo - multipart field "photo", a jpeg or png up to 5 MB (admin only)
// A photo over the limit is refused with a message instead of a server error
function receivePhoto(req, res, next) {
  photoUpload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ message: 'Choose a JPG or PNG photo of at most 5 MB.' });
    next();
  });
}

router.put('/:id/photo', requireRole('admin'), receivePhoto, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Choose a JPG or PNG photo of at most 5 MB.' });
    const user = await User.findByIdAndUpdate(req.params.id, { photo: req.file.buffer, photoType: req.file.mimetype }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json(user.toSafeObject());
  } catch (err) {
    res.status(400).json({ message: 'Could not save the photo.', error: err.message });
  }
});

// DELETE /api/users/:id/photo (admin only)
router.delete('/:id/photo', requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { $unset: { photo: 1, photoType: 1 } }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json(user.toSafeObject());
  } catch (err) {
    res.status(400).json({ message: 'Could not remove the photo.', error: err.message });
  }
});

// POST /api/users - create a new consultant/admin account (admin only)
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, role, phone, hourlyCost, homeAddress } = req.body;
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
      homeAddress,
    });
    res.status(201).json(user.toSafeObject());
  } catch (err) {
    res.status(400).json({ message: 'Could not create user.', error: err.message });
  }
});

// PUT /api/users/:id - update a user (admin only)
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, role, phone, hourlyCost, homeAddress, iban, active, password, jobTitle, bio } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    if (name !== undefined) user.name = name;
    if (role !== undefined) user.role = role;
    if (phone !== undefined) user.phone = phone;
    if (hourlyCost !== undefined) user.hourlyCost = hourlyCost;
    if (homeAddress !== undefined) user.homeAddress = homeAddress;
    if (iban !== undefined) user.iban = iban;
    if (jobTitle !== undefined) user.jobTitle = jobTitle;
    if (bio !== undefined) user.bio = bio;
    if (active !== undefined) user.active = active;
    if (password) user.password = password;

    await user.save();
    res.json(user.toSafeObject());
  } catch (err) {
    res.status(400).json({ message: 'Could not update user.', error: err.message });
  }
});

module.exports = router;
