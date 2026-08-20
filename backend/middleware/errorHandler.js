function notFound(req, res) {
  res.status(404).json({ message: 'المسار غير موجود', code: 'NOT_FOUND' });
}

function errorHandler(err, req, res, next) {
  console.error('❌ API error:', err);
  if (res.headersSent) return next(err);

  if (err?.name === 'ValidationError') {
    return res.status(400).json({
      message: 'بيانات غير صالحة',
      code: 'VALIDATION_ERROR',
      errors: Object.values(err.errors).map(e => e.message),
    });
  }

  if (err?.code === 11000) {
    return res.status(409).json({
      message: 'السجل موجود مسبقاً',
      code: 'DUPLICATE_KEY',
    });
  }

  res.status(err.status || 500).json({
    message: err.expose ? err.message : (err.message || 'حدث خطأ في الخادم'),
    code: err.code || 'INTERNAL_ERROR',
  });
}

module.exports = { notFound, errorHandler };
