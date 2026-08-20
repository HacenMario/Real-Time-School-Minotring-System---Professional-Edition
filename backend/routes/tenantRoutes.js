const express = require('express');
const router = express.Router();
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { authorize } = require('../middleware/auth');

router.use(auth, authorize('super_admin'));

router.get('/', async (req, res, next) => {
  try {
    const tenants = await Tenant.find().sort({ name: 1 });
    res.json(tenants);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const key = String(req.body.key || '').trim().toLowerCase();
    if (!name || !/^[a-z0-9][a-z0-9-_]{2,63}$/.test(key)) {
      return res.status(400).json({ message: 'اسم المؤسسة ومفتاحها غير صالحين' });
    }
    const tenant = await Tenant.create({ name, key });
    res.status(201).json(tenant);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'المؤسسة غير موجودة' });
    if (req.body.name !== undefined) tenant.name = String(req.body.name).trim();
    if (req.body.isActive !== undefined) tenant.isActive = Boolean(req.body.isActive);
    await tenant.save();
    res.json(tenant);
  } catch (err) { next(err); }
});

router.get('/:id/users', async (req, res, next) => {
  try {
    const users = await User.find({ tenantId: req.params.id })
      .select('name email phone role preferences.language createdAt')
      .sort({ name: 1 });
    res.json(users);
  } catch (err) { next(err); }
});

module.exports = router;
