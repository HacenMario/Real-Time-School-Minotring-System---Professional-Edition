const cron = require('node-cron');
const Student = require('../models/Student');
const SchoolSettings = require('../models/SchoolSettings');
const Notification = require('../models/Notification');
const { sendPushNotificationToParent } = require('./notificationService');
const { translate } = require('../utils/i18n');
const logger = require('../utils/logger');

let running = false;

function parentLang(student) {
  return student.parent?.preferences?.language || 'ar';
}

async function sendLeavingNotifications() {
  if (running) return;
  running = true;
  try {
    const settingsList = await SchoolSettings.find({}).lean();
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const settings of settingsList) {
      const [hour, minute] = String(settings.schoolEndTime || '16:00').split(':').map(Number);
      const endMinutes = hour * 60 + minute;
      const notifyBefore = Number(settings.notificationBeforeMinutes || 30);
      if (endMinutes - currentMinutes !== notifyBefore) continue;

      const students = await Student.find({
        tenantId: settings.tenantId,
        isInside: true,
      }).populate('parent', 'preferences.language').lean();

      for (const student of students) {
        if (!student.parentEmail) continue;
        const lang = parentLang(student);
        const key = `leaving_${settings.tenantId}_${student._id}_${new Date().toISOString().slice(0, 10)}`;

        const exists = await Notification.exists({ notificationKey: key });
        if (exists) continue;

        const body = translate(lang, 'push.leaving_body', {
          minutes: notifyBefore,
          studentName: student.name,
        });

        await Notification.create({
          target: student.parentEmail,
          message: `⏰ ${body}`,
          sender: translate(lang, 'system.sender'),
          senderRole: 'system',
          tenantId: settings.tenantId,
          parentStudentId: student._id,
          notificationKey: key,
        });

        await sendPushNotificationToParent(
          'push.leaving_title',
          'push.leaving_body',
          { minutes: notifyBefore, studentName: student.name, url: '/parent-dashboard' },
          student.parentEmail,
        );
      }
    }
  } catch (err) {
    logger.error('Leaving notification task failed:', err);
  } finally {
    running = false;
  }
}

function startNotificationScheduler() {
  cron.schedule('* * * * *', () => sendLeavingNotifications());
  logger.info('Leaving notification service started (every minute)');
}

module.exports = { startNotificationScheduler, sendLeavingNotifications };
