const router = require('express').Router();
const { getOrganizations, getOrganizationById, deleteOrganization } = require('../../controllers/admin/adminUserController');
const { adminAuth, checkPermission } = require('../../middleware/admin/adminAuth');
const { auditLog } = require('../../middleware/admin/adminAudit');

router.get('/', adminAuth, checkPermission('users.view'), getOrganizations);
router.get('/:id', adminAuth, checkPermission('users.view'), getOrganizationById);
router.delete('/:id', adminAuth, checkPermission('users.delete'), auditLog('delete', 'organization'), deleteOrganization);

module.exports = router;