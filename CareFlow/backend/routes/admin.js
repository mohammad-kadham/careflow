const express = require('express');
const bcrypt = require('bcryptjs');
const { randomBytes } = require('node:crypto');
const User = require('../models/users');
const model = require('../models/admin');
const auth = require('../middleware/admin');
const rateLimit = require('../middleware/rate-limit');
const router = express.Router();
const dummyHash = bcrypt.hashSync('unused-admin-login-placeholder', 10);
const invalid = res => res.status(400).json({ error: 'تحقق من البيانات المدخلة ثم حاول مجددًا.' });
const publicUser = user => ({ name: user.name, email: user.email });

router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.post('/login', rateLimit({ limit: 10, windowMs: 15 * 60 * 1000 }), async (req, res, next) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || email.length > 255 || !email.trim() || typeof password !== 'string' || !password || Buffer.byteLength(password) > 72) return invalid(res);
    try {
        const [[user]] = await User.findUserByEmail(email.trim());
        const valid = await bcrypt.compare(password, user?.password || dummyHash);
        if (!valid || !auth.allowed(user)) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة أو الحساب غير مخوّل للإدارة.' });
        const oldToken = auth.tokenFrom(req);
        if (oldToken) await model.deleteSession(auth.hash(oldToken));
        const token = randomBytes(32).toString('hex');
        await model.createSession(auth.hash(token), user.id);
        res.cookie(auth.cookieName, token, { ...auth.cookieOptions, maxAge: 30 * 60 * 1000 });
        res.json({ user: publicUser(user) });
    } catch (error) { next(error); }
});
router.post('/logout', async (req, res, next) => {
    try {
        const token = auth.tokenFrom(req);
        if (token) await model.deleteSession(auth.hash(token));
        res.clearCookie(auth.cookieName, auth.cookieOptions);
        res.json({ ok: true });
    } catch (error) { next(error); }
});
router.use(auth.requireAdmin);
router.get('/me', (req, res) => res.json({ user: publicUser(req.admin) }));
router.get('/summary', async (req, res, next) => { try { res.json(await model.summary()); } catch (error) { next(error); } });
for (const name of ['payments', 'clinics', 'audit']) {
    router.get('/' + name, async (req, res, next) => {
        const { q = '', status = 'pending', page = '1' } = req.query;
        if (typeof q !== 'string' || q.length > 150 || typeof page !== 'string' || !/^[1-9]\d{0,5}$/.test(page) || !['pending', 'approved', 'rejected', 'all'].includes(status)) return invalid(res);
        try { res.json(await model[name]({ q: q.trim(), status, page: Number(page) })); } catch (error) { next(error); }
    });
}

function mutation(type) {
    return async (req, res, next) => {
        const id = Number(req.params.id);
        const { action, reason, requestId, confirmed, plan, months, expiresAt, expectedRevision } = req.body || {};
        const actions = type === 'report' ? ['approve', 'reject'] : ['grant', 'set', 'revoke'];
        if (!Number.isSafeInteger(id) || id <= 0 || !actions.includes(action) ||
            typeof reason !== 'string' || !reason.trim() || reason.trim().length > 1000 ||
            typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return invalid(res);
        const input = { action, reason: reason.trim(), requestId: requestId.toLowerCase() };
        if (type === 'report') {
            if (action === 'approve' && confirmed !== true) return res.status(400).json({ error: 'أكد استلام المبلغ قبل الموافقة.' });
            input.reportId = id;
        } else {
            if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return invalid(res);
            Object.assign(input, { clinicId: id, expectedRevision });
            if (['grant', 'set'].includes(action)) {
                if (!['basic', 'advanced'].includes(plan)) return invalid(res);
                input.plan = plan;
            }
            if (action === 'grant') {
                if (!Number.isInteger(months) || months < 1 || months > 12) return invalid(res);
                input.months = months;
            }
            if (action === 'set') {
                const date = typeof expiresAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(expiresAt) ? new Date(expiresAt) : null;
                if (!date || !Number.isFinite(date.getTime()) || date.toISOString() !== expiresAt || date.getTime() <= Date.now() || date.getTime() > Date.now() + 10 * 366 * 86400000) return invalid(res);
                input.expiresAt = expiresAt;
            }
        }
        try { res.json(await model.mutate(input, req.admin.id)); } catch (error) { next(error); }
    };
}
router.post('/payments/:id/review', mutation('report'));
router.post('/clinics/:id/subscription', mutation('clinic'));
router.use((req, res) => res.status(404).json({ error: 'المسار غير موجود.' }));
module.exports = router;
