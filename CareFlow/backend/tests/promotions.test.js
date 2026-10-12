const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
process.env.JWT_SECRET = 'promotion-test-secret-'.repeat(4);
const modelPath = require.resolve('../models/promotions');
const submissions = [];
let fail = false;
require.cache[modelPath] = { id: modelPath, filename: modelPath, loaded: true, exports: {
    subscribe: async values => { if (fail) throw new Error('PRIVATE-DATABASE-DETAILS'); submissions.push(values); },
    list: async () => { throw new Error('Public requests cannot list contacts'); },
} };
const app = require('../server');

test('public promotion signup validates opt-in, normalizes contacts and protects collected data', async t => {
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const base = `http://127.0.0.1:${server.address().port}`;
    let client = 1;
    const post = (body, headers = {}) => fetch(base + '/promotions', { method: 'POST', headers: {
        'Content-Type': 'application/json', 'X-Forwarded-For': `192.0.2.${client++}`, ...headers,
    }, body: JSON.stringify(body) });
    const valid = { email: ' Person@Example.com ', phone: '٠٧٧٠ ١٢٣ ٤٥٦٧', consent: true };
    const first = await post({ ...valid, source: 'admin', consentVersion: 'forged', createdAt: '2000-01-01' });
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await first.json(), { ok: true });
    assert.deepEqual(submissions[0], { email: 'person@example.com', phone: '+9647701234567' });
    for (const phone of ['00964 7701234567', '+964 (770) 123-4567', '۹۶۴۷۷۰۱۲۳۴۵۶۷']) {
        const retry = await post({ ...valid, phone });
        assert.equal(retry.status, 200);
        assert.deepEqual(await retry.json(), { ok: true });
        assert.equal(submissions.at(-1).phone, '+9647701234567');
    }
    const before = submissions.length;
    for (const input of [null, {}, { ...valid, consent: false }, { ...valid, consent: 'true' },
        { ...valid, email: 'invalid' }, { ...valid, email: ['a@example.com'] }, { ...valid, email: 'x'.repeat(255) },
        { ...valid, phone: '123' }, { ...valid, phone: '0770hello1234567' }, { ...valid, phone: {} },
        { ...valid, phone: '+'.repeat(50) }, { ...valid, phone: '+1234567890123456' }]) {
        assert.equal((await post(input)).status, 400);
    }
    assert.equal(submissions.length, before);
    assert.equal((await post(valid, { Origin: 'https://untrusted.example' })).status, 403);
    assert.equal((await post(valid, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await fetch(base + '/admin/promotions')).status, 401);
    assert.equal((await fetch(base + '/promotions')).status, 401);
    fail = true;
    const failed = await post(valid);
    assert.equal(failed.status, 500);
    assert.doesNotMatch(await failed.text(), /PRIVATE-DATABASE|person@example/);
    fail = false;
    for (let index = 0; index < 5; index++) assert.equal((await post(valid, { 'X-Forwarded-For': '198.51.100.1' })).status, 200);
    const limited = await post(valid, { 'X-Forwarded-For': '198.51.100.1' });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
});
