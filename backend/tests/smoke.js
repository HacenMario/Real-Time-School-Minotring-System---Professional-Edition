const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const required = [
  'server.js',
  'middleware/auth.js',
  'middleware/errorHandler.js',
  'models/Tenant.js',
  'models/User.js',
  'models/Student.js',
  'models/Attendance.js',
  'services/attendanceService.js',
  'services/notificationService.js',
  'services/smartAlertScheduler.js',
  'services/notificationScheduler.js',
  'routes/studentRoutes.js',
  'routes/tenantRoutes.js',
];

for (const file of required) {
  assert(fs.existsSync(path.join(root, file)), `Missing required file: ${file}`);
}

assert(!fs.existsSync(path.join(root, '.env')), 'Secrets must not be included in the repository');
assert(fs.existsSync(path.join(root, '.env.example')), '.env.example is required');

console.log(`Smoke checks passed: ${required.length} required files verified.`);
