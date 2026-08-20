const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  status: { type: String, enum: ['in', 'out', 'excused'], required: true },
  timestamp: { type: Date, default: Date.now, index: true },
  method: { type: String, enum: ['manual', 'rfid', 'auto', 'qr', 'leave'], default: 'manual' },
  studentName: { type: String, default: '', maxlength: 160 },
  statusText: { type: String, default: '', maxlength: 100 },
}, { versionKey: false });

AttendanceSchema.index({ tenantId: 1, student: 1, timestamp: -1 });
AttendanceSchema.index({ student: 1, status: 1, timestamp: -1 });

AttendanceSchema.pre('save', async function(next) {
  if (this.isNew && (!this.studentName || !this.tenantId)) {
    try {
      const Student = mongoose.model('Student');
      const student = await Student.findById(this.student).select('name tenantId').lean();
      if (student) {
        this.studentName = this.studentName || student.name;
        this.tenantId = this.tenantId || student.tenantId || null;
      }
    } catch (err) {
      console.error('Attendance metadata error:', err.message);
    }
  }
  next();
});

module.exports = mongoose.model('Attendance', AttendanceSchema);
