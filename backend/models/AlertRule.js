const mongoose = require('mongoose');

const AlertRuleSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  type: { type: String, enum: ['absence', 'tardiness', 'achievement'], required: true },
  enabled: { type: Boolean, default: true },
  conditions: {
    absenceConsecutiveDays: { type: Number, default: 3, min: 1 },
    absenceMonthlyDays: { type: Number, default: 5, min: 1 },
    tardinessPerWeek: { type: Number, default: 3, min: 1 },
    achievementConsecutiveDays: { type: Number, default: 10, min: 1 },
    achievementMonthlyDays: { type: Number, default: 20, min: 1 },
  },
  cooldownDays: { type: Number, default: 7, min: 0 },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

AlertRuleSchema.index({ tenantId: 1, type: 1 }, { unique: true });

AlertRuleSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('AlertRule', AlertRuleSchema);
