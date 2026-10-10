const trials = require('../models/trial-codes');
const User = require('../models/users');
const { subscriptionFor } = require('../middleware/subscription');

exports.redeem = async (req, res, next) => {
    const raw = req.body?.code;
    if (typeof raw !== 'string' || raw.length > 80) return res.status(400).json({ error: 'أدخل رمز تجربة صالحاً.' });
    const code = raw.trim().toUpperCase();
    if (!/^CF-(?:[A-F0-9]{6}-){3}[A-F0-9]{6}$/.test(code)) return res.status(400).json({ error: 'أدخل رمز تجربة صالحاً.' });
    try {
        const result = await trials.redeem(code, req.user.clinic_id, req.user.id);
        const [[user]] = await User.findUserById(req.user.id);
        if (!user) throw new Error('Unable to refresh subscription');
        res.json({ ...result, subscription: subscriptionFor(user) });
    } catch (error) { next(error); }
};
