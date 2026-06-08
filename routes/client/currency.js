const router = require('express').Router();
const { getSupportedCurrencies, getExchangeRates, setCurrencyPreference, convertPrice } = require('../../controllers/client/currencyController');
const auth = require('../../middleware/common/auth');

router.get('/supported', getSupportedCurrencies);
router.get('/rates', getExchangeRates);
router.put('/preference', auth, setCurrencyPreference);
router.post('/convert', convertPrice);

module.exports = router;