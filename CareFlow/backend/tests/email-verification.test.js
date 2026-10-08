const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'verification-tests-only-'.repeat(3);
process.env.NODE_ENV = 'development';
process.env.APP_URL = 'https://clinic.example';
process.env.BREVO_API_KEY = 'test-api-key';
process.env.BREVO_SENDER_EMAIL = 'no-reply@clinic.example';

const users = [];
const dbPath = require.resolve('../data/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query() { throw new Error('Unexpected persistence call'); } } };
const User = require('../models/users');
User.findUserByEmail = async email => [users.filter(user => user.email === email)];
User.findUserById = async id => [users.filter(user => user.id === id)];
User.createDoctor = async values => {
    const user = { ...values, id: users.length + 1, clinic_id: users.length + 1, role: 'doctor', email_verification_required: 1 };
    users.push(user); return user;
};
const records = new Map();
const tokenModel = require('../models/email-verification');
tokenModel.reserve = async (id, hash) => {
    if (records.get(id)?.cooldown) return false;
    records.set(id, { hash, expires: Date.now() + 3600000, cooldown: true }); return true;
};
tokenModel.revoke = async (id, hash) => { if (records.get(id)?.hash === hash) records.get(id).hash = null; };
tokenModel.consume = async hash => {
    for (const [id, row] of records) if (row.hash === hash && row.expires > Date.now()) {
        row.hash = null; users.find(user => user.id === id).email_verified_at = new Date(); return true;
    }
    return false;
};
const app = require('../server');
const auth = require('../config/auth');
const verification = require('../services/email-verification');

test('email verification over HTTP with mocked Brevo and persistence', async t => {
    const realFetch = globalThis.fetch;
    const sent = [];
    let failDelivery = false;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        if (url !== 'https://api.brevo.com/v3/smtp/email') return realFetch(url, options);
        if (failDelivery) return Response.json({ message: 'private provider details' }, { status: 401 });
        assert.equal(options.headers['api-key'], 'test-api-key');
        assert.equal(options.redirect, 'error');
        sent.push(JSON.parse(options.body));
        return Response.json({ messageId: 'test-message' }, { status: 201 });
    });
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const base = 'http://127.0.0.1:' + server.address().port;
    const post = (route, body, headers = {}) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const signup = { name: '<script>alert(1)</script>', email: 'new@example.com', password: 'test-password', clinic_name: 'Clinic', phone: '07700000000', email_verified_at: '2026-01-01', email_verification_required: 0 };
    const mailedToken = () => sent.at(-1).htmlContent.match(/#token=([a-f0-9]{64})/)[1];
    let token;

    await t.test('signup sends escaped Arabic mail and stores only a token hash', async () => {
        const response = await post('/user/new', signup);
        assert.equal(response.status, 201);
        const body = await response.json();
        assert.equal(body.verificationRequired, true); assert.equal(body.emailSent, true);
        assert.equal(response.headers.get('set-cookie'), null);
        token = mailedToken();
        assert.equal(records.get(1).hash, verification.hashToken(token));
        assert.notEqual(records.get(1).hash, token);
        assert.ok(!JSON.stringify(body).includes(token));
        assert.ok(!JSON.stringify(body).includes('test-api-key'));
        assert.match(sent[0].htmlContent, /&lt;script&gt;/);
        assert.ok(!sent[0].htmlContent.includes('<script>'));
        assert.match(sent[0].htmlContent, /https:\/\/clinic.example\/verify-email#token=/);
        assert.equal(users[0].email_verification_required, 1);
        assert.equal(users[0].email_verified_at, undefined);
    });
    await t.test('unverified login is blocked only after checking the password', async () => {
        assert.equal((await post('/user/login', { email: signup.email, password: 'wrong-password' })).status, 401);
        const response = await post('/user/login', signup);
        assert.equal(response.status, 403); assert.equal((await response.json()).code, 'EMAIL_NOT_VERIFIED');
        assert.match(response.headers.get('set-cookie'), /careflow_session=;/);
    });
    await t.test('unverified users cannot bypass verification with a signed cookie', async () => {
        const session = jwt.sign({ userId: 1 }, auth.secret, { issuer: auth.issuer, audience: auth.audience, expiresIn: 3600 });
        for (const route of ['/user/me', '/user/payment-reports', '/in-queue']) {
            const response = await fetch(base + route, { headers: { Cookie: `${auth.cookieName}=${session}` } });
            assert.equal(response.status, 403);
        }
    });
    await t.test('resend does not reveal unknown accounts or bypass cooldown', async () => {
        const count = sent.length;
        const existing = await post('/user/verification/resend', { email: signup.email });
        const absent = await post('/user/verification/resend', { email: 'absent@example.com' });
        assert.equal(existing.status, 202); assert.equal(absent.status, 202);
        assert.deepEqual(await existing.json(), await absent.json()); assert.equal(sent.length, count);
    });
    await t.test('malformed and expired tokens cannot verify', async () => {
        for (const value of [null, {}, [], 'a', 'g'.repeat(64)]) assert.equal((await post('/user/verification/confirm', { token: value })).status, 400);
        records.get(1).expires = Date.now() - 1;
        assert.equal((await post('/user/verification/confirm', { token })).status, 400);
        assert.equal(users[0].email_verified_at, undefined);
    });
    await t.test('resend replaces an old link; a valid link verifies exactly once', async () => {
        records.get(1).cooldown = false;
        await post('/user/verification/resend', { email: signup.email });
        const replacement = mailedToken(); assert.notEqual(replacement, token);
        assert.equal((await post('/user/verification/confirm', { token })).status, 400);
        const results = await Promise.all([post('/user/verification/confirm', { token: replacement }), post('/user/verification/confirm', { token: replacement })]);
        assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
        assert.equal((await post('/user/login', signup)).status, 200);
    });
    await t.test('verified accounts receive no extra mail', async () => {
        const count = sent.length;
        assert.equal((await post('/user/verification/resend', { email: signup.email })).status, 202);
        assert.equal(sent.length, count);
    });
    await t.test('delivery failure preserves an unverified account and allows retry', async () => {
        failDelivery = true;
        const response = await post('/user/new', { ...signup, email: 'retry@example.com' });
        assert.equal(response.status, 201);
        const result = await response.json(); assert.equal(result.emailSent, false);
        assert.ok(!JSON.stringify(result).includes('private provider details'));
        assert.equal(records.get(2).hash, null);
        assert.equal((await post('/user/login', { email: 'retry@example.com', password: signup.password })).status, 403);
        failDelivery = false; records.get(2).cooldown = false;
        await post('/user/verification/resend', { email: 'retry@example.com' });
        assert.ok(records.get(2).hash);
    });
    await t.test('missing configuration does not create unusable accounts', async () => {
        delete process.env.BREVO_API_KEY;
        const count = users.length;
        assert.equal((await post('/user/new', { ...signup, email: 'blocked@example.com' })).status, 503);
        assert.equal(users.length, count);
        process.env.BREVO_API_KEY = 'test-api-key';
    });
    await t.test('existing accounts keep their login access', async () => {
        users.push({ id: 99, email: 'legacy@example.com', password: await bcrypt.hash('test-password', 10), role: 'doctor', clinic_id: 99, email_verification_required: 0 });
        assert.equal((await post('/user/login', { email: 'legacy@example.com', password: 'test-password' })).status, 200);
    });
});
