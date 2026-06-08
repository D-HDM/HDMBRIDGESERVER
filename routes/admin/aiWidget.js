const router = require('express').Router();
const { getSettings, updateSettings, testConnection, toggleWidget } = require('../../controllers/admin/adminAIWidgetController');
const { adminAuth, checkPermission } = require('../../middleware/admin/adminAuth');
const { auditLog } = require('../../middleware/admin/adminAudit');

router.get('/', adminAuth, checkPermission('ai_widget.view'), getSettings);
router.put('/', adminAuth, checkPermission('ai_widget.edit'), auditLog('update', 'ai_widget'), updateSettings);
router.post('/test', adminAuth, checkPermission('ai_widget.edit'), testConnection);
router.put('/toggle', adminAuth, checkPermission('ai_widget.edit'), auditLog('toggle', 'ai_widget'), toggleWidget);

module.exports = router;