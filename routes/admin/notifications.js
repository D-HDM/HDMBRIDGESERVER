const router = require('express').Router();
const { getEmailStats, getOrgActivity, sendToUser, sendToAllUsers } = require('../../controllers/admin/adminNotificationController');
const { adminAuth, checkPermission } = require('../../middleware/admin/adminAuth');
const { auditLog } = require('../../middleware/admin/adminAudit');

router.get('/stats', adminAuth, checkPermission('users.view'), getEmailStats);
router.get('/org-activity', adminAuth, checkPermission('users.view'), getOrgActivity);
router.post('/send-to-user', adminAuth, checkPermission('users.edit'), auditLog('send_message', 'user'), sendToUser);
router.post('/send-to-all', adminAuth, checkPermission('users.edit'), auditLog('send_bulk', 'users'), sendToAllUsers);

module.exports = router;