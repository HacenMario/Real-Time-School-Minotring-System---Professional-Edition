const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const Tenant = require('../models/Tenant');
const RegistrationCode = require('../models/RegistrationCode');
const User = require('../models/User');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const SmartAlert = require('../models/SmartAlert');
const Notification = require('../models/Notification');
const LeaveRequest = require('../models/LeaveRequest');
const Holiday = require('../models/Holiday');
const auth = require('../middleware/auth');
const { authorize } = require('../middleware/auth');
const { isEmail, isStrongEnoughPassword, cleanString } = require('../utils/validation');

router.use(auth, authorize('super_admin'));

function validObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function tenantPayload(t) {
  return {
    id: String(t._id),
    name: t.name,
    key: t.key,
    isActive: t.isActive,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

// High-level system overview.
router.get('/overview', async (req, res, next) => {
  try {
    const [tenants, users, students, attendanceToday, alerts, leaveRequests] = await Promise.all([
      Tenant.countDocuments(),
      User.countDocuments(),
      Student.countDocuments(),
      Attendance.countDocuments({
        date: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lt: new Date(new Date().setHours(24, 0, 0, 0)),
        },
      }),
      SmartAlert.countDocuments({ status: { $in: ['active', 'unread', 'open'] } }),
      LeaveRequest.countDocuments({ status: 'pending' }),
    ]);

    const [activeTenants, parents, admins, teachers, insideStudents, outsideStudents] = await Promise.all([
      Tenant.countDocuments({ isActive: true }),
      User.countDocuments({ role: 'parent' }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'teacher' }),
      Student.countDocuments({ isInside: true }),
      Student.countDocuments({ isInside: false }),
    ]);

    const dbReady = mongoose.connection.readyState === 1;

    res.json({
      generatedAt: new Date().toISOString(),
      system: {
        database: dbReady ? 'connected' : 'disconnected',
        uptime: process.uptime(),
        node: process.version,
        environment: process.env.NODE_ENV || 'production',
      },
      counts: {
        tenants,
        activeTenants,
        users,
        students,
        attendanceToday,
        alerts,
        pendingLeaveRequests: leaveRequests,
      },
      usersByRole: { parents, admins, teachers },
      studentsByPresence: { inside: insideStudents, outside: outsideStudents },
    });
  } catch (err) {
    next(err);
  }
});

