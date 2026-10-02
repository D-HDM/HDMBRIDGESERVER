'use strict';

const axios = require('axios');

class MpesaError extends Error {
    constructor(message, code, raw) {
        super(message);
        this.name = 'MpesaError';
        this.code = code;
        this.raw = raw;
    }
}

const SAFARICOM_IPS = [
    '196.201.214.200', '196.201.214.206', '196.201.213.114',
    '196.201.214.207', '196.201.214.208', '196.201.213.44',
    '196.201.212.127', '196.201.212.138', '196.201.212.129',
    '196.201.212.136', '196.201.212.74', '196.201.212.69',
];

const RESULT_CODES = {
    SUCCESS: '0',
    INSUFFICIENT_FUNDS: '1',
    LESS_THAN_MINIMUM: '1001',
    EXCEED_MAX_AMOUNT: '1002',
    EXCEED_DAILY_LIMIT: '1003',
    EXCEED_MIN_BALANCE: '1004',
    INVALID_ACCOUNT: '1006',
    USER_UNREACHABLE: '1019',
    USER_CANCELLED: '1032',
    DS_TIMEOUT: '1037',
    WRONG_PIN: '2001',
    AGENT_STORE_MISMATCH: '2002',
    TRANSACTION_NOT_FOUND: '500.001.1001',
    MERCHANT_NOT_EXIST: '4999',
    UNRESOLVED_REASON: '2029',
};

let LOGGER = console;

let CONFIG = {
    baseUrl: process.env.MPESA_BASE_URL || 'https://api.safaricom.co.ke',
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    shortCode: process.env.MPESA_SHORTCODE,
    tillNumber: process.env.MPESA_TILL_NUMBER,
    passkey: process.env.MPESA_PASSKEY,
    callbackUrl: process.env.MPESA_CALLBACK_URL,
    transactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerBuyGoodsOnline',
};

let tokenCache = { token: null, expiresAt: 0 };

const seenCallbacks = new Map();
const CALLBACK_TTL_MS = 24 * 60 * 60 * 1000;

function pruneSeenCallbacks() {
    const now = Date.now();
    for (const [key, ts] of seenCallbacks.entries()) {
        if (now - ts > CALLBACK_TTL_MS) seenCallbacks.delete(key);
    }
}

function configure(overrides = {}) {
    const { logger, ...rest } = overrides;
    CONFIG = { ...CONFIG, ...rest };

    if (logger) LOGGER = logger;

    if (
        'consumerKey' in rest ||
        'consumerSecret' in rest ||
        'baseUrl' in rest
    ) {
        tokenCache = { token: null, expiresAt: 0 };
    }
}

function getConfig() {
    return { ...CONFIG };
}

