require('dotenv').config();
process.env.TZ = process.env.TZ || 'Africa/Algiers';

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const auth = require('./middleware/auth');
const { isAdmin, isStaff } = require('./middleware/auth');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const Tenant = require('./models/Tenant');
const User = require('./models/User');
const Student = require('./models/Student');
const Attendance = require('./models/Attendance');
const Notification = require('./models/Notification');
const SchoolSettings = require('./models/SchoolSettings');
const Holiday = require('./models/Holiday');

const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const smartAlertRoutes = require('./routes/smartAlertRoutes');
const holidayRoutes = require('./routes/holidayRoutes');
const parentRoutes = require('./routes/parent');
const tenantRoutes = require('./routes/tenantRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');

const { changeStudentPresence, setAllStudentsPresence } = require('./services/attendanceService');
const {
  sendPushNotificationToParent,
  sendPushNotificationToAll,
  createNotification,
  initWebPush,
} = require('./services/notificationService');
const {
  startNotificationScheduler,
  sendLeavingNotifications,
} = require('./services/notificationScheduler');
const {
  startSmartAlertScheduler,
  getSchoolDaysInRange,
} = require('./services/smartAlertScheduler');
const { ensureDefaultTenant } = require('./services/tenantService');

const app = express();
const server = http.createServer(app);

const configuredOrigins = String(
  process.env.ALLOWED_ORIGINS ||
  process.env.FRONTEND_URL ||
  'student-tracker-system-professional.vercel.app'
).split(',').map(s => s.trim()).filter(Boolean);

function originAllowed(origin) {
  if (!origin) return true;
  if (configuredOrigins.includes('*')) return true;
  return configuredOrigins.includes(origin);
}

