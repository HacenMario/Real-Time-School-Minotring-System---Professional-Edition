const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const Student = require('../models/Student');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const Attendance = require('../models/Attendance');
const auth = require('../middleware/auth');
const { isAdmin, isStaff } = require('../middleware/auth');
const { tenantFilter } = require('../utils/access');
const { changeStudentPresence } = require('../services/attendanceService');
const { translate, detectUserLang } = require('../utils/i18n');
const { createNotification } = require('../services/notificationService');

function tenantRoom(tenantId) { return `tenant:${tenantId || 'legacy'}`; }

function emitToUser(req, email, event, payload) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return;
  const io = req.app.get('io');
  const sockets = req.app.locals.userSockets;
  if (!io || !sockets) return;
  const ids = sockets.get(normalized);
  if (!ids) return;
  for (const socketId of ids) io.to(socketId).emit(event, payload);
}


async function requireActiveTenantForAdmin(req) {
  if (req.user.role === 'super_admin') return null;
  if (!req.user.tenantId) {
    const error = new Error('حساب المستخدم غير مرتبط بمؤسسة');
    error.status = 403;
    error.code = 'TENANT_REQUIRED';
    throw error;
  }
  const tenant = await Tenant.findById(req.user.tenantId).select('_id isActive name').lean();
  if (!tenant) {
    const error = new Error('المؤسسة المرتبطة بالحساب غير موجودة');
    error.status = 403;
    error.code = 'TENANT_UNAVAILABLE';
    throw error;
  }
  if (!tenant.isActive) {
    const error = new Error('المؤسسة التابع لها حسابك معطلة حالياً');
    error.status = 403;
    error.code = 'TENANT_DISABLED';
    throw error;
  }
  return tenant;
}

function scopedStudentQuery(req, extra = {}) {
  const scope = req.user.role === 'super_admin' ? {} : { tenantId: req.user.tenantId || null };
  if (req.user.role === 'parent') scope.parent = req.user.id;
  return { ...scope, ...extra };
}

router.get('/', auth, async (req, res, next) => {
  try {
    const students = await Student.find(scopedStudentQuery(req))
      .populate('parent', 'name email phone')
      .sort({ name: 1 });
    res.json(students);
  } catch (err) { next(err); }
});

router.post('/', auth, isAdmin, async (req, res, next) => {
  try {
    await requireActiveTenantForAdmin(req);
    const { name, parentEmail, parentName, parentPhone, address } = req.body;
    if (!name || !parentEmail) return res.status(400).json({ message: 'اسم الطالب وبريد ولي الأمر مطلوبان' });

    const parent = await User.findOne({
      email: String(parentEmail).trim().toLowerCase(),
      role: 'parent',
      ...tenantFilter(req.user),
    });
    if (!parent) return res.status(400).json({ message: 'ولي الأمر غير موجود، يجب تسجيله أولاً' });

    const newStudent = new Student({
      name: String(name).trim(),
      parent: parent._id,
      parentName: parentName || parent.name,
      parentPhone: parentPhone || parent.phone,
      parentEmail: parent.email,
      address: address || '',
      tenantId: req.user.tenantId || null,
    });

    await newStudent.save();
    await User.updateOne({ _id: parent._id }, { $addToSet: { students: newStudent._id } });
    res.status(201).json(newStudent);
  } catch (err) { next(err); }
});

router.put('/:id/toggle', auth, isAdmin, async (req, res, next) => {
  try {
    await requireActiveTenantForAdmin(req);

    const result = await changeStudentPresence({
      studentId: req.params.id,
      actor: req.user,
      method: 'manual',
    });

    const io = req.app.get('io');
    if (io) {
      io.to(tenantRoom(result.student.tenantId)).emit('status-changed', {
        student: result.student,
        message: result.message,
        parentId: result.student.parent ? String(result.student.parent) : null,
        parentEmail: result.student.parentEmail,
        timestamp: result.attendance?.timestamp || result.student.lastUpdate,
        createdAt: result.notification?.createdAt || result.attendance?.timestamp || result.student.lastUpdate,
      });
      if (result.notification) {
        emitToUser(req, result.student.parentEmail, 'notification', {
          message: result.notification.message, notificationId: result.notification._id, createdAt: result.notification.createdAt,
        });
      }
    }

    res.json(result.student);
  } catch (err) { next(err); }
});

router.delete('/:id', auth, isAdmin, async (req, res, next) => {
  try {
    await requireActiveTenantForAdmin(req);
    const student = await Student.findOneAndDelete({
      _id: req.params.id,
      ...tenantFilter(req.user),
    });
    if (!student) return res.status(404).json({ message: 'غير موجود' });

    await User.updateOne({ _id: student.parent }, { $pull: { students: student._id } });
    await Attendance.deleteMany({ student: student._id, ...tenantFilter(req.user) });
    res.json({ message: 'تم الحذف' });
  } catch (err) { next(err); }
});

