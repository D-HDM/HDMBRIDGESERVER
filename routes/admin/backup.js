const router = require('express').Router();
const { getBackups, getBackupById, createBackup, restoreBackup, deleteBackup, getSchedules, createSchedule } = require('../../controllers/admin/adminBackupController');
const { adminAuth, checkPermission } = require('../../middleware/admin/adminAuth');
const { auditLog } = require('../../middleware/admin/adminAudit');

router.get('/', adminAuth, checkPermission('backup.view'), getBackups);
router.get('/:id', adminAuth, checkPermission('backup.view'), getBackupById);
router.post('/', adminAuth, checkPermission('backup.create'), auditLog('create', 'backup'), createBackup);
router.post('/:id/restore', adminAuth, checkPermission('backup.restore'), auditLog('restore', 'backup'), restoreBackup);
router.delete('/:id', adminAuth, checkPermission('backup.delete'), auditLog('delete', 'backup'), deleteBackup);
router.get('/schedules/all', adminAuth, checkPermission('backup.view'), getSchedules);
router.post('/schedules', adminAuth, checkPermission('backup.create'), auditLog('create_schedule', 'backup'), createSchedule);

module.exports = router;