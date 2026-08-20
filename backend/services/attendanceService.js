const Student = require('../models/Student');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { translate, detectUserLang } = require('../utils/i18n');
const {
  sendPushNotificationToParent,
  createNotification,
} = require('./notificationService');
const logger = require('../utils/logger');

async function getParentLanguage(student) {
  const parent = student.parent
    ? await User.findById(student.parent).select('preferences.language').lean()
    : await User.findOne({ email: student.parentEmail }).select('preferences.language').lean();
  return detectUserLang(parent || {}, null);
}

async function assertActiveTenant(actor) {
  if (!actor || actor.role === 'super_admin') return null;

  if (!actor.tenantId) {
    const error = new Error('حساب المستخدم غير مرتبط بمؤسسة');
    error.status = 403;
    error.code = 'TENANT_REQUIRED';
    throw error;
  }

  const tenant = await Tenant.findById(actor.tenantId).select('_id isActive name').lean();
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

async function changeStudentPresence({ studentId, actor, method = 'manual', forceStatus }) {
  const tenant = await assertActiveTenant(actor);
  const tenantFilter = actor?.role === 'super_admin' ? {} : { tenantId: actor?.tenantId || null };
  const student = await Student.findOne({ _id: studentId, ...tenantFilter });
  if (!student) {
    const error = new Error('الطالب غير موجود أو غير تابع لمؤسستك');
    error.status = 404;
    error.code = 'STUDENT_NOT_FOUND';
    throw error;
  }

  if (actor?.role !== 'super_admin' && String(student.tenantId || '') !== String(actor.tenantId)) {
    const error = new Error('لا يمكنك تعديل طالب تابع لمؤسسة أخرى');
    error.status = 403;
    error.code = 'STUDENT_TENANT_MISMATCH';
    throw error;
  }

  const oldStatus = student.isInside;
  student.isInside = typeof forceStatus === 'boolean' ? forceStatus : !student.isInside;
  const now = new Date();
  student.lastUpdate = now;
  await student.save();

  const lang = await getParentLanguage(student);
  const statusText = student.isInside
    ? translate(lang, 'attendance.status_inside')
    : translate(lang, 'attendance.status_outside');

  const attendance = await Attendance.create({
    student: student._id,
    tenantId: student.tenantId || actor?.tenantId || null,
    status: student.isInside ? 'in' : 'out',
    method,
    timestamp: now,
    studentName: student.name,
    statusText,
  });

  const message = translate(lang, method === 'qr'
    ? 'attendance.student_became_qr'
    : 'attendance.student_became', {
    name: student.name,
    status: statusText,
  });

  let notification = null;
  if (student.parentEmail) {
    notification = await createNotification({
      target: student.parentEmail,
      message,
      sender: 'Admin',
      senderRole: 'admin',
      tenantId: student.tenantId || actor?.tenantId || null,
      parentStudentId: student._id,
    });
    void sendPushNotificationToParent(
      translate(lang, 'webpush.status_title'),
      message,
      { url: '/parent-dashboard', studentId: String(student._id), status: student.isInside ? 'in' : 'out' },
      student.parentEmail,
    ).catch(err => logger.warn('Push notification failed:', err.message));
  }

  logger.info(`Presence changed: ${student.studentId} ${oldStatus} -> ${student.isInside}`);
  return { student, attendance, message, notification };
}

async function setAllStudentsPresence({ actor, newStatus }) {
  await assertActiveTenant(actor);
  const query = actor?.role === 'super_admin' ? {} : { tenantId: actor?.tenantId || null };
  const students = await Student.find(query);
  const results = [];
  const parentEmails = new Set();
  const now = new Date();
  const notifications = [];

  for (const student of students) {
    student.isInside = Boolean(newStatus);
    student.lastUpdate = now;
    await student.save();
    await Attendance.create({
      student: student._id,
      tenantId: student.tenantId || actor?.tenantId || null,
      status: newStatus ? 'in' : 'out',
      method: 'manual',
      timestamp: now,
      studentName: student.name,
      statusText: newStatus ? 'Inside' : 'Outside',
    });
    if (student.parentEmail) parentEmails.add(student.parentEmail);
    results.push(student);
  }

  for (const email of parentEmails) {
    const lang = await getParentLanguage({ parentEmail: email });
    const localizedMessage = newStatus
      ? translate(lang, 'attendance.all_inside')
      : translate(lang, 'attendance.all_outside');

    const notification = await createNotification({
      target: email,
      message: localizedMessage,
      sender: 'Admin',
      senderRole: 'admin',
      tenantId: actor?.tenantId || null,
    });
    notifications.push({ _id: notification._id, parentEmail: email, message: localizedMessage, createdAt: notification.createdAt });
    void sendPushNotificationToParent(
      translate(lang, 'push.bulk_title'),
      localizedMessage,
      { url: '/parent-dashboard' },
      email,
    ).catch(err => logger.warn('Bulk push notification failed:', err.message));
  }

  return { students: results, count: results.length, notifications };
}

module.exports = { changeStudentPresence, setAllStudentsPresence };
