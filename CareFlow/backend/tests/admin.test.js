const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
process.env.JWT_SECRET = 'admin-http-test-secret-'.repeat(4);
process.env.NODE_ENV = 'production';
process.env.ADMIN_USER_IDS = '1';
const password = 'test-password-only';
const users = [
    { id: 1, email: 'owner@example.com', role: 'doctor', name: 'Owner', email_verification_required: 1, email_verified_at: '2026-01-01', password: bcrypt.hashSync(password, 4) },
    { id: 2, email: 'doctor@example.com', role: 'doctor', password: bcrypt.hashSync(password, 4) },
    { id: 3, email: 'staff@example.com', role: 'staff', password: bcrypt.hashSync(password, 4) },
];
const sessions = new Map(), mutations = [];
const trialCalls = [];
const trialPath = require.resolve('../models/trial-codes');
require.cache[trialPath] = { id: trialPath, filename: trialPath, loaded: true, exports: {
    list: async input => { trialCalls.push(['list', input]); return { rows: [], hasMore: false }; },
    create: async (input, actorId) => { trialCalls.push(['create', input, actorId]); return { id: 1, code: 'TEST-CODE', plan: input.plan }; },
    setEnabled: async enabled => { trialCalls.push(['setEnabled', enabled]); },
} };
const userPath = require.resolve('../models/users');
require.cache[userPath] = { id: userPath, filename: userPath, loaded: true, exports: {
    findUserByEmail: async email => [users.filter(user => user.email === email)],
    findUserById: async id => [users.filter(user => user.id === id)],
} };
const modelPath = require.resolve('../models/admin');
require.cache[modelPath] = { id: modelPath, filename: modelPath, loaded: true, exports: {
    createSession: async (hash, id) => sessions.set(hash, id),
    findSession: async hash => [sessions.has(hash) ? [{ user_id: sessions.get(hash) }] : []],
    deleteSession: async hash => sessions.delete(hash),
    summary: async () => ({ pending: 4 }),
    payments: async filters => ({ rows: [], filters }), clinics: async filters => ({ rows: [], filters }), audit: async () => ({ rows: [] }),
    mutate: async (input, actorId) => { mutations.push({ input, actorId }); return { ok: true }; },
} };
const app = require('../server');

test('admin authentication is separate, restricted, revocable and protected against cross-site writes', async t => {
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const base = 'http://127.0.0.1:' + server.address().port;
    const request = (path, body, cookie, headers = {}) => fetch(base + '/admin' + path, {
        method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal((await request('/payments')).status, 401);
    assert.equal((await request('/trial-codes')).status, 401);
    assert.equal((await request('/trial-codes', { plan: 'basic', requestId: randomUUID() })).status, 401);
    assert.equal((await request('/trial-codes/status', { enabled: false })).status, 401);
    assert.equal((await request('/payments', undefined, 'careflow_session=customer-token')).status, 401);
    for (const email of ['doctor@example.com', 'staff@example.com', 'missing@example.com']) assert.equal((await request('/login', { email, password })).status, 401);
    users[0].email_verified_at = null;
    assert.equal((await request('/login', { email: users[0].email, password })).status, 401);
    users[0].email_verified_at = '2026-01-01';
    const login = await request('/login', { email: users[0].email, password });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /Secure/); assert.match(setCookie, /SameSite=Strict/); assert.match(setCookie, /Path=\/api\/admin/);
    const cookie = setCookie.split(';')[0];
    assert.equal((await login.json()).token, undefined);
    assert.ok(!sessions.has(cookie.split('=')[1]), 'Only a token hash is stored');
    assert.equal((await request('/me', undefined, cookie)).status, 200);
    assert.equal((await request('/me', undefined, cookie + '; ' + cookie)).status, 401);
    assert.equal((await request('/summary', undefined, cookie)).headers.get('cache-control'), 'no-store');
    process.env.ADMIN_USER_IDS = '';
    assert.equal((await request('/me', undefined, cookie)).status, 401, 'Removing authorization invalidates existing sessions');
    process.env.ADMIN_USER_IDS = '1';
    const review = { action: 'approve', confirmed: true, reason: 'Receipt verified', requestId: randomUUID(), plan: 'advanced', clinicId: 999, actorId: 999 };
    assert.equal((await request('/payments/4/review', review, cookie, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await request('/payments/4/review', review, cookie, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await request('/payments/4/review', { ...review, confirmed: false }, cookie)).status, 400);
    assert.equal((await request('/payments/4/review', review, cookie)).status, 200);
    assert.deepEqual(mutations[0], { actorId: 1, input: { action: 'approve', reason: review.reason, requestId: review.requestId, reportId: 4 } });
    for (const bad of [{ action: 'grant', months: 0 }, { action: 'grant', months: 13 }, { action: 'grant', months: 1, plan: 'admin' },
        { action: 'grant', months: 1, expectedRevision: -1 }, { action: 'set', expiresAt: '2020-01-01T00:00:00.000Z' }, { action: 'revoke', reason: '' }]) {
        assert.equal((await request('/clinics/5/subscription', { reason: 'Manual change', requestId: randomUUID(), expectedRevision: 0, plan: 'basic', ...bad }, cookie)).status, 400);
    }
    assert.equal((await request('/payments?page=0', undefined, cookie)).status, 400);
    assert.equal((await request('/payments?status=anything', undefined, cookie)).status, 400);
    assert.equal(mutations.length, 1);
    assert.equal((await request('/trial-codes?page=0', undefined, cookie)).status, 400);
    assert.equal((await request('/trial-codes', undefined, cookie)).status, 200);
    const trialRequest = { plan: 'advanced', requestId: randomUUID() };
    for (const invalid of [{ ...trialRequest, plan: 'unknown' }, { ...trialRequest, requestId: '' }]) {
        assert.equal((await request('/trial-codes', invalid, cookie)).status, 400);
    }
    assert.equal((await request('/trial-codes', trialRequest, cookie, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await request('/trial-codes', { ...trialRequest, days: 999, actorId: 999 }, cookie)).status, 200);
    assert.equal((await request('/trial-codes/status', { enabled: 'false' }, cookie)).status, 400);
    assert.equal((await request('/trial-codes/status', { enabled: false }, cookie, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await request('/trial-codes/status', { enabled: false }, cookie)).status, 200);
    assert.equal((await request('/trial-codes/status', { enabled: true }, cookie)).status, 200);
    assert.deepEqual(trialCalls, [['list', { page: 1 }], ['create', trialRequest, 1], ['setEnabled', false], ['setEnabled', true]]);
    assert.equal((await request('/logout', {}, cookie)).status, 200);
    assert.equal((await request('/me', undefined, cookie)).status, 401, 'Logout revokes a copied cookie');
    for (let index = 0; index < 10; index++) await request('/login', { email: 'missing@example.com', password });
    const throttled = await request('/login', { email: users[0].email, password });
    assert.equal(throttled.status, 429); assert.ok(throttled.headers.get('retry-after'));
});
