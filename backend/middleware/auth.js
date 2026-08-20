const jwt = require('jsonwebtoken');
const { ADMIN_ROLES, STAFF_ROLES } = require('../utils/access');

function auth(req, res, next) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ message: 'لا يوجد توكن، وصول ممنوع', code: 'AUTH_REQUIRED' });
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('JWT_SECRET is missing or too weak');
    return res.status(500).json({ message: 'إعداد المصادقة غير مكتمل', code: 'AUTH_CONFIG_ERROR' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
    });
    req.user = {
      id: String(decoded.id),
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      tenantId: decoded.tenantId || null,
    };
    next();
  } catch (err) {
    return res.status(401).json({
      message: err.name === 'TokenExpiredError' ? 'انتهت صلاحية الجلسة' : 'توكن غير صالح',
      code: 'AUTH_INVALID',
    });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'غير مصرح لك بتنفيذ هذه العملية', code: 'FORBIDDEN' });
    }
    next();
  };
}

function isAdmin(req, res, next) {
  return authorize(...ADMIN_ROLES)(req, res, next);
}

function isStaff(req, res, next) {
  return authorize(...STAFF_ROLES)(req, res, next);
}

module.exports = auth;
module.exports.auth = auth;
module.exports.authorize = authorize;
module.exports.isAdmin = isAdmin;
module.exports.isStaff = isStaff;
