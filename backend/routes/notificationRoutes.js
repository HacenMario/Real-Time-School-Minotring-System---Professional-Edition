const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/auth');
const { tenantFilter } = require('../utils/access');

router.get('/', auth, async (req, res, next) => {
  try {
    let query = tenantFilter(req.user);
    if (req.user.role === 'parent') {
      query = {
        ...query,
        $or: [{ target: 'all' }, { target: String(req.user.email || '').trim().toLowerCase() }],
      };
    } else if (!['admin', 'super_admin', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({ message: 'غير مصرح لك' });
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(notifications);
  } catch (err) { next(err); }
});

router.put('/:id/read', auth, async (req, res, next) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      ...tenantFilter(req.user),
      ...(req.user.role === 'parent' ? { $or: [{ target: 'all' }, { target: String(req.user.email || '').trim().toLowerCase() }] } : {}),
    });
    if (!notification) return res.status(404).json({ message: 'الإشعار غير موجود' });

    notification.isRead = true;
    await notification.save();
    res.json({ message: 'تم تحديث الإشعار كمقروء', notification });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, isAdmin, async (req, res, next) => {
  try {
    const result = await Notification.deleteOne({ _id: req.params.id, ...tenantFilter(req.user) });
    if (!result.deletedCount) return res.status(404).json({ message: 'الإشعار غير موجود' });
    res.json({ message: 'تم حذف الإشعار' });
  } catch (err) { next(err); }
});

module.exports = router;
