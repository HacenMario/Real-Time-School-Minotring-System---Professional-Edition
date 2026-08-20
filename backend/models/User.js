const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
  password: { type: String, required: true, minlength: 6, maxlength: 128, select: true },
  phone: { type: String, required: true, trim: true, maxlength: 40 },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'parent', 'teacher'],
    default: 'parent',
    index: true,
  },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  preferences: {
    language: { type: String, enum: ['ar', 'en', 'fr'], default: 'ar' },
  },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    this.updatedAt = new Date();
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  this.updatedAt = new Date();
  next();
});

UserSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.toSafeJSON = function() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    tenantId: this.tenantId,
    preferences: this.preferences,
  };
};

module.exports = mongoose.model('User', UserSchema);
