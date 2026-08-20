const express = require('express');
const router = express.Router();
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/auth');
const { tenantFilter } = require('../utils/access');

router.post('/subscribe', auth, async (req, res, next) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ message: 'بيانات اشتراك غير صالحة' });
    }

    const user = await User.findById(req.user.id).select('email role tenantId');
    if (!user) return res.status(401).json({ message: 'المستخدم غير موجود' });

    const update = {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userEmail: String(user.email || '').trim().toLowerCase(),
      userId: user._id,
      tenantId: user.tenantId || null,
      role: user.role,
      updatedAt: new Date(),
    };

    await Subscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      { $set: update, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true, runValidators: true },
    );

    res.status(201).json({ success: true, message: 'تم تسجيل الاشتراك بنجاح' });
  } catch (err) { next(err); }
});

router.delete('/unsubscribe', auth, async (req, res, next) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ message: 'endpoint مطلوب' });

    const result = await Subscription.findOneAndDelete({
      endpoint,
      userId: req.user.id,
      ...tenantFilter(req.user),
    });
    if (!result) return res.status(404).json({ message: 'الاشتراك غير موجود' });
    res.json({ success: true, message: 'تم إلغاء الاشتراك' });
  } catch (err) { next(err); }
});

router.get('/', auth, isAdmin, async (req, res, next) => {
  try {
    const subscriptions = await Subscription.find(tenantFilter(req.user)).select('-keys');
    res.json(subscriptions);
  } catch (err) { next(err); }
});

module.exports = router;
