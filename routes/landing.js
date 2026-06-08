const router = require('express').Router();
const { getSettings, getPlans, getFeatures, landingChat } = require('../controllers/client/landingController');

router.get('/settings', getSettings);
router.get('/plans', getPlans);
router.get('/features', getFeatures);
router.post('/chat', landingChat);

module.exports = router;