const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'queue-visit-test-secret-'.repeat(4);
process.env.NODE_ENV = 'development';
const users = [
    { id: 1, role: 'doctor', clinic_id: 10 },
    { id: 2, role: 'staff', clinic_id: 10, doctor_id: 1 },
    { id: 3, role: 'doctor', clinic_id: 20 },
];
const patients = [{ id: 101, clinic_id: 10, name: 'Sample One' }, { id: 102, clinic_id: 20, name: 'Sample Two' }];
const queued = new Map([[101, false], [102, false]]);
let visits = 0;
const completed = new Set();
async function query(sql, params) {
    if (sql.startsWith('DELETE q FROM in_queue')) {
        assert.equal(sql, 'DELETE q FROM in_queue q JOIN patients p ON p.id = q.patient_id WHERE p.clinic_id = ?');
        assert.equal(params.length, 1);
        let affectedRows = 0;
        for (const patient of patients.filter(item => item.clinic_id === params[0])) {
            if (queued.delete(patient.id)) affectedRows++;
            completed.delete(patient.id);
        }
        return [{ affectedRows }];
    }
    if (sql.includes('WHERE u.id')) return [users.filter(user => user.id === params[0]).map(user => ({ ...user, subscription_active: 1 }))];
    if (sql.startsWith('UPDATE in_queue SET visit_completed_at')) {
        if (queued.has(params[0])) completed.add(params[0]);
        return [{ affectedRows: 1 }];
    }
    if (sql.includes('SET q.visit_completed_at = NULL')) {
        const owned = patients.some(patient => patient.id === params[0] && patient.clinic_id === params[1]);
        if (!owned || !completed.has(params[0])) return [{ affectedRows: 0 }];
        completed.delete(params[0]); queued.set(params[0], false);
        return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE in_queue')) {
        const owned = patients.some(patient => patient.id === params[0] && patient.clinic_id === params[1]);
        if (!owned || !queued.has(params[0]) || completed.has(params[0])) return [{ affectedRows: 0 }];
        const changed = !queued.get(params[0]);
        queued.set(params[0], true);
        return [{ affectedRows: Number(changed) }];
    }
    if (sql.startsWith('SELECT q.patient_id')) {
        return [patients.filter(patient => patient.id === params[0] && patient.clinic_id === params[1] && queued.has(patient.id) && !completed.has(patient.id))];
    }
    if (sql.includes('FROM in_queue q JOIN patients p')) {
        assert.match(sql, /visit_opened_at IS NOT NULL/);
        return [patients.filter(patient => patient.clinic_id === params[0] && queued.has(patient.id))
            .map(patient => ({ ...patient, visitOpen: Number(queued.get(patient.id) && !completed.has(patient.id)), visitCompleted: Number(completed.has(patient.id)) }))];
    }
    if (sql.startsWith('SELECT id FROM patients')) {
        return [patients.filter(patient => patient.id === params[0] && patient.clinic_id === params[1])];
    }
    if (sql.startsWith('INSERT INTO visits')) return [{ insertId: ++visits }];
    if (sql.startsWith('DELETE FROM in_queue')) { queued.delete(params[0]); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('INSERT INTO in_queue')) { queued.set(params[0], false); return [{ affectedRows: 1 }]; }
    throw new Error('Unexpected SQL: ' + sql);
}
const dbPath = require.resolve('../data/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    query, async getConnection() {
        return { query, async beginTransaction() {}, async commit() {}, async rollback() {}, release() {} };
    },
} };
const app = require('../server');
const auth = require('../config/auth');

test('opening a queued visit shares state with staff and keeps clinic boundaries', async t => {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const request = (path, userId, body) => fetch('http://127.0.0.1:' + server.address().port + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(userId ? { Cookie: auth.cookieName + '=' + jwt.sign({ userId }, auth.secret, {
            algorithm: 'HS256', issuer: auth.issuer, audience: auth.audience, expiresIn: 3600,
        }) } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const queue = async userId => (await (await request('/in-queue', userId)).json()).patients;

    assert.equal((await queue(2))[0].visitOpen, 0);
    assert.equal((await request('/in-queue/101/open-visit', null, {})).status, 401);
    assert.equal((await request('/in-queue/101/open-visit', 2, {})).status, 403);
    assert.equal((await request('/in-queue/102/open-visit', 1, { clinic_id: 20 })).status, 404);
    for (const id of ['abc', '-1', '1.2', '2147483648']) {
        assert.equal((await request('/in-queue/' + id + '/open-visit', 1, {})).status, 400);
    }
    assert.equal((await request('/in-queue/101/open-visit', 1, {})).status, 200);
    assert.equal((await queue(2))[0].visitOpen, 1);
    assert.equal((await queue(3))[0].visitOpen, 0);
    assert.equal(visits, 0, 'Opening must not create a medical visit');
    assert.equal((await request('/in-queue/101/open-visit', 1, {})).status, 200, 'Opening again is idempotent');
    assert.equal((await request('/patients/101/visits', 1, { notes: 'Completed' })).status, 201);
    const closed = await queue(2);
    assert.equal(closed.length, 1);
    assert.equal(closed[0].id, 101);
    assert.equal(closed[0].visitCompleted, 1);
    assert.equal(closed[0].visitOpen, 0);
    assert.equal((await request('/in-queue/101/open-visit', 1, {})).status, 404);
    await request('/in-queue', 2, { patientId: 101 });
    assert.equal((await queue(2))[0].visitOpen, 0, 'Re-queued patients start unhighlighted');
    assert.equal((await queue(2))[0].visitCompleted, 0);
    const clear = userId => fetch('http://127.0.0.1:' + server.address().port + '/in-queue?clinic_id=20', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(userId ? { Cookie: auth.cookieName + '=' + jwt.sign({ userId }, auth.secret, {
            algorithm: 'HS256', issuer: auth.issuer, audience: auth.audience, expiresIn: 3600,
        }) } : {}) },
        body: JSON.stringify({ clinic_id: 20 }),
    });
    assert.equal((await clear(null)).status, 401);
    assert.equal((await clear(2)).status, 403);
    assert.equal((await queue(2)).length, 1, 'Rejected clears leave the queue intact');
    await request('/patients/101/visits', 1, { notes: 'Completed before closing' });
    const savedVisits = visits;
    const response = await clear(1);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { cleared: 1 });
    assert.deepEqual(await queue(2), [], 'Completed rows are cleared too');
    assert.equal((await queue(3)).length, 1, 'Another clinic is unaffected by supplied clinic IDs');
    assert.equal(patients.length, 2, 'Patient records are preserved');
    assert.equal(visits, savedVisits, 'Saved visits are preserved');
    assert.deepEqual(await (await clear(1)).json(), { cleared: 0 }, 'Closing an empty queue succeeds');
    assert.equal((await request('/in-queue', 2, { patientId: 101 })).status, 201);
    assert.equal((await queue(2)).length, 1, 'Patients can queue again after closing');
    assert.deepEqual(await (await clear(1)).json(), { cleared: 1 }, 'Waiting rows are cleared too');
});

test('queue visit migration is repeatable', async () => {
    const migrate = require('../data/migrations/add-queue-visit-opened');
    let exists = false;
    let alters = 0;
    const db = { async query(sql) {
        if (sql.startsWith('SELECT')) return [exists ? [{ COLUMN_NAME: 'visit_opened_at' }] : []];
        assert.equal(sql, 'ALTER TABLE in_queue ADD COLUMN visit_opened_at DATETIME NULL');
        exists = true; alters++; return [[]];
    } };
    await migrate(db);
    await migrate(db);
    assert.equal(alters, 1);
});
