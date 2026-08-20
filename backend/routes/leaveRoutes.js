const express = require('express');
const router = express.Router();
const LeaveRequest = require('../models/LeaveRequest');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/auth');
const { tenantFilter } = require('../utils/access');
const { translate, detectUserLang } = require('../utils/i18n');
const { sendPushNotificationToParent, createNotification } = require('../services/notificationService');
function tenantRoom(tenantId) { return `tenant:${tenantId || 'legacy'}`; }

function parseDate(value) {
  if (!value) return new Date();
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

router.post('/', auth, async (req, res, next) => {
  try {
    const { studentId, date, reason, fileUrl, fileName } = req.body;
    const student = await Student.findOne({
      _id: studentId,
      ...(req.user.role === 'parent' ? { parent: req.user.id } : {}),
      ...tenantFilter(req.user),
    });
    if (!student) return res.status(404).json({ message: 'الطالب غير موجود أو غير تابع لك' });

    const parsedDate = parseDate(date);
    if (!parsedDate || !String(reason || '').trim()) {
      return res.status(400).json({ message: 'التاريخ والسبب مطلوبان' });
    }

    const existing = await LeaveRequest.findOne({
      student: student._id,
      date: {
        $gte: new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate()),
        $lt: new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate() + 1),
      },
      status: 'pending',
      ...tenantFilter(req.user),
    });
    if (existing) return res.status(409).json({ message: 'يوجد طلب معلق لهذا اليوم' });

    const leaveRequest = await LeaveRequest.create({
      student: student._id,
      tenantId: student.tenantId || req.user.tenantId || null,
      parentEmail: req.user.email,
      date: parsedDate,
      reason: String(reason).trim(),
      fileUrl: fileUrl || '',
      fileName: fileName || '',
    });

    const lang = detectUserLang(req.user, req);
    const newRequestMsg = translate(lang, 'leave.new_request', { student: student.name });
    req.app.get('io').to(tenantRoom(leaveRequest.tenantId)).emit('new-leave-request', { message: newRequestMsg, requestId: leaveRequest._id });

    res.status(201).json({
      success: true,
      message: '✅ تم تقديم طلب العذر بنجاح',
      leaveRequest,
    });
  } catch (err) { next(err); }
});

router.get('/', auth, async (req, res, next) => {
  try {
    const query = req.user.role === 'parent'
      ? { parentEmail: req.user.email, ...tenantFilter(req.user) }
      : tenantFilter(req.user);

    const requests = await LeaveRequest.find(query)
      .populate('student', 'name parentName')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(requests);
  } catch (err) { next(err); }
});

router.put('/:id', auth, isAdmin, async (req, res, next) => {
  try {
    const { status, adminNote } = req.body;
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ message: 'حالة الطلب غير صالحة' });
    }

    const leaveRequest = await LeaveRequest.findOne({
      _id: req.params.id,
      ...tenantFilter(req.user),
    }).populate('student');

    if (!leaveRequest) return res.status(404).json({ message: 'الطلب غير موجود' });

    const previousStatus = leaveRequest.status;
    leaveRequest.status = status;
    leaveRequest.adminNote = adminNote || '';
    await leaveRequest.save();

    const attendanceQuery = {
      student: leaveRequest.student._id,
      tenantId: leaveRequest.tenantId || req.user.tenantId || null,
      method: 'leave',
      timestamp: {
        $gte: new Date(leaveRequest.date).setHours(0, 0, 0, 0),
        $lt: new Date(leaveRequest.date).setHours(23, 59, 59, 999),
      },
    };

    if (status === 'approved') {
      await Attendance.findOneAndUpdate(
        attendanceQuery,
        {
          $set: {
            status: 'excused',
            timestamp: leaveRequest.date,
            studentName: leaveRequest.student.name,
            statusText: 'Excused',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } else if (previousStatus === 'approved') {
      await Attendance.deleteMany(attendanceQuery);
    }

    const parentUser = await User.findOne({ email: leaveRequest.parentEmail }).select('preferences.language');
    const lang = detectUserLang(parentUser, req);
    const leaveStatusText = status === 'approved'
      ? translate(lang, 'leave.approved')
      : translate(lang, 'leave.rejected');

    const notificationMessage = translate(lang, 'leave.updated', {
      student: leaveRequest.student.name,
      status: leaveStatusText,
    });

    const notification = await createNotification({
      target: leaveRequest.parentEmail,
      message: notificationMessage,
      sender: 'Admin',
      senderRole: 'admin',
      tenantId: leaveRequest.tenantId || req.user.tenantId || null,
      parentStudentId: leaveRequest.student._id,
    });

    req.app.get('io').to(tenantRoom(leaveRequest.tenantId)).emit('leave-request-updated', {
      message: notificationMessage,
      requestId: leaveRequest._id,
      parentEmail: leaveRequest.parentEmail,
    });

    await sendPushNotificationToParent(
      status === 'approved' ? 'push.leave_approved_title' : 'push.leave_rejected_title',
      'leave.updated',
      { student: leaveRequest.student.name, status: leaveStatusText, url: '/parent-dashboard' },
      leaveRequest.parentEmail,
    );

    res.json({ success: true, message: notificationMessage, leaveRequest, notificationId: notification._id });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, isAdmin, async (req, res, next) => {
  try {
    const result = await LeaveRequest.deleteOne({ _id: req.params.id, ...tenantFilter(req.user) });
    if (!result.deletedCount) return res.status(404).json({ message: 'الطلب غير موجود' });
    res.json({ success: true, message: '✅ تم حذف الطلب' });
  } catch (err) { next(err); }
});

router.get('/file/:id', auth, async (req, res, next) => {
  try {
    const request = await LeaveRequest.findOne({
      _id: req.params.id,
      ...(req.user.role === 'parent' ? { parentEmail: req.user.email } : {}),
      ...tenantFilter(req.user),
    });
    if (!request) return res.status(404).json({ message: 'الطلب غير موجود' });
    if (!request.fileUrl) return res.status(404).json({ message: 'لا يوجد ملف مرفق' });
    res.redirect(request.fileUrl);
  } catch (err) { next(err); }
});

module.exports = router;
