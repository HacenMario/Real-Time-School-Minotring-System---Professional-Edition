const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  userEmail: { type: String, default: null, lowercase: true, trim: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  role: { type: String, enum: ['super_admin', 'admin', 'parent', 'teacher', null], default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

SubscriptionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

SubscriptionSchema.index({ tenantId: 1, userEmail: 1 });

module.exports = mongoose.model('Subscription', SubscriptionSchema);
