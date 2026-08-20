const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  studentId: { type: String, unique: true, index: true, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  parentName: { type: String, required: true, trim: true, maxlength: 120 },
  parentPhone: { type: String, required: true, trim: true, maxlength: 40 },
  parentEmail: { type: String, required: true, trim: true, lowercase: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  address: { type: String, trim: true, default: '', maxlength: 500 },
  profileImage: {
    type: String,
    default: function() {
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(this.name || 'Student')}&background=4A90D9&color=fff&size=128&rounded=true`;
    },
  },
  isInside: { type: Boolean, default: false, index: true },
  lastUpdate: { type: Date, default: Date.now, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

StudentSchema.pre('save', async function(next) {
  this.updatedAt = new Date();
  if (this.isNew && !this.studentId) {
    const latest = await mongoose.model('Student').findOne({ studentId: /^STU-\d+$/ })
      .sort({ studentId: -1 }).select('studentId').lean();
    const n = latest ? Number(String(latest.studentId).slice(4)) || 0 : 0;
    this.studentId = `STU-${String(n + 1).padStart(4, '0')}`;
  }
  next();
});

StudentSchema.index({ tenantId: 1, parent: 1 });
StudentSchema.index({ tenantId: 1, isInside: 1 });

module.exports = mongoose.model('Student', StudentSchema);
