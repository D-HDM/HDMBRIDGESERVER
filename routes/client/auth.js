const router = require('express').Router();
const { register, login, getMe, updateProfile, changePassword, forgotPassword, resetPassword, logout, verifyEmail } = require('../../controllers/client/authController');
const auth = require('../../middleware/common/auth');
const { authLimiter } = require('../../middleware/common/rateLimiter');

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password/:token', authLimiter, resetPassword);
router.post('/verify/:token', verifyEmail);
router.get('/me', auth, getMe);
router.put('/me', auth, updateProfile);
router.put('/change-password', auth, changePassword);
router.post('/logout', auth, logout);

module.exports = router;