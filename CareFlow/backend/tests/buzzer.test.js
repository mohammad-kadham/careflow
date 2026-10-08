const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'buzzer-test-secret-'.repeat(4);
process.env.NODE_ENV = 'development';
const users = [
    { id: 1, role: 'doctor', clinic_id: 10 },
    { id: 2, role: 'staff', clinic_id: 10, doctor_id: 1 },
    { id: 3, role: 'doctor', clinic_id: 20 },
    { id: 4, role: 'staff', clinic_id: 20, doctor_id: 3 },
    { id: 5, role: 'doctor', clinic_id: 30 },
];
const entryStates = new Map();
const dbPath = require.resolve('../data/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    async query(sql, params) {
        if (sql.includes('SELECT paused FROM clinic_entry_control')) {
            const paused = entryStates.get(params[0] + ':' + params[1]);
            return [paused === undefined ? [] : [{ paused }]];
        }
        if (sql.includes('INSERT INTO clinic_entry_control')) {
            entryStates.set(params[0] + ':' + params[1], params[2]);
            return [{ affectedRows: 1 }];
        }
        if (sql.includes('WHERE u.id')) return [users.filter(user => user.id === params[0]).map(user => ({ ...user, subscription_active: 1 }))];
        if (sql.includes('WHERE u.doctor_id')) return [users.filter(user => user.doctor_id === params[0] && user.clinic_id === params[1])];
        throw new Error('Unexpected database query');
    },
} };
const app = require('../server');
const auth = require('../config/auth');

