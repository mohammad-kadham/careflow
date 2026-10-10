const { createHash } = require('node:crypto');
const model = require('../models/admin');
const User = require('../models/users');
const cookieName = 'careflow_admin';
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
    path: process.env.NODE_ENV === 'production' ? '/api/admin' : '/admin' };
const hash = token => createHash('sha256').update(token).digest('hex');
function allowed(user) {
    const ids = (process.env.ADMIN_USER_IDS || '').split(',').map(id => id.trim()).filter(id => /^[1-9]\d*$/.test(id));
    return user && user.role === 'doctor' && ids.includes(String(user.id)) &&
        !(Number(user.email_verification_required) === 1 && !user.email_verified_at);
}
function tokenFrom(req) {
    const matches = (req.headers.cookie || '').split(';').map(value => value.trim()).filter(value => value.startsWith(cookieName + '='));
    if (matches.length !== 1) return null;
    const token = matches[0].slice(cookieName.length + 1);
    return /^[0-9a-f]{64}$/.test(token) ? token : null;
}
async function requireAdmin(req, res, next) {
    try {
        const token = tokenFrom(req);
        const [[session]] = token ? await model.findSession(hash(token)) : [[]];
        const [[user]] = session ? await User.findUserById(session.user_id) : [[]];
        if (!allowed(user) || Number(session.auth_version ?? 0) !== Number(user.auth_version ?? 0)) {
            res.clearCookie(cookieName, cookieOptions);
            return res.status(401).json({ error: 'سجّل الدخول بحساب الإدارة للمتابعة.' });
        }
        req.admin = user;
        next();
    } catch (error) { next(error); }
}
module.exports = { cookieName, cookieOptions, allowed, hash, tokenFrom, requireAdmin };
