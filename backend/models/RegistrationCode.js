const mongoose = require('mongoose');

const RegistrationCodeSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    unique: true,
    index: true,
  },
  codeHash: {
    type: String,
    required: true,
    select: false,
  },
  last4: {
    type: String,
    required: true,
    maxlength: 4,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  uses: {
    type: Number,
    default: 0,
    min: 0,
  },
  maxUses: {
    type: Number,
    default: 0,
    min: 0,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, { versionKey: false });

RegistrationCodeSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

RegistrationCodeSchema.index({ tenantId: 1 }, { unique: true });

module.exports = mongoose.model('RegistrationCode', RegistrationCodeSchema);
