const router = require('express').Router();
const { getAdmins, getAdminById, createAdmin, updateAdmin, deleteAdmin, getRoles, createRole, updateRole, getAuditLogs } = require('../../controllers/admin/adminAdminController');
const { adminAuth, checkPermission } = require('../../middleware/admin/adminAuth');
const { auditLog } = require('../../middleware/admin/adminAudit');

router.get('/audit-logs', adminAuth, checkPermission('audit.view'), getAuditLogs);
router.get('/roles/all', adminAuth, checkPermission('admins.view'), getRoles);
router.post('/roles', adminAuth, checkPermission('admins.create'), auditLog('create', 'role'), createRole);
router.put('/roles/:id', adminAuth, checkPermission('admins.edit'), auditLog('update', 'role'), updateRole);
router.get('/', adminAuth, checkPermission('admins.view'), getAdmins);
router.get('/:id', adminAuth, checkPermission('admins.view'), getAdminById);
router.post('/', adminAuth, checkPermission('admins.create'), auditLog('create', 'admin'), createAdmin);
router.put('/:id', adminAuth, checkPermission('admins.edit'), auditLog('update', 'admin'), updateAdmin);
router.delete('/:id', adminAuth, checkPermission('admins.delete'), auditLog('delete', 'admin'), deleteAdmin);

module.exports = router;