const corsOptions = {
  origin(origin, callback) {
    if (originAllowed(origin)) return callback(null, true);
    callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
};

const io = new Server(server, {
  cors: {
    origin: configuredOrigins.includes('*') ? '*' : configuredOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

app.set('io', io);
app.locals.userSockets = new Map();

app.disable('x-powered-by');
app.use(cors(corsOptions));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  next();
});
app.use(express.json({ limit: '8mb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '8mb' }));

// Lightweight in-memory rate limiter for authentication endpoints.
const authAttempts = new Map();
function authRateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const max = 30;
  const current = authAttempts.get(key);
  if (!current || now - current.started > windowMs) {
    authAttempts.set(key, { started: now, count: 1 });
    return next();
  }
  current.count++;
  if (current.count > max) {
    return res.status(429).json({ message: 'طلبات كثيرة جداً، حاول لاحقاً', code: 'RATE_LIMITED' });
  }
  next();
}
app.use('/api/auth', authRoutes);

// Health/readiness endpoints.
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Student Tracker API',
    version: process.env.APP_VERSION || '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  const healthy = mongoose.connection.readyState === 1;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    database: healthy ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ ready: false });
  }
  res.json({ ready: true });
});

// Business routes.
app.use('/api/students', studentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/leave-requests', leaveRoutes);
app.use('/api/smart-alerts', smartAlertRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/super-admin', superAdminRoutes);

// Compatibility/testing endpoints, now protected with administrator permissions.
app.get('/api/test-leaving', auth, isAdmin, async (req, res, next) => {
  try {
    await sendLeavingNotifications();
    res.json({ success: true, message: 'تم تشغيل فحص إشعارات الخروج' });
  } catch (err) { next(err); }
});

app.get('/api/trigger-leaving', auth, isAdmin, async (req, res, next) => {
  try {
    await sendLeavingNotifications();
    res.json({ success: true, message: 'تم تشغيل إشعارات الخروج' });
  } catch (err) { next(err); }
});

app.get('/api/test-holidays', auth, isStaff, async (req, res, next) => {
  try {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 30);
    const schoolDays = await getSchoolDaysInRange(startDate, today, req.user.tenantId || null);
    const holidays = await Holiday.find({
      tenantId: req.user.tenantId || null,
      date: { $gte: startDate, $lte: today },
      isActive: true,
    }).lean();

    res.json({
      totalDays: 30,
      schoolDays: schoolDays.length,
      holidays: holidays.map(h => ({
        name: h.name,
        date: new Date(h.date).toISOString().split('T')[0],
        endDate: h.endDate ? new Date(h.endDate).toISOString().split('T')[0] : null,
      })),
    });
  } catch (err) { next(err); }
});

// Socket.IO authentication and real-time actions.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token || !process.env.JWT_SECRET) return next(new Error('Authentication error'));
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

function tenantRoom(tenantId) { return `tenant:${tenantId || 'legacy'}`; }

function normalizeSocketEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function addSocket(email, socketId) {
  const normalized = normalizeSocketEmail(email);
  if (!normalized) return;
  const map = app.locals.userSockets;
  if (!map.has(normalized)) map.set(normalized, new Set());
  map.get(normalized).add(socketId);
}

function removeSocket(email, socketId) {
  const normalized = normalizeSocketEmail(email);
  const map = app.locals.userSockets;
  const set = map.get(normalized);
  if (!set) return;
  set.delete(socketId);
  if (!set.size) map.delete(normalized);
}

function emitToUser(email, event, payload) {
  const normalized = normalizeSocketEmail(email);
  const ids = app.locals.userSockets.get(normalized) || [];
  for (const id of ids) io.to(id).emit(event, payload);
}

io.on('connection', (socket) => {
  const user = socket.user;
  addSocket(user.email, socket.id);
  socket.join(tenantRoom(user.tenantId));
  logger.info(`Socket connected: ${user.email} (${user.role})`);

  socket.on('toggle-status', async (studentId) => {
    if (!['admin', 'super_admin'].includes(user.role)) {
      return socket.emit('error', { message: 'غير مصرح لك' });
    }
    try {
      const result = await changeStudentPresence({
        studentId, actor: user, method: 'manual',
      });
      io.to(tenantRoom(result.student.tenantId)).emit('status-changed', {
        student: result.student,
        message: result.message,
        parentId: result.student.parent ? String(result.student.parent) : null,
        parentEmail: result.student.parentEmail,
        timestamp: result.attendance?.timestamp || result.student.lastUpdate,
        createdAt: result.notification?.createdAt || result.attendance?.timestamp || result.student.lastUpdate,
      });
      if (result.notification && result.student.parentEmail) {
        emitToUser(result.student.parentEmail, 'notification', {
          message: result.notification.message, notificationId: result.notification._id, createdAt: result.notification.createdAt,
        });
      }
    } catch (err) {
      socket.emit('error', { message: err.message || 'حدث خطأ أثناء تغيير الحالة', code: err.code || 'STATUS_UPDATE_FAILED' });
    }
  });

  socket.on('toggle-all-status', async (data = {}) => {
    if (!['admin', 'super_admin'].includes(user.role)) {
      return socket.emit('error', { message: 'غير مصرح لك' });
    }
    if (typeof data.newStatus !== 'boolean') {
      return socket.emit('error', { message: 'الحالة الجديدة غير صالحة' });
    }
    try {
      const result = await setAllStudentsPresence({ actor: user, newStatus: data.newStatus });
      io.to(tenantRoom(user.tenantId)).emit('status-changed', {
        message: data.newStatus
          ? 'تم تغيير حالة جميع الطلاب إلى داخل 🏫'
          : 'تم تغيير حالة جميع الطلاب إلى خارج 🚪',
        isBulk: true, newStatus: data.newStatus, count: result.count,
      });
      for (const notification of (result.notifications || [])) {
        emitToUser(notification.parentEmail, 'notification', {
          message: notification.message, notificationId: notification._id, createdAt: notification.createdAt,
        });
      }
      socket.emit('toggle-all-done', { success: true, count: result.count });
    } catch (err) {
      socket.emit('error', { message: err.message || 'حدث خطأ أثناء تغيير الحالة الجماعية', code: err.code || 'STATUS_UPDATE_FAILED' });
    }
  });

  socket.on('admin-notification', async (data = {}) => {
    if (!['admin', 'super_admin'].includes(user.role)) return;
    const message = String(data.message || '').trim();
    if (!message || message.length > 5000) {
      return socket.emit('notification-error', { message: 'الرسالة غير صالحة' });
    }

    try {
      const tenantId = user.tenantId || null;
      const notification = await createNotification({
        target: 'all',
        message,
        sender: user.name || 'Admin',
        senderRole: user.role,
        tenantId,
      });
      io.to(tenantRoom(tenantId)).emit('notification', {
        message,
        notificationId: notification._id,
        createdAt: notification.createdAt,
      });
      await sendPushNotificationToAll(
        'push.general_title',
        message,
        { url: '/' },
        tenantId,
      );
    } catch (err) {
      socket.emit('notification-error', { message: 'فشل إرسال الإشعار العام' });
    }
  });

  socket.on('admin-notification-to-parent', async (data = {}) => {
    if (!['admin', 'super_admin'].includes(user.role)) {
      return socket.emit('notification-error', { message: 'غير مصرح لك' });
    }
    const parentEmail = String(data.parentEmail || '').trim().toLowerCase();
    const message = String(data.message || '').trim();
    if (!parentEmail || !message || message.length > 5000) {
      return socket.emit('notification-error', { message: 'البريد والرسالة مطلوبان' });
    }

    try {
      const parent = await User.findOne({
        email: parentEmail,
        role: 'parent',
        tenantId: user.tenantId || null,
      }).lean();
      if (!parent) return socket.emit('notification-error', { message: 'ولي الأمر غير موجود' });

      const notification = await createNotification({
        target: parentEmail,
        message,
        sender: user.name || 'Admin',
        senderRole: user.role,
        tenantId: user.tenantId || null,
      });

      emitToUser(parentEmail, 'notification', {
        message,
        notificationId: notification._id,
        createdAt: notification.createdAt,
      });

      socket.emit('notification-sent', {
        parentEmail,
        message: message + (app.locals.userSockets.has(normalizeSocketEmail(parentEmail)) ? ' (sent instantly)' : ' (saved)'),
      });

      await sendPushNotificationToParent(
        'push.private_title',
        message,
        { url: '/parent-dashboard' },
        parentEmail,
      );
    } catch (err) {
      socket.emit('notification-error', { message: 'فشل إرسال الإشعار الخاص' });
    }
  });

  socket.on('disconnect', () => {
    removeSocket(user.email, socket.id);
    logger.info(`Socket disconnected: ${user.email}`);
  });
});

app.use(notFound);
app.use(errorHandler);

async function start() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }

  await mongoose.connect(process.env.MONGO_URI, {
    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20),
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  // Normalize/repair the legacy Notification unique index so older deployments
  // cannot block legitimate notifications with duplicate null notificationKey values.
  try {
    const notificationCollection = mongoose.connection.collection('notifications');
    const indexes = await notificationCollection.indexes();
    const legacy = indexes.find(i => i.name === 'notificationKey_1');
    if (legacy && (legacy.unique !== true || legacy.sparse !== true)) {
      await notificationCollection.dropIndex('notificationKey_1').catch(() => {});
      await notificationCollection.createIndex({ notificationKey: 1 }, { unique: true, sparse: true, name: 'notificationKey_1' });
    }
  } catch (indexErr) {
    logger.warn('Notification index check failed:', indexErr.message);
  }

  await ensureDefaultTenant();
  initWebPush();

  const port = Number(process.env.PORT || 5000);
  server.listen(port, () => logger.info(`Student Tracker API listening on port ${port}`));

  startNotificationScheduler();
  startSmartAlertScheduler();
}

async function shutdown(signal) {
  logger.info(`${signal} received; shutting down gracefully...`);
  io.close();
  server.close(async () => {
    await mongoose.connection.close(false);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

mongoose.connection.on('error', err => logger.error('MongoDB connection error:', err));
mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

if (require.main === module) {
  start().catch(err => {
    logger.error('Fatal startup error:', err);
    process.exit(1);
  });
}

module.exports = { app, server, io, start };
