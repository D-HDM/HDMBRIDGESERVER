const router = require('express').Router();

const authRoutes = require('./auth');
const emailRoutes = require('./emails');
const apiKeyRoutes = require('./apiKeys');
const domainRoutes = require('./domains');
const templateRoutes = require('./templates');
const logRoutes = require('./logs');
const billingRoutes = require('./billing');
const currencyRoutes = require('./currency');
const chatRoutes = require('./chat');

router.use('/auth', authRoutes);
router.use('/emails', emailRoutes);
router.use('/api-keys', apiKeyRoutes);
router.use('/domains', domainRoutes);
router.use('/templates', templateRoutes);
router.use('/logs', logRoutes);
router.use('/billing', billingRoutes);
router.use('/currency', currencyRoutes);
router.use('/chat', chatRoutes);

module.exports = router;