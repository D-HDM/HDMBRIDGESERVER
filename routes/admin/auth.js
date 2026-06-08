const router = require('express').Router();
const { login, getMe, logout, forgotPassword, resetPassword } = require('../../controllers/admin/adminAuthController');
const { adminAuth } = require('../../middleware/admin/adminAuth');

router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.get('/me', adminAuth, getMe);
router.post('/logout', adminAuth, logout);

module.exports = router;