const { validationResult, matchedData } = require('express-validator');
const User = require('../models/users');
const reset = require('../services/password-reset');
const auth = require('../config/auth');
const adminAuth = require('../middleware/admin');

exports.request = async (req, res, next) => {
    if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'أدخل بريداً إلكترونياً صحيحاً.' });
    try {
        reset.assertConfigured();
        const { email } = matchedData(req, { locations: ['body'] });
        const [[user]] = await User.findUserByEmail(email);
        // Don't reveal account existence or wait for provider timing before responding.
        res.status(202).json({ message: 'If the account exists, a password reset email will be sent.' });
        if (user) void reset.sendFor(user).catch(() => console.error('Password reset email delivery failed.'));
    } catch (error) { next(error); }
};

exports.confirm = async (req, res, next) => {
    if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'تحقق من رابط الاستعادة وكلمة السر (٦ أحرف على الأقل، و٧٢ بايت كحد أقصى).' });
    try {
        const { token, password } = matchedData(req, { locations: ['body'] });
        if (!await reset.reset(token, password)) return res.status(400).json({ code: 'INVALID_RESET_LINK', error: 'رابط الاستعادة غير صالح أو انتهت صلاحيته أو تم استخدامه. اطلب رابطاً جديداً.' });
        res.clearCookie(auth.cookieName, auth.cookieOptions);
        res.clearCookie(adminAuth.cookieName, adminAuth.cookieOptions);
        res.json({ message: 'Password reset. Please log in again.' });
    } catch (error) { next(error); }
};