// Detailed tenant list with aggregate counts.
router.get('/tenants', async (req, res, next) => {
  try {
    const tenants = await Tenant.find().sort({ createdAt: -1 }).lean();
    const result = await Promise.all(tenants.map(async (tenant) => {
      const id = tenant._id;
      const [users, students, admins, parents, teachers] = await Promise.all([
        User.countDocuments({ tenantId: id }),
        Student.countDocuments({ tenantId: id }),
        User.countDocuments({ tenantId: id, role: 'admin' }),
        User.countDocuments({ tenantId: id, role: 'parent' }),
        User.countDocuments({ tenantId: id, role: 'teacher' }),
      ]);
      return {
        ...tenantPayload(tenant),
        stats: { users, students, admins, parents, teachers },
      };
    }));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/tenants', async (req, res, next) => {
  try {
    const name = cleanString(req.body.name, 160);
    const key = cleanString(req.body.key, 64).toLowerCase();

    if (!name || !/^[a-z0-9][a-z0-9-_]{2,63}$/.test(key)) {
      return res.status(400).json({ message: 'اسم المؤسسة أو مفتاحها غير صالح' });
    }

    const exists = await Tenant.findOne({ key });
    if (exists) return res.status(409).json({ message: 'مفتاح المؤسسة مستخدم بالفعل' });

    const tenant = await Tenant.create({ name, key, isActive: true });
    res.status(201).json({ tenant: tenantPayload(tenant) });
  } catch (err) {
    next(err);
  }
});

function generateRegistrationCode() {
  const raw = crypto.randomBytes(12).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const value = raw.slice(0, 18).padEnd(18, 'X');
  return `ST-${value.slice(0, 6)}-${value.slice(6, 12)}-${value.slice(12, 18)}`;
}

function normalizeRegistrationCode(value) {
  return String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

// Return non-secret metadata for a tenant's registration code.
router.get('/tenants/:id/registration-code', async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({ message: 'معرف المؤسسة غير صالح' });
    }
    const tenant = await Tenant.findById(req.params.id).lean();
    if (!tenant) return res.status(404).json({ message: 'المؤسسة غير موجودة' });

    const code = await RegistrationCode.findOne({ tenantId: tenant._id }).lean();
    if (!code) {
      return res.json({
        exists: false,
        isActive: false,
        uses: 0,
        maxUses: 0,
        expiresAt: null,
        last4: null,
      });
    }

    res.json({
      exists: true,
      isActive: code.isActive,
      uses: code.uses,
      maxUses: code.maxUses,
      expiresAt: code.expiresAt,
      last4: code.last4,
      createdAt: code.createdAt,
      updatedAt: code.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

// Generate or rotate an institution registration code.
// The plaintext code is returned only in this response and is never stored.
router.post('/tenants/:id/registration-code', async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({ message: 'معرف المؤسسة غير صالح' });
    }

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'المؤسسة غير موجودة' });
    if (!tenant.isActive) return res.status(400).json({ message: 'فعّل المؤسسة أولاً قبل إنشاء رمز التسجيل' });

    const plaintext = generateRegistrationCode();
    const normalized = normalizeRegistrationCode(plaintext);
    const codeHash = crypto.createHash('sha256').update(normalized).digest('hex');

    const rawMaxUses = Number(req.body?.maxUses);
    const maxUses = Number.isFinite(rawMaxUses) && rawMaxUses >= 0
      ? Math.min(Math.floor(rawMaxUses), 100000)
      : 0;

    const rawExpiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
    const expiresAt = rawExpiresAt && !Number.isNaN(rawExpiresAt.getTime()) && rawExpiresAt.getTime() > Date.now()
      ? rawExpiresAt
      : null;

    const registration = await RegistrationCode.findOneAndUpdate(
      { tenantId: tenant._id },
      {
        tenantId: tenant._id,
        codeHash,
        last4: normalized.slice(-4),
        isActive: true,
        uses: 0,
        maxUses,
        expiresAt,
        updatedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    res.status(201).json({
      code: plaintext,
      tenant: { id: String(tenant._id), name: tenant.name, key: tenant.key },
      registration: {
        isActive: registration.isActive,
        uses: registration.uses,
        maxUses: registration.maxUses,
        expiresAt: registration.expiresAt,
        last4: registration.last4,
      },
      warning: 'احتفظ بالرمز في مكان آمن. لن يتم تخزين النص الأصلي للرمز ولن يظهر مجددًا.',
    });
  } catch (err) {
    next(err);
  }
});

// Activate/deactivate the current registration code without revealing it.
router.put('/tenants/:id/registration-code', async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({ message: 'معرف المؤسسة غير صالح' });
    }

    const isActive = Boolean(req.body?.isActive);
    const code = await RegistrationCode.findOneAndUpdate(
      { tenantId: req.params.id },
      { $set: { isActive, updatedAt: new Date() } },
      { new: true }
    ).lean();

    if (!code) return res.status(404).json({ message: 'لا يوجد رمز تسجيل لهذه المؤسسة' });

    res.json({
      isActive: code.isActive,
      uses: code.uses,
      maxUses: code.maxUses,
      expiresAt: code.expiresAt,
      last4: code.last4,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/tenants/:id', async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({ message: 'معرف المؤسسة غير صالح' });
    }

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'المؤسسة غير موجودة' });

    if (req.body.name !== undefined) {
      const name = cleanString(req.body.name, 160);
      if (!name) return res.status(400).json({ message: 'اسم المؤسسة مطلوب' });
      tenant.name = name;
    }

    if (req.body.isActive !== undefined) {
      tenant.isActive = Boolean(req.body.isActive);
    }

    await tenant.save();
    res.json({ tenant: tenantPayload(tenant) });
  } catch (err) {
    next(err);
  }
});

// Users across all tenants. Passwords are never returned.
router.get('/users', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const filter = {};

    if (req.query.role && ['admin', 'teacher', 'parent'].includes(req.query.role)) {
      filter.role = req.query.role;
    }
    if (req.query.tenantId) {
      if (!validObjectId(req.query.tenantId)) {
        return res.status(400).json({ message: 'معرف المؤسسة غير صالح' });
      }
      filter.tenantId = req.query.tenantId;
    }

    const users = await User.find(filter)
      .select('name email phone role tenantId preferences createdAt updatedAt')
      .populate('tenantId', 'name key isActive')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json(users.map(u => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      tenant: u.tenantId ? {
        id: String(u.tenantId._id),
        name: u.tenantId.name,
        key: u.tenantId.key,
        isActive: u.tenantId.isActive,
      } : null,
      language: u.preferences?.language || 'ar',
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    })));
  } catch (err) {
    next(err);
  }
});

