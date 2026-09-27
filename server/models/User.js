const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ['admin', 'consultant'], default: 'consultant' },
    active: { type: Boolean, default: true },
    phone: { type: String, trim: true },
    hourlyCost: { type: Number }, // optional: internal cost rate, not shown to clients
    // Starting point for travel-distance calculations to clients
    homeAddress: {
      street: { type: String, trim: true },
      postalCode: { type: String, trim: true },
      city: { type: String, trim: true },
      country: { type: String, default: 'Belgium' },
    },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    active: this.active,
    phone: this.phone,
    homeAddress: this.homeAddress,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
