const express = require('express');
const router = express.Router();
const Holiday = require('../models/Holiday');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/auth');
const { tenantFilter } = require('../utils/access');
const { translate } = require('../utils/i18n');

router.get('/', auth, async (req, res, next) => {
  try {
    res.json(await Holiday.find(tenantFilter(req.user)).sort({ date: 1 }));
  } catch (err) { next(err); }
});

router.get('/range', auth, async (req, res, next) => {
  try {
    const { start, end } = req.query;
    const startDate = new Date(start), endDate = new Date(end);
    if (!start || !end || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ message: 'يجب تحديد تاريخ البداية والنهاية بشكل صحيح' });
    }
    res.json(await Holiday.find({
      ...tenantFilter(req.user),
      date: { $lte: endDate },
      $or: [
        { endDate: null, date: { $gte: startDate, $lte: endDate } },
        { endDate: { $gte: startDate } },
      ],
    }).sort({ date: 1 }));
  } catch (err) { next(err); }
});

router.post('/', auth, isAdmin, async (req, res, next) => {
  try {
    const { date, endDate, name, description, isRecurring } = req.body;
    if (!date || !name) return res.status(400).json({ message: 'التاريخ والاسم مطلوبان' });

    const start = new Date(date);
    const end = endDate ? new Date(endDate) : new Date(date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return res.status(400).json({ message: 'نطاق التاريخ غير صالح' });
    }

    const existing = await Holiday.findOne({
      ...tenantFilter(req.user),
      date: { $lte: end },
      $or: [
        { endDate: null, date: { $gte: start } },
        { endDate: { $gte: start } },
      ],
    });
    if (existing) return res.status(400).json({ message: 'يوجد عطلة تتداخل مع هذا التاريخ' });

    const holiday = await Holiday.create({
      tenantId: req.user.tenantId || null,
      date: start,
      endDate: endDate ? end : null,
      name: String(name).trim(),
      description: description || '',
      isRecurring: Boolean(isRecurring),
    });
    res.status(201).json({ success: true, message: '✅ تم إضافة العطلة بنجاح', holiday });
  } catch (err) { next(err); }
});

router.delete('/:id', auth, isAdmin, async (req, res, next) => {
  try {
    const result = await Holiday.deleteOne({ _id: req.params.id, ...tenantFilter(req.user) });
    if (!result.deletedCount) return res.status(404).json({ message: 'العطلة غير موجودة' });
    res.json({ success: true, message: '✅ تم حذف العطلة بنجاح' });
  } catch (err) { next(err); }
});

router.put('/:id/toggle', auth, isAdmin, async (req, res, next) => {
  try {
    const holiday = await Holiday.findOne({ _id: req.params.id, ...tenantFilter(req.user) });
    if (!holiday) return res.status(404).json({ success: false, message: 'العطلة غير موجودة' });
    holiday.isActive = !holiday.isActive;
    await holiday.save();
    res.json({
      success: true,
      message: holiday.isActive ? translate('ar', 'holiday.toggled_on') : translate('ar', 'holiday.toggled_off'),
      holiday,
    });
  } catch (err) { next(err); }
});

router.put('/:id', auth, isAdmin, async (req, res, next) => {
  try {
    const holiday = await Holiday.findOne({ _id: req.params.id, ...tenantFilter(req.user) });
    if (!holiday) return res.status(404).json({ success: false, message: 'العطلة غير موجودة' });

    const { date, endDate, name, description } = req.body;
    if (date) holiday.date = new Date(date);
    if (endDate !== undefined) holiday.endDate = endDate ? new Date(endDate) : null;
    if (name !== undefined) holiday.name = String(name).trim();
    if (description !== undefined) holiday.description = description;
    if (holiday.endDate && holiday.endDate < holiday.date) return res.status(400).json({ message: 'نطاق التاريخ غير صالح' });

    await holiday.save();
    res.json({ success: true, message: '✅ تم تعديل العطلة بنجاح', holiday });
  } catch (err) { next(err); }
});

module.exports = router;
