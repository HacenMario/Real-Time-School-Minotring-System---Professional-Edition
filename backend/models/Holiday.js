const mongoose = require('mongoose');

const HolidaySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: '', maxlength: 1000 },
  date: { type: Date, required: true, index: true },
  endDate: { type: Date, default: null, index: true },
  isActive: { type: Boolean, default: true, index: true },
  isRecurring: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

HolidaySchema.index({ tenantId: 1, date: 1, endDate: 1 });

module.exports = mongoose.model('Holiday', HolidaySchema);
