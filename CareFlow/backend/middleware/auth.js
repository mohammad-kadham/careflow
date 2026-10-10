const jwt = require('jsonwebtoken');
const User = require('../models/users');
const auth = require('../config/auth');

function readSessionCookie(req) {
    const cookies = (req.headers.cookie || '').split(';');
    const matches = cookies.map(cookie => cookie.trim())
        .filter(cookie => cookie.startsWith(auth.cookieName + '='));
    if (matches.length !== 1) return null;
    try {
        return decodeURIComponent(matches[0].slice(auth.cookieName.length + 1));
    } catch {
        return null;
    }
}

function unauthorized(res) {
    res.clearCookie(auth.cookieName, auth.cookieOptions);
    return res.status(401).json({ error: 'Please log in to continue.' });
}

async function requireAuth(req, res, next) {
    const token = readSessionCookie(req);
    if (!token) return unauthorized(res);

    let payload;
    try {
        payload = jwt.verify(token, auth.secret, {
            algorithms: ['HS256'],
            issuer: auth.issuer,
            audience: auth.audience,
        });
    } catch {
        return unauthorized(res);
    }

    if (!payload || !Number.isSafeInteger(payload.userId) || payload.userId <= 0 ||
        !Number.isInteger(payload.exp)) {
        return unauthorized(res);
    }

    try {
        const [rows] = await User.findUserById(payload.userId);
        if (!rows[0]) return unauthorized(res);
        if ((payload.authVersion ?? 0) !== Number(rows[0].auth_version ?? 0)) return unauthorized(res);
        if (Number(rows[0].email_verification_required) === 1 && !rows[0].email_verified_at) {
            res.clearCookie(auth.cookieName, auth.cookieOptions);
            return res.status(403).json({ code: 'EMAIL_NOT_VERIFIED', error: 'يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول.' });
        }
        // Use current database values; do not trust roles sent by the client.
        if (!['doctor', 'staff'].includes(rows[0].role)) {
            return res.status(403).json({ error: 'نوع الحساب غير مدعوم.' });
        }
        if (!Number.isSafeInteger(rows[0].clinic_id) || rows[0].clinic_id < 1) {
            return res.status(403).json({ error: 'لم يتم تعيين عيادة لهذا الحساب.' });
        }
        req.user = rows[0];
        next();
    } catch (error) {
        next(error);
    }
}

// JSON-only writes cannot be submitted by an ordinary cross-origin HTML form.
// Browser origins are checked explicitly: CORS alone does not stop writes.
function protectCookieWrites(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

    const origin = req.get('Origin');
    if ((origin && !auth.allowedOrigins.includes(origin)) ||
        (!origin && req.get('Sec-Fetch-Site') === 'cross-site')) {
        return res.status(403).json({ error: 'Request origin is not allowed.' });
    }
    if (!req.is('application/json')) {
        return res.status(415).json({ error: 'Use Content-Type: application/json for this request.' });
    }
    next();
}

module.exports = { requireAuth, protectCookieWrites };
