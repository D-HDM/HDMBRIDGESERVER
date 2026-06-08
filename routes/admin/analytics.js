const router = require('express').Router();
const { getDashboardStats, getUserGrowth, getEmailVolume, getRevenueAnalytics, getPlanDistribution } = require('../../controllers/admin/adminAnalyticsController');
const { adminAuth, checkPermission } = require('../../middleware/admin/adminAuth');

router.get('/dashboard', adminAuth, checkPermission('analytics.view'), getDashboardStats);
router.get('/user-growth', adminAuth, checkPermission('analytics.view'), getUserGrowth);
router.get('/email-volume', adminAuth, checkPermission('analytics.view'), getEmailVolume);
router.get('/revenue', adminAuth, checkPermission('analytics.view'), getRevenueAnalytics);
router.get('/plan-distribution', adminAuth, checkPermission('analytics.view'), getPlanDistribution);

module.exports = router;