router.get('/:id/attendance', auth, async (req, res, next) => {
  try {
    const student = await Student.findOne(scopedStudentQuery(req, { _id: req.params.id }));
    if (!student) return res.status(404).json({ message: 'غير موجود' });

    const records = await Attendance.find({
      student: student._id,
      ...(req.user.role === 'super_admin' ? {} : { tenantId: req.user.tenantId || null }),
    }).sort({ timestamp: -1 }).limit(100);

    res.json(records);
  } catch (err) { next(err); }
});

router.post('/scan-qr', auth, async (req, res, next) => {
  try {
    const cleanData = String(req.body.qrData || '').trim();
    if (!cleanData) return res.status(400).json({ success: false, message: 'بيانات QR مطلوبة' });

    const query = scopedStudentQuery(req, { studentId: cleanData });
    let student = await Student.findOne(query);
    if (!student && /^[0-9a-fA-F]{24}$/.test(cleanData)) {
      student = await Student.findOne(scopedStudentQuery(req, { _id: cleanData }));
    }
    if (!student) return res.status(404).json({ success: false, message: 'الطالب غير موجود أو غير تابع لحسابك' });

    const result = await changeStudentPresence({
      studentId: student._id,
      actor: req.user,
      method: 'qr',
    });

    req.app.get('io').to(tenantRoom(result.student.tenantId)).emit('status-changed', {
      student: result.student,
      message: result.message,
      parentId: result.student.parent ? String(result.student.parent) : null,
      parentEmail: result.student.parentEmail,
      timestamp: result.attendance?.timestamp || result.student.lastUpdate,
      createdAt: result.notification?.createdAt || result.attendance?.timestamp || result.student.lastUpdate,
    });
    if (result.notification) {
      emitToUser(req, result.student.parentEmail, 'notification', {
        message: result.notification.message, notificationId: result.notification._id, createdAt: result.notification.createdAt,
      });
    }

    res.json({ success: true, message: result.message, student: result.student });
  } catch (err) { next(err); }
});

router.get('/:id/qr', auth, async (req, res, next) => {
  try {
    const student = await Student.findOne(scopedStudentQuery(req, { _id: req.params.id }));
    if (!student) return res.status(404).json({ message: 'الطالب غير موجود' });

    const qrData = student.studentId || String(student._id);
    const buffer = await QRCode.toBuffer(qrData, {
      type: 'png', width: 300, margin: 4,
      color: { dark: '#1a365d', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    });

    const fileName = `QR_${student.name}_${student.studentId}.png`;
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.send(buffer);
  } catch (err) { next(err); }
});

router.put('/:id', auth, isAdmin, async (req, res, next) => {
  try {
    await requireActiveTenantForAdmin(req);
    const student = await Student.findOne(scopedStudentQuery(req, { _id: req.params.id }));
    if (!student) return res.status(404).json({ message: 'الطالب غير موجود' });

    const { name, parentName, parentPhone, parentEmail, address } = req.body;
    if (name !== undefined) student.name = String(name).trim();
    if (parentName !== undefined) student.parentName = String(parentName).trim();
    if (parentPhone !== undefined) student.parentPhone = String(parentPhone).trim();
    if (address !== undefined) student.address = String(address).trim();

    if (parentEmail && parentEmail.toLowerCase() !== student.parentEmail) {
      const parent = await User.findOne({
        email: parentEmail.toLowerCase(),
        role: 'parent',
        ...tenantFilter(req.user),
      });
      if (!parent) return res.status(400).json({ message: 'ولي الأمر الجديد غير موجود' });

      await User.updateOne({ _id: student.parent }, { $pull: { students: student._id } });
      student.parent = parent._id;
      student.parentEmail = parent.email;
      student.parentName = parentName || parent.name;
      student.parentPhone = parentPhone || parent.phone;
      await User.updateOne({ _id: parent._id }, { $addToSet: { students: student._id } });
    }

    await student.save();
    res.json({ message: 'تم تحديث معلومات الطالب بنجاح', student });
  } catch (err) { next(err); }
});

router.put('/bulk/toggle', auth, isAdmin, async (req, res, next) => {
  try {
    await requireActiveTenantForAdmin(req);
    const { newStatus } = req.body;
    if (typeof newStatus !== 'boolean') return res.status(400).json({ message: 'newStatus يجب أن يكون true أو false' });
    const { setAllStudentsPresence } = require('../services/attendanceService');
    const result = await setAllStudentsPresence({ actor: req.user, newStatus });
    req.app.get('io').to(tenantRoom(req.user.tenantId)).emit('status-changed', {
      message: newStatus ? 'تم تغيير حالة جميع الطلاب إلى داخل 🏫' : 'تم تغيير حالة جميع الطلاب إلى خارج 🚪',
      isBulk: true, newStatus, count: result.count,
    });
    for (const notification of (result.notifications || [])) {
      emitToUser(req, notification.parentEmail, 'notification', {
        message: notification.message, notificationId: notification._id, createdAt: notification.createdAt,
      });
    }
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

module.exports = router;
