const router = require('express').Router();
const { getUsers, getUserById, updateUser, suspendUser, activateUser, deleteUser, getOrganizations, getOrganizationById } = require('../../controllers/admin/adminUserController');
const { adminAuth, checkPermission } = require('../../middleware/admin/adminAuth');
const { auditLog } = require('../../middleware/admin/adminAudit');

router.get('/', adminAuth, checkPermission('users.view'), getUsers);
router.get('/:id', adminAuth, checkPermission('users.view'), getUserById);
router.put('/:id', adminAuth, checkPermission('users.edit'), auditLog('update', 'user'), updateUser);
router.post('/:id/suspend', adminAuth, checkPermission('users.suspend'), auditLog('suspend', 'user'), suspendUser);
router.post('/:id/activate', adminAuth, checkPermission('users.edit'), auditLog('activate', 'user'), activateUser);
router.delete('/:id', adminAuth, checkPermission('users.delete'), auditLog('delete', 'user'), deleteUser);

module.exports = router;