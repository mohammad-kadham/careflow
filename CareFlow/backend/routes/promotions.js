const express = require('express');
const { body, validationResult } = require('express-validator');
const model = require('../models/promotions');
const rateLimit = require('../middleware/rate-limit');
const router = express.Router();

function normalizePhone(value) {
    let phone = value.trim().replace(/[٠-٩۰-۹]/g, digit => {
        const code = digit.charCodeAt(0);
        return String(code >= 0x6f0 ? code - 0x6f0 : code - 0x660);
    }).replace(/[\s().-]/g, '');
    if (phone.startsWith('00')) phone = '+' + phone.slice(2);
    if (/^07\d{9}$/.test(phone)) phone = '+964' + phone.slice(1);
    if (/^9647\d{9}$/.test(phone)) phone = '+' + phone;
    return phone;
}

router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.post('/', rateLimit({ limit: 5, windowMs: 15 * 60 * 1000 }), [
    body('email').isString().bail().trim().isLength({ min: 3, max: 254 }).bail().isEmail().bail().toLowerCase(),
    body('phone').isString().bail().isLength({ min: 7, max: 40 }).bail()
        .customSanitizer(normalizePhone).matches(/^\+?[1-9]\d{6,14}$/),
    body('consent').custom(value => value === true),
], async (req, res, next) => {
    if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'أدخل بريدًا إلكترونيًا ورقم هاتف صحيحين، ووافق على التواصل بشأن العروض.' });
    try {
        await model.subscribe({ email: req.body.email, phone: req.body.phone });
        // The same response for new and existing contacts avoids exposing membership.
        res.json({ ok: true });
    } catch (error) { next(error); }
});

module.exports = router;
