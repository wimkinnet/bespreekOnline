require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const mongoose = require('mongoose');

async function seed() {
  await connectDB();

  const email = (process.env.SEED_ADMIN_EMAIL || '').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || 'Admin';

  if (!email || !password) {
    console.error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in your .env before seeding.');
    process.exit(1);
  }

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`Admin account already exists for ${email}. Nothing to do.`);
    process.exit(0);
  }

  await User.create({ name, email, password, role: 'admin' });
  console.log(`Admin account created for ${email}. You can now log in.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
