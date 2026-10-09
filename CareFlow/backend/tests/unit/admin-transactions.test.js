const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const dbPath = require.resolve('../../data/db');
const pool = { getConnection: async () => { throw new Error('Stub missing'); } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
const admin = require('../../models/admin');

function database(t, { reportStatus = 'pending', auditFailure = false } = {}) {
    let clinic = { id: 10, name: 'Test clinic', plan: null, revision: 0, required: 1, expiresAt: null }, report = { id: 4, clinic_id: 10, plan: 'basic', status: reportStatus };
    let audits = [], backup, commits = 0, rollbacks = 0, released = 0;
    const connection = {
        async beginTransaction() { backup = structuredClone({ clinic, report, audits }); },
        async commit() { commits++; }, async rollback() { ({ clinic, report, audits } = backup); rollbacks++; }, release() { released++; },
        async query(sql, params) {
            if (sql.startsWith('SELECT id, clinic_id')) return [[{ ...report }]];
            if (sql.includes('FROM clinics c WHERE')) return [[{ ...clinic }]];
            if (sql.startsWith('SELECT request_hash')) return [audits.filter(row => row.requestId === params[0]).map(row => ({ request_hash: row.hash }))];
            if (sql.startsWith('UPDATE clinics')) {
                clinic.revision++;
                if (sql.includes('INTERVAL ? MONTH')) { clinic.plan = params[0]; clinic.months = (clinic.months || 0) + params[1]; }
                else if (sql.includes('subscription_expires_at = NULL')) clinic.expiresAt = null;
                else { clinic.plan = params[0]; clinic.expiresAt = params[1]; }
                return [{ affectedRows: 1 }];
            }
            if (sql.startsWith('UPDATE manual_payment_reports')) { report.status = params[0]; return [{ affectedRows: 1 }]; }
            if (sql.startsWith('INSERT INTO admin_subscription_audit')) {
                if (auditFailure) throw new Error('Audit storage unavailable');
                audits.push({ requestId: params[5], hash: params[6], actor: params[0], action: params[3] }); return [{ insertId: audits.length }];
            }
            throw new Error('Unexpected SQL: ' + sql);
        },
    };
    t.mock.method(pool, 'getConnection', async () => connection);
    return () => ({ clinic, report, audits, commits, rollbacks, released });
}

test('report approval and retries add exactly one month with one audit record', async t => {
    const state = database(t), input = { action: 'approve', reportId: 4, requestId: randomUUID(), reason: 'Verified receipt' };
    await admin.mutate(input, 1);
    assert.equal(state().report.status, 'approved'); assert.equal(state().clinic.months, 1);
    assert.equal((await admin.mutate(input, 1)).replayed, true);
    assert.equal(state().clinic.months, 1); assert.equal(state().audits.length, 1);
    await assert.rejects(admin.mutate({ ...input, requestId: randomUUID() }, 1), error => error.statusCode === 409);
    await assert.rejects(admin.mutate({ ...input, reason: 'Changed payload' }, 1), error => error.statusCode === 409);
    assert.equal(state().clinic.months, 1);
});
test('rejection preserves subscription and cannot be reversed by approval', async t => {
    const state = database(t);
    await admin.mutate({ action: 'reject', reportId: 4, requestId: randomUUID(), reason: 'No matching receipt' }, 1);
    assert.equal(state().report.status, 'rejected'); assert.equal(state().clinic.revision, 0);
    await assert.rejects(admin.mutate({ action: 'approve', reportId: 4, requestId: randomUUID(), reason: 'Later approval' }, 1), error => error.statusCode === 409);
});
test('manual grants are idempotent and stale subscription edits cannot overwrite a change', async t => {
    const state = database(t), input = { action: 'grant', clinicId: 10, plan: 'advanced', months: 3, expectedRevision: 0, requestId: randomUUID(), reason: 'Manual renewal' };
    await admin.mutate(input, 1); await admin.mutate(input, 1);
    assert.equal(state().clinic.months, 3); assert.equal(state().audits.length, 1);
    await assert.rejects(admin.mutate({ ...input, action: 'revoke', requestId: randomUUID() }, 1), error => error.statusCode === 409);
    await admin.mutate({ ...input, action: 'revoke', expectedRevision: 1, requestId: randomUUID() }, 1);
    assert.equal(state().clinic.expiresAt, null); assert.equal(state().clinic.revision, 2);
});
test('audit failure rolls back both the subscription and payment decision', async t => {
    const state = database(t, { auditFailure: true });
    await assert.rejects(admin.mutate({ action: 'approve', reportId: 4, requestId: randomUUID(), reason: 'Verified' }, 1), /Audit storage/);
    assert.equal(state().clinic.revision, 0); assert.equal(state().report.status, 'pending');
    assert.equal(state().commits, 0); assert.equal(state().rollbacks, 1); assert.equal(state().released, 1);
});
