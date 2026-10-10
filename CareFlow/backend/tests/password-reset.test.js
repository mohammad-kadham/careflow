const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'password-reset-tests-only-'.repeat(3);
process.env.NODE_ENV = 'development';
process.env.APP_URL = 'https://clinic.example';
process.env.BREVO_API_KEY = 'test-key';
process.env.BREVO_SENDER_EMAIL = 'sender@example.com';
process.env.ADMIN_USER_IDS = '7';
const users = [7, 8].map(id => ({ id, clinic_id: 10, email: `user${id}@example.com`, name: 'Test',
    role: id === 7 ? 'doctor' : 'staff', password: bcrypt.hashSync('original-password', 4), auth_version: 0,
    email_verification_required: 1, email_verified_at: '2026-01-01', subscription_active: 1 }));
const userPath = require.resolve('../models/users');
require.cache[userPath] = { id: userPath, filename: userPath, loaded: true, exports: {
    findUserByEmail: async email => [users.filter(user => user.email === email)],
    findUserById: async id => [users.filter(user => user.id === id)],
} };
const sessions = new Map(), adminPath = require.resolve('../models/admin');
require.cache[adminPath] = { id: adminPath, filename: adminPath, loaded: true, exports: {
    createSession: async (hash, id, version) => sessions.set(hash, { user_id: id, auth_version: version }),
    findSession: async hash => [sessions.has(hash) ? [sessions.get(hash)] : []],
    deleteSession: async hash => sessions.delete(hash),
} };
const records = new Map(), tokenPath = require.resolve('../models/password-reset');
require.cache[tokenPath] = { id: tokenPath, filename: tokenPath, loaded: true, exports: {
    reserve: async (id, hash, version) => {
        if (records.get(id)?.sent > Date.now() - 60000) return false;
        records.set(id, { hash, version, expires: Date.now() + 1800000, sent: Date.now() }); return true;
    },
    revoke: async (id, hash) => { if (records.get(id)?.hash === hash) records.get(id).hash = null; },
    consume: async (hash, password) => {
        for (const [id, record] of records) {
            const user = users.find(user => user.id === id);
            if (record.hash === hash && record.expires > Date.now() && record.version === user.auth_version) {
                record.hash = null; user.password = password; user.auth_version++;
                for (const [key, session] of sessions) if (session.user_id === id) sessions.delete(key);
                return true;
            }
        }
        return false;
    },
} };
const app = require('../server'), auth = require('../config/auth'), adminAuth = require('../middleware/admin');
const reset = require('../services/password-reset');

async function until(predicate) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail('Background email work did not finish');
}