test('clinic buzzer delivery and authorization', async t => {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const base = 'http://127.0.0.1:' + server.address().port;
    const request = (id, body, path = '/user/buzzer') => fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(id ? { Cookie: auth.cookieName + '=' + jwt.sign({ userId: id }, auth.secret, {
                algorithm: 'HS256', issuer: auth.issuer, audience: auth.audience, expiresIn: 3600,
            }) } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    await t.test('anonymous requests, staff sends, and doctor reads are rejected', async () => {
        assert.equal((await request(null)).status, 401);
        assert.equal((await request(null, {})).status, 401);
        assert.equal((await request(2, {})).status, 403);
        assert.equal((await request(1)).status, 403);
        assert.deepEqual(await (await request(2)).json(), { event: null, paused: false });
    });
    let eventId;
    await t.test('only linked staff receive the call; client recipient and clinic are ignored', async () => {
        const response = await request(1, { staffId: 4, clinic_id: 20 });
        assert.equal(response.status, 202);
        eventId = (await response.json()).eventId;
        assert.ok(eventId);
        assert.equal((await (await request(2)).json()).event.id, eventId);
        assert.deepEqual(await (await request(4)).json(), { event: null, paused: false });
        assert.equal((await (await request(2)).json()).event.id, eventId, 'Polling preserves a stable event ID for deduplication');
    });
    await t.test('rapid calls are rate limited without replacing the signal', async () => {
        const response = await request(1, {});
        assert.equal(response.status, 429);
        assert.equal(response.headers.get('retry-after'), '3');
        assert.equal((await (await request(2)).json()).event.id, eventId);
    });
    await t.test('missing linked staff gives a useful error', async () => {
        assert.equal((await request(5, {})).status, 404);
    });
    await t.test('changing clinic or doctor assignment prevents receiving an old call', async () => {
        users[1].clinic_id = 20;
        assert.deepEqual(await (await request(2)).json(), { event: null, paused: false });
        users[1].clinic_id = 10;
        users[1].doctor_id = 3;
        assert.deepEqual(await (await request(2)).json(), { event: null, paused: false });
        users[1].doctor_id = 1;
    });
    await t.test('expired calls are discarded', async () => {
        const now = Date.now;
        Date.now = () => now() + 31000;
        try {
            assert.deepEqual(await (await request(2)).json(), { event: null, paused: false });
            assert.equal((await request(1, {})).status, 202);
        } finally { Date.now = now; }
    });

    await t.test('entry pause is doctor-only and requires a boolean', async () => {
        assert.equal((await request(null, { paused: true }, '/user/entry-state')).status, 401);
        assert.equal((await request(2, { paused: true }, '/user/entry-state')).status, 403);
        for (const paused of ['true', 1, null, undefined]) {
            assert.equal((await request(1, { paused }, '/user/entry-state')).status, 400);
        }
    });
    await t.test('pause stays scoped to the doctor and clinic, ignoring client ownership', async () => {
        const response = await request(1, { paused: true, clinic_id: 20, doctor_id: 3 }, '/user/entry-state');
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { paused: true });
        assert.equal((await (await request(2)).json()).paused, true);
        assert.equal((await (await request(4)).json()).paused, false);
        assert.equal((await (await request(1, undefined, '/user/entry-state')).json()).paused, true);
        assert.equal((await (await request(3, undefined, '/user/entry-state')).json()).paused, false);
    });
    await t.test('pause persists beyond buzzer expiry and is idempotent', async () => {
        const now = Date.now;
        Date.now = () => now() + 60000;
        try {
            assert.equal((await (await request(2)).json()).paused, true);
            assert.equal((await request(1, { paused: true }, '/user/entry-state')).status, 200);
            assert.equal((await (await request(2)).json()).paused, true);
        } finally { Date.now = now; }
    });
    await t.test('staff reassignment cannot expose another doctor pause state', async () => {
        users[1].doctor_id = 3;
        assert.equal((await (await request(2)).json()).paused, false);
        users[1].doctor_id = 1;
        users[1].clinic_id = 20;
        assert.equal((await (await request(2)).json()).paused, false);
        users[1].clinic_id = 10;
    });
    await t.test('resume clears the staff pause notice', async () => {
        const response = await request(1, { paused: false }, '/user/entry-state');
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { paused: false });
        assert.equal((await (await request(2)).json()).paused, false);
    });

    const status = async id => (await (await request(id, undefined, '/user/entry-state')).json()).staff;
    const clientA = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const clientB = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
    const heartbeat = (id, soundEnabled, receivedEventId = null, clientId = clientA) =>
        request(id, { clientId, soundEnabled, receivedEventId }, '/user/buzzer/poll');

    await t.test('presence and acknowledgments require staff authentication and valid data', async () => {
        assert.equal((await heartbeat(null, true)).status, 401);
        assert.equal((await heartbeat(3, true)).status, 403);
        assert.equal((await request(4, {}, '/user/buzzer/poll')).status, 400);
        assert.equal((await heartbeat(4, 'true')).status, 400);
        assert.equal((await heartbeat(4, true, 'invalid')).status, 400);
        assert.equal((await request(null, {}, '/user/buzzer/ack')).status, 401);
        assert.equal((await request(3, {}, '/user/buzzer/ack')).status, 403);
        assert.equal((await request(4, {}, '/user/buzzer/ack')).status, 400);
    });
    await t.test('status distinguishes missing staff, offline, connected, and sound across tabs', async () => {
        assert.deepEqual(await status(5), { linked: false, online: false, soundEnabled: false, alert: null });
        assert.equal((await status(3)).online, false);
        await heartbeat(4, false);
        assert.equal((await status(3)).online, true);
        assert.equal((await status(3)).soundEnabled, false);
        await heartbeat(4, true);
        await heartbeat(4, false, null, clientB);
        assert.equal((await status(3)).soundEnabled, true);
        assert.equal((await status(1)).online, false, 'Another clinic cannot inherit presence');
        const now = Date.now;
        Date.now = () => now() + 16000;
        try {
            assert.equal((await status(3)).online, false);
            assert.equal((await status(3)).soundEnabled, false);
        } finally { Date.now = now; }
    });
    let trackedId;
    await t.test('receipt requires the browser to confirm the exact event it received', async () => {
        trackedId = (await (await request(3, {})).json()).eventId;
        assert.equal((await status(3)).alert.state, 'pending');
        const poll = await (await heartbeat(4, true)).json();
        assert.equal(poll.event.id, trackedId);
        assert.equal((await status(3)).alert.state, 'pending');
        await heartbeat(2, true, trackedId);
        assert.equal((await status(3)).alert.state, 'pending');
        await heartbeat(4, true, trackedId);
        assert.equal((await status(3)).alert.state, 'received');
    });
    await t.test('only the intended staff can acknowledge; receipt remains distinct from acknowledgment', async () => {
        assert.equal((await request(2, { eventId: trackedId }, '/user/buzzer/ack')).status, 404);
        assert.equal((await status(3)).alert.state, 'received');
        assert.equal((await request(4, { eventId: trackedId }, '/user/buzzer/ack')).status, 200);
        assert.equal((await status(3)).alert.state, 'acknowledged');
        assert.equal((await request(4, { eventId: trackedId }, '/user/buzzer/ack')).status, 200);
        assert.equal((await (await heartbeat(4, true)).json()).event.acknowledged, true);
    });
    await t.test('an older acknowledgment cannot acknowledge a newer alert; undelivered calls expire', async () => {
        const now = Date.now;
        Date.now = () => now() + 4000;
        try {
            const response = await request(3, {});
            assert.equal(response.status, 202);
            assert.equal((await request(4, { eventId: trackedId }, '/user/buzzer/ack')).status, 404);
            assert.equal((await status(3)).alert.state, 'pending');
            Date.now = () => now() + 35000;
            assert.equal((await status(3)).alert.state, 'expired');
            assert.equal((await (await heartbeat(4, false)).json()).event, null);
        } finally { Date.now = now; }
    });
});
