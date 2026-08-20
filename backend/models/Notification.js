const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  sender: { type: String, default: 'Admin', maxlength: 160 },
  target: { type: String, required: true, index: true, maxlength: 320 },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  message: { type: String, required: true, maxlength: 5000 },
  subject: { type: String, default: '', maxlength: 300 },
  senderRole: { type: String, enum: ['admin', 'super_admin', 'teacher', 'parent', 'system'], default: 'admin' },
  parentStudentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
  notificationKey: { type: String, default: null, index: true, unique: true, sparse: true },
  isRead: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
}, { versionKey: false });

NotificationSchema.index({ tenantId: 1, target: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