// Create an admin/teacher/parent for a selected institution.
// Creating another super_admin is intentionally not exposed here.
router.post('/users', async (req, res, next) => {
  try {
    const name = cleanString(req.body.name, 120);
    const email = cleanString(req.body.email, 320).toLowerCase();
    const password = req.body.password;
    const phone = cleanString(req.body.phone, 40);
    const role = String(req.body.role || '').trim();
    const tenantId = String(req.body.tenantId || '').trim();

    if (!name || !isEmail(email) || !isStrongEnoughPassword(password) || !phone) {
      return res.status(400).json({ message: 'بيانات المستخدم غير صالحة' });
    }
    if (!['admin', 'teacher', 'parent'].includes(role)) {
      return res.status(400).json({ message: 'الدور غير مسموح' });
    }
    if (!validObjectId(tenantId)) {
      return res.status(400).json({ message: 'المؤسسة غير صالحة' });
    }

    const [existing, tenant] = await Promise.all([
      User.findOne({ email }),
      Tenant.findById(tenantId),
    ]);

    if (existing) return res.status(409).json({ message: 'البريد الإلكتروني مستخدم بالفعل' });
    if (!tenant) return res.status(404).json({ message: 'المؤسسة غير موجودة' });

    const user = await User.create({
      name, email, password, phone, role, tenantId: tenant._id,
    });

    res.status(201).json({
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        tenantId: user.tenantId,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/users/:id/role', async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'معرف المستخدم غير صالح' });
    const role = String(req.body.role || '').trim();
    if (!['admin', 'teacher', 'parent'].includes(role)) {
      return res.status(400).json({ message: 'الدور غير مسموح' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    if (user.role === 'super_admin') {
      return res.status(403).json({ message: 'لا يمكن تعديل صلاحيات Super Admin من هذه الواجهة' });
    }

    user.role = role;
    await user.save();

    res.json({
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        tenantId: user.tenantId,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/tenants/:id/summary', async (req, res, next) => {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'معرف المؤسسة غير صالح' });
    const tenant = await Tenant.findById(req.params.id).lean();
    if (!tenant) return res.status(404).json({ message: 'المؤسسة غير موجودة' });

    const tenantId = tenant._id;
    const [users, students, attendance, alerts, pendingLeaves] = await Promise.all([
      User.countDocuments({ tenantId }),
      Student.countDocuments({ tenantId }),
      Attendance.countDocuments({ tenantId }),
      SmartAlert.countDocuments({ tenantId, status: { $in: ['active', 'unread', 'open'] } }),
      LeaveRequest.countDocuments({ tenantId, status: 'pending' }),
    ]);

    res.json({
      tenant: tenantPayload(tenant),
      stats: { users, students, attendance, alerts, pendingLeaves },
    });
  } catch (err) {
    next(err);
  }
});

// Recent activity aggregated from existing records. This avoids introducing a
// new write path and therefore does not alter existing business logic.
router.get('/activity', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 5), 100);

    const [notifications, leaves, alerts] = await Promise.all([
      Notification.find().select('message sender senderRole tenantId createdAt').sort({ createdAt: -1 }).limit(limit).lean(),
      LeaveRequest.find().select('student parent status tenantId createdAt updatedAt').sort({ updatedAt: -1 }).limit(limit).lean(),
      SmartAlert.find().select('type title message tenantId status createdAt').sort({ createdAt: -1 }).limit(limit).lean(),
    ]);

    const activity = [
      ...notifications.map(x => ({
        type: 'notification',
        title: 'إشعار',
        message: x.message,
        actor: x.sender || x.senderRole || 'system',
        tenantId: x.tenantId ? String(x.tenantId) : null,
        createdAt: x.createdAt,
      })),
      ...leaves.map(x => ({
        type: 'leave',
        title: 'طلب عذر',
        message: `حالة الطلب: ${x.status}`,
        actor: 'system',
        tenantId: x.tenantId ? String(x.tenantId) : null,
        createdAt: x.updatedAt || x.createdAt,
      })),
      ...alerts.map(x => ({
        type: 'alert',
        title: x.title || x.type || 'تنبيه ذكي',
        message: x.message || '',
        actor: 'smart-alert',
        tenantId: x.tenantId ? String(x.tenantId) : null,
        createdAt: x.createdAt,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);

    res.json(activity);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
