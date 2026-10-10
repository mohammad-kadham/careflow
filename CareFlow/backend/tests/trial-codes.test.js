const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'trial-code-test-secret-'.repeat(4);
process.env.NODE_ENV = 'development';
const users = [{ id: 1, role: 'doctor', clinic_id: 10, subscription_active: 0, subscription_required: 1 },
    { id: 2, role: 'staff', clinic_id: 10, subscription_active: 0 }];
const userPath = require.resolve('../models/users');
require.cache[userPath] = { id: userPath, filename: userPath, loaded: true, exports: { findUserById: async id => [users.filter(user => user.id === id)] } };
const calls = [], trialPath = require.resolve('../models/trial-codes');
let availableCode = 'CF-ABCDEF-123456-789ABC-DEF012';
require.cache[trialPath] = { id: trialPath, filename: trialPath, loaded: true, exports: {
    availableCode: async () => availableCode,
    redeem: async (...args) => {
        calls.push(args);
        Object.assign(users[0], { subscription_active: 1, subscription_plan: 'basic', subscription_expires_at: '2026-10-20T12:00:00Z' });
        return { replayed: false };
    },
} };
const app = require('../server'), auth = require('../config/auth');

test('unpaid verified doctors can redeem; ownership, plan and duration come from the server', async t => {
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const request = (id, body, headers = {}) => fetch('http://127.0.0.1:' + server.address().port + '/user/trial-code', {
        method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(id ? { Cookie: auth.cookieName + '=' + jwt.sign({ userId: id }, auth.secret, {
            algorithm: 'HS256', issuer: auth.issuer, audience: auth.audience, expiresIn: 3600,
        }) } : {}), ...headers }, body: JSON.stringify(body),
    });
    const code = 'CF-ABCDEF-123456-789ABC-DEF012';
    assert.equal((await request(null, { code })).status, 401);
    assert.equal((await request(null)).status, 401);
    assert.equal((await request(2)).status, 403);
    assert.equal((await request(2, { code })).status, 403);
    users[0].email_verification_required = 1;
    assert.equal((await request(1, { code })).status, 403);
    assert.equal((await request(1)).status, 403);
    users[0].email_verified_at = '2026-10-10';
    const displayed = await request(1);
    assert.equal(displayed.status, 200);
    assert.equal(displayed.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await displayed.json(), { code });
    assert.equal(calls.length, 0, 'Displaying the code does not activate or consume a trial');
    availableCode = null;
    assert.deepEqual(await (await request(1)).json(), { code: null });
    availableCode = code;
    assert.equal((await request(1, { code }, { Origin: 'https://evil.example' })).status, 403);
    for (const body of [null, {}, { code: 42 }, { code: ' ' }, { code: 'x'.repeat(81) }]) assert.equal((await request(1, body)).status, 400);
    const response = await request(1, { code: ' ' + code.toLowerCase() + ' ', clinicId: 999, userId: 999, plan: 'advanced', days: 999 });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(calls, [[code, 10, 1]]);
    assert.deepEqual((await response.json()).subscription, { active: true, required: true, plan: 'basic', expiresAt: '2026-10-20T12:00:00Z' });
    let last;
    for (let i = 0; i < 6; i++) last = await request(1, { code });
    assert.equal(last.status, 429); assert.ok(last.headers.get('retry-after'));
});
