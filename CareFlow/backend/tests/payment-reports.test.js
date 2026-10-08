const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'payment-report-test-secret-'.repeat(4);
process.env.NODE_ENV = 'development';
const users = [{ id: 1, role: 'doctor', clinic_id: 10, subscription_active: 0 },
    { id: 2, role: 'staff', clinic_id: 10, subscription_active: 0 },
    { id: 3, role: 'doctor', clinic_id: 20, subscription_active: 0 }];
const stored = [];
let failDatabase = false;
const dbPath = require.resolve('../data/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { async query(sql, params) {
    if (sql.includes('WHERE u.id')) return [users.filter(user => user.id === params[0])];
    if (failDatabase) throw new Error('Private DB failure');
    if (sql.startsWith('INSERT INTO manual_payment_reports')) {
        assert.equal(sql, 'INSERT INTO manual_payment_reports (clinic_id, user_id, plan, amount_iqd, sender_phone, transaction_reference, submitted_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())');
        const [clinicId, userId, plan, amountIqd, senderPhone, transactionReference] = params;
        if (stored.some(report => report.transactionReference === transactionReference)) {
            throw Object.assign(new Error('Duplicate'), { code: 'ER_DUP_ENTRY' });
        }
        stored.push({ id: stored.length + 1, clinicId, userId, plan, amountIqd, senderPhone, transactionReference, status: 'pending' });
        return [{ insertId: stored.length }];
    }
    if (sql.includes('FROM manual_payment_reports WHERE transaction_reference = ?')) return [stored.filter(report => report.transactionReference === params[0])];
    if (sql.includes('FROM manual_payment_reports WHERE clinic_id = ?')) return [stored.filter(report => report.clinicId === params[0]).slice().reverse().slice(0, 20)];
    throw new Error('Unexpected query: ' + sql);
} } };
const app = require('../server');
const auth = require('../config/auth');

test('payment reports identify customers, remain pending, and cannot bypass ownership or review', async t => {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const request = (id, body, path = '/user/payment-reports') => fetch('http://127.0.0.1:' + server.address().port + path, {
        method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(id ? {
            Cookie: auth.cookieName + '=' + jwt.sign({ userId: id }, auth.secret, { algorithm: 'HS256', issuer: auth.issuer, audience: auth.audience, expiresIn: 3600 }),
        } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payment = { plan: 'basic', senderPhone: '٠٧٧١٢٣٤٥٦٧٨', transactionReference: ' qi-123 ' };
    assert.equal((await request(null, payment)).status, 401);
    assert.equal((await request(2, payment)).status, 403);
    assert.equal((await request(2)).status, 403);
    assert.equal((await request(1, undefined, '/in-queue')).status, 402);
    const response = await request(1, { ...payment, clinic_id: 20, userId: 3, amountIqd: 1, status: 'approved', subscription_active: 1 });
    assert.equal(response.status, 201, 'Unpaid doctors can report their payment');
    const { report } = await response.json();
    assert.equal(report.clinicId, 10);
    assert.equal(report.userId, 1);
    assert.equal(report.amountIqd, 22500);
    assert.equal(report.senderPhone, '07712345678');
    assert.equal(report.transactionReference, 'QI-123');
    assert.equal(report.status, 'pending');
    assert.equal((await request(1, undefined, '/in-queue')).status, 402, 'Submission never activates access');
    assert.equal((await request(1, payment)).status, 200, 'Network retries return the existing report');
    assert.equal(stored.length, 1);
    assert.equal((await request(1, { ...payment, plan: 'advanced' })).status, 409);
    const conflict = await request(3, payment);
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).report, undefined, 'No cross-clinic payment details leak');
    assert.deepEqual((await (await request(3)).json()).reports, []);
    assert.equal((await (await request(1)).json()).reports.length, 1, 'Reports can be reloaded after leaving the page');
    for (const invalid of [null, {}, { ...payment, plan: '__proto__' }, { ...payment, senderPhone: 'invalid' },
        { ...payment, transactionReference: ' ' }, { ...payment, transactionReference: 'x'.repeat(101) }, { ...payment, transactionReference: 'x\ny' }]) {
        assert.equal((await request(1, invalid)).status, 400);
    }
    const responses = await Promise.all([request(1, { ...payment, plan: 'advanced', transactionReference: 'QI-456' }), request(1, { ...payment, plan: 'advanced', transactionReference: 'qi-456' })]);
    assert.deepEqual(responses.map(item => item.status).sort(), [200, 201]);
    assert.equal(stored.length, 2);
    assert.equal(stored[1].amountIqd, 37500);
    stored[0].status = 'approved';
    assert.equal((await (await request(1, payment)).json()).report.status, 'approved', 'A reviewed transaction cannot be submitted as a new pending payment');
    failDatabase = true;
    assert.equal((await request(1, { ...payment, transactionReference: 'QI-789' })).status, 500);
    assert.equal(stored.length, 2, 'Failed writes do not claim success');
    failDatabase = false;
});

test('payment report migration preserves history and makes transaction references unique', async () => {
    const migrate = require('../data/migrations/add-payment-reports');
    const statements = [];
    await migrate({ async query(sql) { statements.push(sql); } });
    assert.match(statements[0], /CREATE TABLE IF NOT EXISTS manual_payment_reports/);
    assert.match(statements[0], /UNIQUE KEY uq_manual_payment_transaction \(transaction_reference\)/);
    assert.match(statements[0], /DEFAULT 'pending'/);
    assert.match(statements[0], /ON DELETE RESTRICT/);
});
