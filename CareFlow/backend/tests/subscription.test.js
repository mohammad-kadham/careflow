const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'subscription-test-secret-'.repeat(4);
process.env.NODE_ENV = 'development';
const users = [{ id: 1, role: 'doctor', clinic_id: 10 }, { id: 2, role: 'staff', clinic_id: 10, doctor_id: 1 }, { id: 3, role: 'doctor', clinic_id: 20 }];
const clinics = new Map([[10, { required: 1, plan: null, expires: null }], [20, { required: 0, plan: null, expires: null }]]);
let clinicalReads = 0;
const dbPath = require.resolve('../data/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { async query(sql, params) {
    if (sql.includes('WHERE u.id')) {
        assert.match(sql, /c.subscription_required = 0 OR/);
        assert.match(sql, /c.subscription_plan IN \('basic', 'advanced'\)/);
        assert.match(sql, /c.subscription_expires_at > UTC_TIMESTAMP\(\)/);
        assert.match(sql, /JOIN clinics c ON c.id = u.clinic_id WHERE u.id = \?/);
        return [users.filter(user => user.id === params[0]).map(user => {
            const clinic = clinics.get(user.clinic_id);
            return { ...user, subscription_required: clinic.required, subscription_plan: clinic.plan,
                subscription_expires_at: clinic.expires, subscription_active: Number(!clinic.required ||
                    (['basic', 'advanced'].includes(clinic.plan) && Date.parse(clinic.expires) > Date.now())) };
        })];
    }
    if (sql.includes('FROM in_queue')) { clinicalReads++; return [[]]; }
    throw new Error('Unexpected SQL: ' + sql);
} } };
const app = require('../server');
const auth = require('../config/auth');

test('manual subscription access follows database approval, expiry, and clinic boundaries', async t => {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const request = (path, userId, method = 'GET', body) => fetch('http://127.0.0.1:' + server.address().port + path, {
        method, headers: { 'Content-Type': 'application/json', ...(userId ? { Cookie: auth.cookieName + '=' + jwt.sign({ userId, subscription_active: 1 }, auth.secret, {
            algorithm: 'HS256', issuer: auth.issuer, audience: auth.audience, expiresIn: 3600,
        }) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal((await request('/in-queue', null)).status, 401);
    for (const id of [1, 2]) {
        const me = await request('/user/me', id);
        assert.equal(me.status, 200);
        assert.equal((await me.json()).user.subscription.active, false);
        for (const path of ['/patients', '/in-queue', '/patients/1/visits', '/user/staff', '/user/entry-state']) {
            const response = await request(path, id);
            assert.equal(response.status, 402, path);
            assert.equal((await response.json()).code, 'SUBSCRIPTION_REQUIRED');
        }
        assert.equal((await request('/in-queue', id, 'POST', { patientId: 1, subscription_active: 1, clinic_id: 20 })).status, 402);
        assert.equal((await request('/in-queue', id, 'DELETE', {})).status, 402);
        assert.equal((await request('/user/buzzer', id, 'POST', {})).status, 402);
        assert.equal((await request('/user/logout', id, 'POST', {})).status, 200);
    }
    assert.equal(clinicalReads, 0, 'Unpaid accounts cannot reach clinical data');
    assert.equal((await request('/in-queue', 3)).status, 200, 'Existing clinics retain access');
    clinics.set(10, { required: 1, plan: 'basic', expires: new Date(Date.now() + 86400000).toISOString() });
    for (const id of [1, 2]) {
        assert.equal((await request('/in-queue', id)).status, 200, 'Approval covers the clinic doctor and staff');
        assert.equal((await (await request('/user/me', id)).json()).user.subscription.active, true);
    }
    clinics.get(10).expires = '2000-01-01T00:00:00Z';
    assert.equal((await request('/in-queue', 1)).status, 402, 'Expiry takes effect without logging in again');
    clinics.get(10).expires = null;
    assert.equal((await request('/in-queue', 2)).status, 402, 'Revocation applies to staff too');
    clinics.get(10).expires = new Date(Date.now() + 86400000).toISOString();
    clinics.get(10).plan = 'forged';
    assert.equal((await request('/in-queue', 1)).status, 402, 'Unknown plans do not grant access');
    assert.equal((await request('/in-queue', 3)).status, 200, 'Other clinics stay unaffected');
});

test('subscription migration is additive and repeatable without granting or revoking existing access', async () => {
    const migrate = require('../data/migrations/add-subscriptions');
    const columns = new Set();
    const alters = [];
    const db = { async query(sql, params) {
        if (sql.startsWith('SELECT')) return [columns.has(params[0]) ? [{ COLUMN_NAME: params[0] }] : []];
        assert.match(sql, /^ALTER TABLE clinics ADD COLUMN subscription_/);
        columns.add(sql.split(' ')[5]); alters.push(sql); return [[]];
    } };
    await migrate(db); await migrate(db);
    assert.equal(alters.length, 3);
    assert.ok(alters.includes('ALTER TABLE clinics ADD COLUMN subscription_required TINYINT(1) NOT NULL DEFAULT 0'));
    await assert.rejects(migrate({ async query() { throw new Error('Database unavailable'); } }), /Database unavailable/);
});
