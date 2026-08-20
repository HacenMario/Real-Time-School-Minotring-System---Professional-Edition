const express = require('express');
const router = express.Router();
const SchoolSettings = require('../models/SchoolSettings');
const { auth, isAdmin } = require('../middleware/auth');
const { tenantIdFromUser } = require('../utils/access');
const { isValidTime } = require('../utils/validation');

// Optional authentication: public visitors receive the global/default settings,
// while authenticated users receive settings belonging only to their tenant.
function optionalAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) return next();

  // Reuse the normal auth middleware. If the token is invalid, do not expose
  // another tenant's settings; simply continue as a public visitor.
  return auth(req, res, (err) => {
    if (err) return next();
    next();
  });
}

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    // Authenticated non-super-admin users are strictly isolated to their tenant.
    const tenantId = tenantIdFromUser(req.user);

    if (tenantId) {
      let settings = await SchoolSettings.findOne({ tenantId }).lean();

      // Give every institution its own settings document. Never fall back to
      // the global/legacy school settings for an authenticated tenant.
      if (!settings) {
        settings = await SchoolSettings.create({ tenantId });
        settings = settings.toObject();
      }

      return res.json(settings);
    }

    // Public visitors and Super Admin (without a tenant) use the global record.
    let settings = await SchoolSettings.findOne({ tenantId: null }).lean();
    if (!settings) {
      settings = await SchoolSettings.create({ tenantId: null });
      settings = settings.toObject();
    }

    return res.json(settings);
  } catch (err) {
    next(err);
  }
});

router.put('/', auth, isAdmin, async (req, res, next) => {
  try {
    // A normal admin must always have a valid tenant. Super Admin may manage
    // the global record only; tenant-specific management should use its tenant.
    const tenantId = tenantIdFromUser(req.user);

    const allowed = [
      'schoolName', 'address', 'phone', 'email', 'logo', 'logoFileName',
      'schoolEndTime', 'notificationBeforeMinutes',
    ];

    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    if (update.schoolEndTime !== undefined && !isValidTime(update.schoolEndTime)) {
      return res.status(400).json({ message: 'وقت نهاية المدرسة غير صالح' });
    }

    if (update.notificationBeforeMinutes !== undefined) {
      const n = Number(update.notificationBeforeMinutes);
      if (!Number.isInteger(n) || n < 1 || n > 240) {
        return res.status(400).json({ message: 'مدة التنبيه يجب أن تكون بين 1 و240 دقيقة' });
      }
      update.notificationBeforeMinutes = n;
    }

    const settings = await SchoolSettings.findOneAndUpdate(
      { tenantId: tenantId || null },
      {
        $set: { ...update, updatedAt: new Date() },
        $setOnInsert: { tenantId: tenantId || null },
      },
      { new: true, upsert: true, runValidators: true },
    );

    res.json(settings);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
