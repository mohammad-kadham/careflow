const { validationResult, matchedData } = require('express-validator');
const User = require('../models/users');
const verification = require('../services/email-verification');

exports.resend = async (req, res, next) => {
    if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'أدخل بريداً إلكترونياً صحيحاً.' });
    try {
        verification.assertConfigured();
        const { email } = matchedData(req, { locations: ['body'] });
        const [users] = await User.findUserByEmail(email);
        if (Number(users[0]?.email_verification_required) === 1 && !users[0].email_verified_at) {
            // Keep the response identical for absent, verified, throttled, and pending users.
            try { await verification.sendFor(users[0]); }
            catch { console.error('Verification email delivery failed.'); }
        }
        res.status(202).json({ message: 'Verification request received.' });
    } catch (error) { next(error); }
};

exports.verify = async (req, res, next) => {
    if (!validationResult(req).isEmpty()) return res.status(400).json({ code: 'INVALID_VERIFICATION_LINK', error: 'رابط التأكيد غير صالح أو انتهت صلاحيته.' });
    try {
        const { token } = matchedData(req, { locations: ['body'] });
        if (!await verification.verify(token)) return res.status(400).json({ code: 'INVALID_VERIFICATION_LINK', error: 'رابط التأكيد غير صالح أو انتهت صلاحيته.' });
        res.json({ message: 'Email verified. Please log in.' });
    } catch (error) { next(error); }
};
