const mongoose = require('mongoose');

const SchoolSettingsSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true, unique: true, sparse: true },
  schoolName: { type: String, default: 'مدرسة النور الابتدائية', maxlength: 200 },
  address: { type: String, default: 'شارع السلام، المدينة التعليمية', maxlength: 500 },
  phone: { type: String, default: '0555 123 456', maxlength: 50 },
  email: { type: String, default: 'info@school.edu', maxlength: 320 },
  logo: { type: String, default: '', maxlength: 10000000 },
  logoFileName: { type: String, default: '', maxlength: 255 },
  schoolEndTime: { type: String, default: '16:00' },
  notificationBeforeMinutes: { type: Number, default: 30, min: 1, max: 240 },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

SchoolSettingsSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('SchoolSettings', SchoolSettingsSchema);
