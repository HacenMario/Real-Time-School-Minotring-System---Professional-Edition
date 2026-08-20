const cron = require('node-cron');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const SmartAlert = require('../models/SmartAlert');
const AlertRule = require('../models/AlertRule');
const Holiday = require('../models/Holiday');
const { sendPushNotificationToParent, createNotification, getUserLanguage } = require('./notificationService');
const { translate } = require('../utils/i18n');
const logger = require('../utils/logger');

let running = false;

function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  return d;
}

async function getSchoolDaysInRange(startDate, endDate, tenantId = null) {
  const start = startOfDay(startDate);
  const end = startOfDay(endDate);
  const holidays = await Holiday.find({
    ...(tenantId ? { tenantId } : {}),
    isActive: true,
    date: { $lte: end },
    $or: [{ endDate: null }, { endDate: { $gte: start } }],
  }).lean();

  const holidayDates = new Set();
  for (const h of holidays) {
    let d = startOfDay(h.date);
    const hEnd = startOfDay(h.endDate || h.date);
    while (d <= hEnd) {
      holidayDates.add(dayKey(d));
      d.setDate(d.getDate() + 1);
    }
  }

  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const weekday = d.getDay();
    if (weekday !== 0 && weekday !== 6 && !holidayDates.has(dayKey(d))) {
      days.push(new Date(d));
    }
  }
  return days;
}

function attendanceByDay(records) {
  const map = new Map();
  for (const record of records) {
    const key = dayKey(record.timestamp);
    const existing = map.get(key);
    // Prefer a real "in" event; then excused; otherwise out.
    if (!existing || (record.status === 'in' && existing.status !== 'in')) {
      map.set(key, record);
    }
  }
  return map;
}

function countConsecutive(days, map, predicate) {
  let count = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const record = map.get(dayKey(days[i]));
    if (predicate(record)) count++;
    else break;
  }
  return count;
}

async function getRule(tenantId, type, defaults) {
  let rule = await AlertRule.findOne({ tenantId, type });
  if (!rule) {
    rule = await AlertRule.create({ tenantId, type, ...defaults });
  }
  return rule;
}

async function emitAlert(student, type, message, alertKey, title, tenantId) {
  try {
    const alert = await SmartAlert.create({
      student: student._id,
      tenantId,
      parentEmail: student.parentEmail,
      type,
      message,
      alertKey,
    });

    await createNotification({
      target: student.parentEmail,
      message,
      sender: 'System',
      senderRole: 'system',
      tenantId,
      parentStudentId: student._id,
    });

    await sendPushNotificationToParent(
      title,
      message,
      { url: '/parent-dashboard', studentId: String(student._id) },
      student.parentEmail,
    );

    alert.isSent = true;
    alert.sentAt = new Date();
    await alert.save();
    return true;
  } catch (err) {
    if (err.code === 11000) return false;
    logger.error(`Smart alert failed for ${student.name}:`, err);
    return false;
  }
}

