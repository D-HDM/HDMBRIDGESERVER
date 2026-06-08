const router = require('express').Router();

const authRoutes = require('./auth');
const userRoutes = require('./users');
const orgRoutes = require('./organizations');
const paymentRoutes = require('./payments');
const planRoutes = require('./plans');
const currencyRoutes = require('./currency');
const systemRoutes = require('./system');
const legalRoutes = require('./legal');
const analyticsRoutes = require('./analytics');
const aiWidgetRoutes = require('./aiWidget');
const backupRoutes = require('./backup');
const adminRoutes = require('./admins');
const notificationRoutes = require('./notifications');

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/organizations', orgRoutes);
router.use('/payments', paymentRoutes);
router.use('/plans', planRoutes);
router.use('/currency', currencyRoutes);
router.use('/system', systemRoutes);
router.use('/legal', legalRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/ai-widget', aiWidgetRoutes);
router.use('/backup', backupRoutes);
router.use('/admins', adminRoutes);
router.use('/notifications', notificationRoutes);

module.exports = router;