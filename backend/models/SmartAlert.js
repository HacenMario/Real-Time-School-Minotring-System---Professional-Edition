const mongoose = require('mongoose');

const SmartAlertSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  parentEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
  type: { type: String, enum: ['absence', 'tardiness', 'achievement'], required: true, index: true },
  message: { type: String, required: true, maxlength: 5000 },
  isRead: { type: Boolean, default: false, index: true },
  isSent: { type: Boolean, default: false },
  sentAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
  alertKey: { type: String, required: true, index: true },
}, { versionKey: false });

SmartAlertSchema.index({ tenantId: 1, alertKey: 1 }, { unique: true, sparse: true });
SmartAlertSchema.index({ tenantId: 1, student: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('SmartAlert', SmartAlertSchema);
