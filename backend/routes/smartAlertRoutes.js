const express = require('express');
const router = express.Router();
const SmartAlert = require('../models/SmartAlert');
const AlertRule = require('../models/AlertRule');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/auth');
const { tenantFilter } = require('../utils/access');
const { runAllSmartAlerts } = require('../services/smartAlertScheduler');

router.get('/', auth, async (req, res, next) => {
  try {
    const query = {
      ...tenantFilter(req.user),
      ...(req.user.role === 'parent' ? { parentEmail: req.user.email } : {}),
    };
    const alerts = await SmartAlert.find(query)
      .populate('student', 'name parentName')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(alerts);
  } catch (err) { next(err); }
});

router.put('/:id/read', auth, async (req, res, next) => {
  try {
    const alert = await SmartAlert.findOne({
      _id: req.params.id,
      ...tenantFilter(req.user),
      ...(req.user.role === 'parent' ? { parentEmail: req.user.email } : {}),
    });
    if (!alert) return res.status(404).json({ message: 'التنبيه غير موجود' });
    alert.isRead = true;
    await alert.save();
    res.json({ success: true, message: 'تم تحديث التنبيه كمقروء' });
  } catch (err) { next(err); }
});

router.get('/rules', auth, isAdmin, async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId || null;
    const defaults = [
      { tenantId, type: 'absence', conditions: { absenceConsecutiveDays: 3, absenceMonthlyDays: 5 }, cooldownDays: 7 },
      { tenantId, type: 'tardiness', conditions: { tardinessPerWeek: 3 }, cooldownDays: 7 },
      { tenantId, type: 'achievement', conditions: { achievementConsecutiveDays: 10, achievementMonthlyDays: 20 }, cooldownDays: 14 },
    ];

    for (const item of defaults) {
      await AlertRule.updateOne(
        { tenantId, type: item.type },
        { $setOnInsert: item },
        { upsert: true },
      );
    }

    res.json(await AlertRule.find({ tenantId }));
  } catch (err) { next(err); }
});

router.put('/rules/:type', auth, isAdmin, async (req, res, next) => {
  try {
    if (!['absence', 'tardiness', 'achievement'].includes(req.params.type)) {
      return res.status(400).json({ message: 'نوع القاعدة غير صالح' });
    }
    const { enabled, conditions, cooldownDays } = req.body;
    const rule = await AlertRule.findOne({
      tenantId: req.user.tenantId || null,
      type: req.params.type,
    });
    if (!rule) return res.status(404).json({ message: 'القاعدة غير موجودة' });

    if (enabled !== undefined) rule.enabled = Boolean(enabled);
    if (conditions && typeof conditions === 'object') {
      for (const [key, value] of Object.entries(conditions)) {
        if (key in rule.conditions && Number.isFinite(Number(value)) && Number(value) >= 1) {
          rule.conditions[key] = Number(value);
        }
      }
    }
    if (cooldownDays !== undefined && Number(cooldownDays) >= 0) rule.cooldownDays = Number(cooldownDays);
    await rule.save();
    res.json({ success: true, message: 'تم تحديث القاعدة بنجاح', rule });
  } catch (err) { next(err); }
});

router.post('/run', auth, isAdmin, async (req, res, next) => {
  try {
    const result = await runAllSmartAlerts();
    res.json({ success: true, message: 'تم تشغيل جميع التنبيهات الذكية بنجاح', ...result });
  } catch (err) { next(err); }
});

router.delete('/clear', auth, isAdmin, async (req, res, next) => {
  try {
    const result = await SmartAlert.deleteMany(tenantFilter(req.user));
    res.json({ success: true, deletedCount: result.deletedCount, message: `تم حذف ${result.deletedCount} تنبيه ذكي بنجاح` });
  } catch (err) { next(err); }
});

module.exports = router;
