const mongoose = require('mongoose');

const ADMIN_ROLES = ['admin', 'super_admin'];
const STAFF_ROLES = ['admin', 'super_admin', 'teacher'];

function isObjectId(value) {
  return value && mongoose.Types.ObjectId.isValid(value);
}

function tenantIdFromUser(user) {
  return isObjectId(user?.tenantId) ? new mongoose.Types.ObjectId(user.tenantId) : null;
}

/**
 * Tenant isolation helper.
 * A null tenant is intentionally supported for legacy records during migration.
 */
function tenantFilter(user, field = 'tenantId') {
  const tenantId = tenantIdFromUser(user);
  if (!tenantId || user?.role === 'super_admin') return {};
  return { [field]: tenantId };
}

function withTenantFilter(user, query = {}, field = 'tenantId') {
  return { ...query, ...tenantFilter(user, field) };
}

function canAccessStudent(user, student) {
  if (!user || !student) return false;
  if (user.role === 'super_admin') return true;
  if (user.role === 'parent') return String(student.parent) === String(user.id);
  return true;
}

module.exports = {
  ADMIN_ROLES,
  STAFF_ROLES,
  tenantFilter,
  withTenantFilter,
  tenantIdFromUser,
  canAccessStudent,
};