async function getAccessToken() {
    const now = Date.now();

    if (tokenCache.token && tokenCache.expiresAt > now + 60000) {
        return tokenCache.token;
    }

    if (!CONFIG.consumerKey || !CONFIG.consumerSecret) {
        throw new MpesaError('M-PESA credentials not configured', 'CONFIG_MISSING');
    }

    const auth = Buffer.from(
        `${CONFIG.consumerKey}:${CONFIG.consumerSecret}`
    ).toString('base64');

    try {
        const { data } = await axios.get(
            `${CONFIG.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
            {
                headers: { Authorization: `Basic ${auth}` },
                timeout: 15000,
            }
        );

        tokenCache = {
            token: data.access_token,
            expiresAt: now + Number(data.expires_in) * 1000,
        };

        return data.access_token;
    } catch (error) {
        const err = error.response?.data || error.message;
        LOGGER.error('[mpesa] OAuth error:', err);
        throw new MpesaError(
            typeof err === 'string' ? err : JSON.stringify(err),
            'OAUTH_FAILED',
            err
        );
    }
}

function getTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return (
        d.getFullYear() +
        pad(d.getMonth() + 1) +
        pad(d.getDate()) +
        pad(d.getHours()) +
        pad(d.getMinutes()) +
        pad(d.getSeconds())
    );
}

function generatePassword(timestamp) {
    return Buffer.from(
        `${CONFIG.shortCode}${CONFIG.passkey}${timestamp}`
    ).toString('base64');
}

function normalizePhone(phone) {
    let p = String(phone).replace(/\D/g, '');
    if (p.startsWith('0')) p = '254' + p.slice(1);
    else if (p.startsWith('7') || p.startsWith('1')) p = '254' + p;
    return p;
}

async function initiateSTKPush({
    phone,
    amount,
    accountReference = 'Subscription',
    description = 'App Subscription Payment',
}) {
    if (!CONFIG.shortCode || !CONFIG.passkey || !CONFIG.callbackUrl) {
        return {
            success: false,
            error: { errorMessage: 'M-PESA config missing (shortCode, passkey, callbackUrl)' },
        };
    }

    let token;
    try {
        token = await getAccessToken();
    } catch (err) {
        return { success: false, error: { errorMessage: err.message, code: err.code } };
    }

    const timestamp = getTimestamp();
    const password = generatePassword(timestamp);
    const normalizedPhone = normalizePhone(phone);
    const partyB = CONFIG.tillNumber || CONFIG.shortCode;

    const payload = {
        BusinessShortCode: CONFIG.shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: CONFIG.transactionType,
        Amount: Math.round(amount),
        PartyA: normalizedPhone,
        PartyB: partyB,
        PhoneNumber: normalizedPhone,
        CallBackURL: CONFIG.callbackUrl,
        AccountReference: accountReference,
        TransactionDesc: description,
    };

    try {
        const { data } = await axios.post(
            `${CONFIG.baseUrl}/mpesa/stkpush/v1/processrequest`,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            }
        );

        return {
            success: true,
            merchantRequestId: data.MerchantRequestID,
            checkoutRequestId: data.CheckoutRequestID,
            responseCode: data.ResponseCode,
            responseDescription: data.ResponseDescription,
            customerMessage: data.CustomerMessage,
        };
    } catch (error) {
        const err = error.response?.data || error.message;
        LOGGER.error('[mpesa] STK Push error:', err);
        return { success: false, error: err };
    }
}

async function querySTKStatus(checkoutRequestId) {
    let token;
    try {
        token = await getAccessToken();
    } catch (err) {
        return { success: false, error: { errorMessage: err.message, code: err.code } };
    }

    const timestamp = getTimestamp();
    const password = generatePassword(timestamp);

    const payload = {
        BusinessShortCode: CONFIG.shortCode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
    };

    try {
        const { data } = await axios.post(
            `${CONFIG.baseUrl}/mpesa/stkpushquery/v1/query`,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            }
        );

        return {
            success: true,
            resultCode: String(data.ResultCode),
            resultDesc: data.ResultDesc,
            responseCode: data.ResponseCode,
        };
    } catch (error) {
        const err = error.response?.data || error.message;
        LOGGER.error('[mpesa] STK Query error:', err);
        return { success: false, error: err };
    }
}

function parseCallback(body) {
    const cb = body?.Body?.stkCallback;
    if (!cb) return { success: false, error: 'Invalid callback payload' };

    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc } = cb;

    if (ResultCode !== 0) {
        return {
            success: false,
            merchantRequestId: MerchantRequestID,
            checkoutRequestId: CheckoutRequestID,
            resultCode: String(ResultCode),
            resultDesc: ResultDesc,
        };
    }

    const items = cb.CallbackMetadata?.Item || [];
    const get = (name) => items.find((i) => i.Name === name)?.Value;

    return {
        success: true,
        merchantRequestId: MerchantRequestID,
        checkoutRequestId: CheckoutRequestID,
        resultCode: String(ResultCode),
        resultDesc: ResultDesc,
        amount: get('Amount'),
        mpesaReceiptNumber: get('MpesaReceiptNumber'),
        transactionDate: get('TransactionDate'),
        phoneNumber: get('PhoneNumber'),
    };
}

function isDuplicateCallback(checkoutRequestId) {
    if (!checkoutRequestId) return false;
    pruneSeenCallbacks();
    if (seenCallbacks.has(checkoutRequestId)) return true;
    seenCallbacks.set(checkoutRequestId, Date.now());
    return false;
}

function isSafaricomIp(ip) {
    if (!ip) return false;
    const clean = String(ip).replace('::ffff:', '').split(',')[0].trim();
    return SAFARICOM_IPS.includes(clean);
}

async function waitForResult(checkoutRequestId, { timeoutMs = 300000, intervalMs = 3000 } = {}) {
    const start = Date.now();
    const pendingCodes = new Set([
        RESULT_CODES.TRANSACTION_NOT_FOUND,
        '500.001.1001',
        '4999',
    ]);

    while (Date.now() - start < timeoutMs) {
        const r = await querySTKStatus(checkoutRequestId);
        if (r.success && !pendingCodes.has(r.resultCode)) {
            return r;
        }
        await new Promise((res) => setTimeout(res, intervalMs));
    }

    return { success: false, error: { errorMessage: 'timeout', code: 'TIMEOUT' } };
}

module.exports = {
    configure,
    getConfig,
    getAccessToken,
    initiateSTKPush,
    querySTKStatus,
    parseCallback,
    normalizePhone,
    isDuplicateCallback,
    isSafaricomIp,
    waitForResult,
    MpesaError,
    SAFARICOM_IPS,
    RESULT_CODES,
};