test('password reset over HTTP with mocked email and persistence', async t => {
    const sent = []; let failDelivery = false;
    const realFetch = globalThis.fetch;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        if (url !== 'https://api.brevo.com/v3/smtp/email') return realFetch(url, options);
        if (failDelivery) return Response.json({ error: 'private-provider-response' }, { status: 500 });
        sent.push(JSON.parse(options.body)); return Response.json({ messageId: 'test-message' }, { status: 201 });
    });
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const base = 'http://127.0.0.1:' + server.address().port;
    let ip = '192.0.2.1';
    const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...headers }, body: JSON.stringify(body) });
    const get = (path, cookie) => fetch(base + path, { headers: { Cookie: cookie } });
    const request = (email, extra = {}) => post('/user/password-reset/request', { email, ...extra });
    const confirm = (token, password = 'new-password', extra = {}) => post('/user/password-reset/confirm', { token, password, ...extra });
    const mailedToken = () => sent.at(-1).htmlContent.match(/#token=([a-f0-9]{64})/)[1];
    let firstToken, replacement, oldCookie, adminCookie;

    await t.test('request does not reveal account existence, change passwords or bypass cooldown', async () => {
        const response = await request('user7@example.com', { redirect: 'https://evil.example' });
        const absent = await request('absent@example.com');
        const cooldown = await request('user7@example.com');
        for (const result of [response, absent, cooldown]) assert.equal(result.status, 202);
        const body = await response.json();
        assert.deepEqual(await absent.json(), body); assert.deepEqual(await cooldown.json(), body);
        assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('set-cookie'), null);
        await until(() => sent.length === 1);
        firstToken = mailedToken();
        assert.equal(records.get(7).hash, reset.hashToken(firstToken));
        assert.ok(!JSON.stringify(body).includes(firstToken)); assert.doesNotMatch(sent[0].htmlContent, /evil\.example/);
        assert.equal(await bcrypt.compare('original-password', users[0].password), true);
        const login = await post('/user/login', { email: users[0].email, password: 'original-password' });
        oldCookie = login.headers.get('set-cookie').split(';')[0];
        assert.equal((await get('/user/me', oldCookie)).status, 200);
        const adminLogin = await post('/admin/login', { email: users[0].email, password: 'original-password' });
        adminCookie = adminLogin.headers.get('set-cookie').split(';')[0];
        assert.equal((await get('/admin/me', adminCookie)).status, 200);
    });
    await t.test('malformed, expired and superseded links cannot change credentials', async () => {
        for (const token of ['', 'a', 'g'.repeat(64), {}, null]) assert.equal((await confirm(token)).status, 400);
        assert.equal((await confirm(firstToken, 'short')).status, 400);
        assert.equal((await confirm(firstToken, 'ع'.repeat(37))).status, 400, 'bcrypt byte limit is enforced');
        records.get(7).expires = Date.now() - 1;
        assert.equal((await confirm(firstToken)).status, 400);
        records.get(7).sent = 0;
        await request('user7@example.com'); await until(() => sent.length === 2);
        replacement = mailedToken(); assert.notEqual(replacement, firstToken);
        assert.equal((await confirm(firstToken)).status, 400);
        assert.equal(await bcrypt.compare('original-password', users[0].password), true);
    });
    await t.test('one reset succeeds, hashes the password and revokes user and admin sessions', async () => {
        const results = await Promise.all([confirm(replacement, 'new-password', { userId: 8, auth_version: 0 }), confirm(replacement)]);
        assert.deepEqual(results.map(response => response.status).sort(), [200, 400]);
        const success = results.find(response => response.status === 200);
        assert.match(success.headers.get('set-cookie'), /careflow_session=;/);
        assert.match(success.headers.get('set-cookie'), /careflow_admin=;/);
        assert.ok(!JSON.stringify(await success.json()).includes('new-password'));
        assert.equal(await bcrypt.compare('new-password', users[0].password), true);
        assert.notEqual(users[0].password, 'new-password'); assert.equal(users[0].auth_version, 1);
        assert.equal(await bcrypt.compare('original-password', users[1].password), true, 'Client cannot choose a different user');
        assert.equal((await get('/user/me', oldCookie)).status, 401);
        assert.equal((await get('/admin/me', adminCookie)).status, 401);
        const legacyCookie = auth.cookieName + '=' + jwt.sign({ userId: 7 }, auth.secret, { issuer: auth.issuer, audience: auth.audience, expiresIn: 3600 });
        assert.equal((await get('/user/me', legacyCookie)).status, 401, 'Old JWTs without a version cannot bypass revocation');
        const staleAdminToken = 'c'.repeat(64);
        sessions.set(adminAuth.hash(staleAdminToken), { user_id: 7, auth_version: 0 });
        assert.equal((await get('/admin/me', adminAuth.cookieName + '=' + staleAdminToken)).status, 401, 'A login race cannot reintroduce an old admin session');
        assert.equal((await post('/user/login', { email: users[0].email, password: 'original-password' })).status, 401);
        const fresh = await post('/user/login', { email: users[0].email, password: 'new-password' });
        assert.equal(fresh.status, 200);
        assert.equal((await get('/user/me', fresh.headers.get('set-cookie').split(';')[0])).status, 200);
    });
    await t.test('staff can reset passwords but email verification remains required', async () => {
        ip = '192.0.2.2'; users[1].email_verified_at = null;
        await request(users[1].email); await until(() => sent.length === 3);
        assert.equal((await confirm(mailedToken(), 'staff-new-password')).status, 200);
        assert.equal((await post('/user/login', { email: users[1].email, password: 'staff-new-password' })).status, 403);
        assert.equal(users[1].email_verified_at, null);
    });
    await t.test('provider failures stay generic and configuration errors are independent of account existence', async () => {
        ip = '192.0.2.3'; failDelivery = true; records.get(7).sent = 0;
        const response = await request(users[0].email);
        assert.equal(response.status, 202); assert.doesNotMatch(JSON.stringify(await response.json()), /private|test-key/);
        await until(() => records.get(7).hash === null);
        delete process.env.BREVO_API_KEY;
        assert.equal((await request(users[0].email)).status, 503);
        assert.equal((await request('absent@example.com')).status, 503);
        process.env.BREVO_API_KEY = 'test-key'; failDelivery = false;
    });
    await t.test('JSON, origin checks and per-IP limits protect both reset endpoints', async () => {
        ip = '192.0.2.4';
        assert.equal((await post('/user/password-reset/request', { email: users[0].email }, { Origin: 'https://evil.example' })).status, 403);
        assert.equal((await post('/user/password-reset/confirm', { token: replacement, password: 'another-password' }, { 'Content-Type': 'text/plain' })).status, 415);
        assert.equal((await request('not-an-email')).status, 400);
        for (let i = 0; i < 4; i++) assert.equal((await request('absent@example.com')).status, 202);
        const limited = await request('absent@example.com'); assert.equal(limited.status, 429); assert.ok(limited.headers.get('retry-after'));
        for (let i = 0; i < 20; i++) assert.equal((await confirm('bad')).status, 400);
        assert.equal((await confirm('bad')).status, 429);
    });
});