async function analyzeTenant(tenantId) {
  const tenantQuery = { tenantId };
  const students = await Student.find(tenantQuery).lean();
  if (!students.length) return 0;

  const today = startOfDay(new Date());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const schoolDays30 = await getSchoolDaysInRange(thirtyDaysAgo, today, tenantId);
  const monthSchoolDays = await getSchoolDaysInRange(monthStart, today, tenantId);
  const weekSchoolDays = await getSchoolDaysInRange(weekAgo, today, tenantId);

  const records = await Attendance.find({
    ...tenantQuery,
    student: { $in: students.map(s => s._id) },
    timestamp: { $gte: thirtyDaysAgo, $lt: endOfDay(today) },
  }).sort({ timestamp: 1 }).lean();

  const recordsByStudent = new Map();
  for (const record of records) {
    const key = String(record.student);
    if (!recordsByStudent.has(key)) recordsByStudent.set(key, []);
    recordsByStudent.get(key).push(record);
  }

  const [absenceRule, tardinessRule, achievementRule] = await Promise.all([
    getRule(tenantId, 'absence', { conditions: { absenceConsecutiveDays: 3, absenceMonthlyDays: 5 }, cooldownDays: 7 }),
    getRule(tenantId, 'tardiness', { conditions: { tardinessPerWeek: 3 }, cooldownDays: 7 }),
    getRule(tenantId, 'achievement', { conditions: { achievementConsecutiveDays: 10, achievementMonthlyDays: 20 }, cooldownDays: 14 }),
  ]);

  let alertCount = 0;

  for (const student of students) {
    if (!student.parentEmail) continue;
    const map = attendanceByDay(recordsByStudent.get(String(student._id)) || []);
    const lang = await getUserLanguage(student.parentEmail);
    const tenant = student.tenantId || tenantId;

    // Missing attendance is absence. Excused attendance is NOT absence.
    const absencePredicate = record => !record || (record.status !== 'in' && record.status !== 'excused');
    const presentPredicate = record => Boolean(record && record.status === 'in');

    if (absenceRule.enabled) {
      const consecutive = countConsecutive(
        schoolDays30, map, absencePredicate,
      );
      const monthly = monthSchoolDays.reduce((n, d) => n + (absencePredicate(map.get(dayKey(d))) ? 1 : 0), 0);

      let message = null, key = null;
      if (consecutive >= (absenceRule.conditions.absenceConsecutiveDays || 3)) {
        message = translate(lang, 'alert.absence.consecutive', { name: student.name, days: consecutive });
        key = `absence_consecutive_${student._id}_${dayKey(today)}`;
      } else if (monthly >= (absenceRule.conditions.absenceMonthlyDays || 5)) {
        message = translate(lang, 'alert.absence.monthly', { name: student.name, days: monthly });
        key = `absence_monthly_${student._id}_${dayKey(today)}`;
      }

      if (message && key) {
        const since = new Date(today);
        since.setDate(since.getDate() - (absenceRule.cooldownDays || 7));
        const exists = await SmartAlert.exists({
          ...tenantQuery, student: student._id, type: 'absence', createdAt: { $gte: since },
        });
        if (!exists && await emitAlert(student, 'absence', message, key, translate(lang, 'push.absence_title'), tenant)) alertCount++;
      }
    }

    if (tardinessRule.enabled) {
      const limitMinutes = 8 * 60 + 30;
      let tardy = 0;
      for (const d of weekSchoolDays) {
        const record = map.get(dayKey(d));
        if (record?.status === 'in') {
          const t = new Date(record.timestamp);
          if (t.getHours() * 60 + t.getMinutes() > limitMinutes) tardy++;
        }
      }
      if (tardy >= (tardinessRule.conditions.tardinessPerWeek || 3)) {
        const message = translate(lang, 'alert.tardiness', { name: student.name, count: tardy });
        const key = `tardiness_${student._id}_${dayKey(today)}`;
        const since = new Date(today);
        since.setDate(since.getDate() - (tardinessRule.cooldownDays || 7));
        const exists = await SmartAlert.exists({
          ...tenantQuery, student: student._id, type: 'tardiness', createdAt: { $gte: since },
        });
        if (!exists && await emitAlert(student, 'tardiness', message, key, translate(lang, 'push.tardiness_title'), tenant)) alertCount++;
      }
    }

    if (achievementRule.enabled) {
      const consecutive = countConsecutive(schoolDays30, map, presentPredicate);
      const monthly = monthSchoolDays.reduce((n, d) => n + (presentPredicate(map.get(dayKey(d))) ? 1 : 0), 0);

      let message = null, key = null;
      if (consecutive >= (achievementRule.conditions.achievementConsecutiveDays || 10)) {
        message = translate(lang, 'alert.achievement.consecutive', { name: student.name, days: consecutive });
        key = `achievement_consecutive_${student._id}_${dayKey(today)}`;
      } else if (monthly >= (achievementRule.conditions.achievementMonthlyDays || 20)) {
        message = translate(lang, 'alert.achievement.monthly', { name: student.name, days: monthly });
        key = `achievement_monthly_${student._id}_${dayKey(today)}`;
      }

      if (message && key) {
        const since = new Date(today);
        since.setDate(since.getDate() - (achievementRule.cooldownDays || 14));
        const exists = await SmartAlert.exists({
          ...tenantQuery, student: student._id, type: 'achievement', createdAt: { $gte: since },
        });
        if (!exists && await emitAlert(student, 'achievement', message, key, translate(lang, 'push.achievement_title'), tenant)) alertCount++;
      }
    }
  }

  return alertCount;
}

async function runAllSmartAlerts() {
  if (running) {
    logger.warn('Smart alert run skipped because another run is active.');
    return { skipped: true, count: 0 };
  }
  running = true;
  try {
    const tenants = await Student.distinct('tenantId');
    let count = 0;
    for (const tenantId of tenants.filter(Boolean)) {
      count += await analyzeTenant(tenantId);
    }
    logger.info(`Smart alert analysis completed: ${count} new alert(s).`);
    return { skipped: false, count };
  } finally {
    running = false;
  }
}

function startSmartAlertScheduler() {
  cron.schedule('0 8 * * *', () => runAllSmartAlerts().catch(err => logger.error(err)));
  cron.schedule('0 10 * * *', () => runAllSmartAlerts().catch(err => logger.error(err)));
  cron.schedule('0 18 * * *', () => runAllSmartAlerts().catch(err => logger.error(err)));
  logger.info('Smart alert scheduler started (08:00 / 10:00 / 18:00)');
}

module.exports = {
  startSmartAlertScheduler,
  runAllSmartAlerts,
  getSchoolDaysInRange,
};
