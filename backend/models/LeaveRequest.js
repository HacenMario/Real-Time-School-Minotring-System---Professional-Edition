const mongoose = require('mongoose');

const LeaveRequestSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  parentEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
  date: { type: Date, required: true, default: Date.now, index: true },
  reason: { type: String, required: true, trim: true, maxlength: 2000 },
  fileUrl: { type: String, default: '', maxlength: 10000000 },
  fileName: { type: String, default: '', maxlength: 255 },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  adminNote: { type: String, default: '', maxlength: 2000 },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

LeaveRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

LeaveRequestSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('LeaveRequest', LeaveRequestSchema);
