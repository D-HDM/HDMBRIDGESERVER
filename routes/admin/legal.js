const router = require('express').Router();
const { getDocuments, getDocumentById, createDocument, updateDocument, publishDocument, getUserConsents } = require('../../controllers/admin/adminLegalController');
const { adminAuth, checkPermission } = require('../../middleware/admin/adminAuth');
const { auditLog } = require('../../middleware/admin/adminAudit');

router.get('/', adminAuth, checkPermission('legal.view'), getDocuments);
router.get('/:id', adminAuth, checkPermission('legal.view'), getDocumentById);
router.post('/', adminAuth, checkPermission('legal.edit'), auditLog('create', 'legal'), createDocument);
router.put('/:id', adminAuth, checkPermission('legal.edit'), auditLog('update', 'legal'), updateDocument);
router.put('/:id/publish', adminAuth, checkPermission('legal.edit'), auditLog('publish', 'legal'), publishDocument);
router.get('/consents/all', adminAuth, checkPermission('legal.view'), getUserConsents);

module.exports = router;