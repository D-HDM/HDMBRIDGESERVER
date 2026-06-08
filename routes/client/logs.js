const router = require('express').Router();
const { getLogs, getLogById, getLogStats } = require('../../controllers/client/logController');
const auth = require('../../middleware/common/auth');
const tenantIsolation = require('../../middleware/common/tenantIsolation');

router.get('/', auth, tenantIsolation, getLogs);
router.get('/stats', auth, tenantIsolation, getLogStats);
router.get('/:id', auth, tenantIsolation, getLogById);

module.exports = router;