const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Student = require('../models/Student');
const { createNotification, sendPushNotificationToUser } = require('../services/notificationService');
const { tenantFilter } = require('../utils/access');
const { translate, detectUserLang } = require('../utils/i18n');

router.get('/my-children', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'parent') return res.status(403).json({ msg: 'غير مصرح لك بالوصول إلى هذه البيانات' });
    const students = await Student.find({
      parent: req.user.id,
      ...tenantFilter(req.user),
    }).sort({ name: 1 });
    res.json(students);
  } catch (err) { next(err); }
});

router.post('/send-message', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'parent') return res.status(403).json({ msg: 'غير مصرح لك بإرسال رسائل' });

    const { studentId, subject, message } = req.body;
    if (!studentId || !String(message || '').trim()) {
      return res.status(400).json({ msg: 'الرجاء تحديد الطالب ونص الرسالة' });
    }

    const student = await Student.findOne({
      _id: studentId,
      parent: req.user.id,
      ...tenantFilter(req.user),
    });
    if (!student) return res.status(404).json({ msg: 'الطالب غير موجود أو غير تابع لك' });

    const newNotification = await createNotification({
      sender: req.user.name,
      target: 'admin',
      tenantId: req.user.tenantId || null,
      subject: subject || 'رسالة من ولي أمر',
      message: `رسالة من ولي أمر الطالب (${student.name}): ${String(message).trim()}`,
      senderRole: 'parent',
      parentStudentId: student._id,
    });

    const io = req.app.get('io');
    const admins = await User.find({
      role: { $in: ['admin', 'super_admin'] },
      ...tenantFilter(req.user),
    }).select('email preferences.language');

    const lang = detectUserLang(req.user, req);
    const notifMsg = translate(lang, 'parent.message_notification', {
      parent: req.user.name, student: student.name,
    });

    for (const admin of admins) {
      const adminEmail = String(admin.email || '').trim().toLowerCase();
      if (!adminEmail) continue;

      // Real-time in-app notification. Socket registry stores normalized emails.
      const socketIds = req.app.locals.userSockets?.get(adminEmail) || [];
      for (const socketId of socketIds) {
        io.to(socketId).emit('notification', {
          message: notifMsg,
          notificationId: newNotification._id,
          createdAt: newNotification.createdAt,
        });
      }

      // Browser Push notification for admins who are not currently viewing the dashboard.
      await sendPushNotificationToUser(
        'notification.title',
        notifMsg,
        { url: '/admin-dashboard', notificationId: String(newNotification._id) },
        adminEmail,
      );
    }

    res.json({ msg: 'تم إرسال رسالتك إلى المدرسة بنجاح' });
  } catch (err) { next(err); }
});

module.exports = router;
