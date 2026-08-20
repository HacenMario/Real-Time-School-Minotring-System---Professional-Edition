const webpush = require('web-push');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { translate } = require('../utils/i18n');
const logger = require('../utils/logger');
const { randomUUID } = require('crypto');

function initWebPush() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT = 'mailto:admin@example.com' } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    logger.warn('VAPID keys are not configured; Web Push is disabled.');
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return true;
}

function resolveText(lang, value, params = {}) {
  if (!value) return '';
  const translated = translate(lang, value, params);
  return translated === value && !value.includes('.') ? value : translated;
}

async function getUserLanguage(email) {
  if (!email) return 'ar';
  try {
    const user = await User.findOne({ email: String(email).trim().toLowerCase() }).select('preferences.language').lean();
    return ['ar', 'fr', 'en'].includes(user?.preferences?.language) ? user.preferences.language : 'ar';
  } catch {
    return 'ar';
  }
}

async function sendPushToSubscriptions(subscriptions, title, body, data = {}) {
  if (!initWebPush()) return { sent: 0, failed: 0, removed: 0 };
  const payload = JSON.stringify({
    title,
    body,
    icon: '/Favicon.ico',
    badge: '/Favicon.ico',
    data: { ...data, url: data.url || '/parent-dashboard' },
    url: data.url || '/parent-dashboard',
  });

  let sent = 0, failed = 0, removed = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
      sent++;
    } catch (err) {
      failed++;
      if ([404, 410].includes(err.statusCode)) {
        await Subscription.deleteOne({ _id: sub._id });
        removed++;
      } else {
        logger.warn('Push delivery failed:', err.message);
      }
    }
  }
  return { sent, failed, removed };
}

async function sendPushNotificationToUser(titleOrKey, bodyOrKey, data = {}, userEmail) {
  if (!userEmail) return { sent: 0, failed: 0, removed: 0 };
  const lang = await getUserLanguage(userEmail);
  const title = resolveText(lang, titleOrKey, data);
  const body = resolveText(lang, bodyOrKey, data);
  const subscriptions = await Subscription.find({ userEmail: String(userEmail).trim().toLowerCase() }).lean();
  return sendPushToSubscriptions(subscriptions, title, body, data);
}

async function sendPushNotificationToParent(titleOrKey, bodyOrKey, data = {}, parentEmail) {
  if (!parentEmail) return { sent: 0, failed: 0, removed: 0 };
  const lang = await getUserLanguage(parentEmail);
  const title = resolveText(lang, titleOrKey, data);
  const body = resolveText(lang, bodyOrKey, data);
  const subscriptions = await Subscription.find({ userEmail: String(parentEmail).trim().toLowerCase() }).lean();
  return sendPushToSubscriptions(subscriptions, title, body, data);
}

async function sendPushNotificationToAll(titleOrKey, bodyOrKey, data = {}, tenantId = null) {
  const query = tenantId ? { tenantId } : {};
  const subscriptions = await Subscription.find(query).lean();
  if (!subscriptions.length) return { sent: 0, failed: 0, removed: 0 };

  const groups = new Map();
  for (const sub of subscriptions) {
    const lang = await getUserLanguage(sub.userEmail);
    if (!groups.has(lang)) groups.set(lang, []);
    groups.get(lang).push(sub);
  }

  let totals = { sent: 0, failed: 0, removed: 0 };
  for (const [lang, group] of groups) {
    const title = resolveText(lang, titleOrKey, data);
    const body = resolveText(lang, bodyOrKey, data);
    const result = await sendPushToSubscriptions(group, title, body, data);
    totals = {
      sent: totals.sent + result.sent,
      failed: totals.failed + result.failed,
      removed: totals.removed + result.removed,
    };
  }
  return totals;
}

async function createNotification({
  target, message, sender = 'Admin', senderRole = 'admin',
  tenantId = null, subject = '', parentStudentId = null, notificationKey = null,
}) {
  // notificationKey is always unique. Older database versions may still have
  // a unique index on this field; generating a key prevents duplicate-key
  // errors when multiple notifications legitimately have a null key.
  return Notification.create({
    target: String(target || '').trim().toLowerCase(),
    message,
    sender,
    senderRole,
    tenantId,
    subject,
    parentStudentId,
    notificationKey: notificationKey || `notification:${Date.now()}:${randomUUID()}`,
  });
}

module.exports = {
  initWebPush,
  getUserLanguage,
  sendPushNotificationToParent,
  sendPushNotificationToUser,
  sendPushNotificationToAll,
  createNotification,
};
