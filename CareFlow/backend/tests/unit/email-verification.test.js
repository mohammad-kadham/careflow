const assert = require('node:assert/strict');
const { test } = require('node:test');
const dbPath = require.resolve('../../data/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
const tokens = require('../../models/email-verification');
const verification = require('../../services/email-verification');
const rateLimit = require('../../middleware/rate-limit');
const migrate = require('../../data/migrations/add-email-verification');

function configure(t) {
    for (const [key, value] of Object.entries({ NODE_ENV: 'production', BREVO_API_KEY: 'test-only-api-key', BREVO_SENDER_EMAIL: 'sender@example.com', APP_URL: 'https://clinic.example' })) {
        const old = process.env[key]; process.env[key] = value;
        t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
    }
}

test('Brevo configuration rejects missing keys, SMTP keys, and unsafe origins', t => {
    configure(t);
    for (const [key, value] of [['BREVO_API_KEY', ''], ['BREVO_API_KEY', 'xsmtpsib-example'], ['BREVO_SENDER_EMAIL', 'invalid'], ['APP_URL', 'http://clinic.example'], ['APP_URL', 'https://user:pass@clinic.example'], ['APP_URL', 'https://clinic.example/?redirect=evil'], ['APP_URL', 'https://clinic.example/path'], ['APP_URL', 'javascript:alert(1)']]) {
        const before = process.env[key]; process.env[key] = value;
        assert.throws(() => verification.assertConfigured(), error => error.statusCode === 503 && !error.message.includes(value || 'test-only-api-key'));
        process.env[key] = before;
    }
    assert.doesNotThrow(() => verification.assertConfigured());
});

for (const failure of ['provider rejection', 'network failure', 'invalid provider response']) {
    test(`email ${failure} revokes only the attempted token and hides details`, async t => {
        configure(t);
        let reservedHash;
        t.mock.method(tokens, 'reserve', async (id, hash) => { assert.equal(id, 7); reservedHash = hash; return true; });
        const revoke = t.mock.method(tokens, 'revoke', async (id, hash) => { assert.equal(id, 7); assert.equal(hash, reservedHash); });
        t.mock.method(globalThis, 'fetch', async () => {
            if (failure === 'network failure') throw new Error('private-key-or-provider-details');
            return Response.json({ secret: 'private-key-or-provider-details' }, { status: failure === 'provider rejection' ? 500 : 201 });
        });
        await assert.rejects(verification.sendFor({ id: 7, email: 'test@example.com', name: 'Test' }), error => error.statusCode === 503 && !error.message.includes('private'));
        assert.equal(revoke.mock.callCount(), 1);
    });
}

test('cooldown prevents provider calls', async t => {
    configure(t);
    t.mock.method(tokens, 'reserve', async () => false);
    const send = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not send'); });
    assert.equal(await verification.sendFor({ id: 7 }), false);
    assert.equal(send.mock.callCount(), 0);
});

test('persistent reservation respects verified/missing users and cooldown and always releases', async t => {
    for (const scenario of ['missing', 'verified', 'legacy', 'cooldown', 'ready', 'failure']) {
        const calls = [];
        const connection = {
            async beginTransaction() { calls.push('begin'); },
            async query(sql) {
                if (sql.includes('FOR UPDATE')) return [scenario === 'missing' ? [] : [{ email_verification_required: scenario === 'legacy' ? 0 : 1, email_verified_at: scenario === 'verified' ? new Date() : null }]];
                if (sql.startsWith('SELECT')) return [[{ cooling_down: scenario === 'cooldown' ? 1 : 0 }]];
                calls.push('insert');
                if (scenario === 'failure') throw new Error('Database failure');
                return [{}];
            },
            async commit() { calls.push('commit'); },
            async rollback() { calls.push('rollback'); },
            release() { calls.push('release'); },
        };
        require.cache[dbPath].exports.getConnection = async () => connection;
        if (scenario === 'failure') {
            await assert.rejects(tokens.reserve(7, 'a'.repeat(64)), /Database failure/);
            assert.deepEqual(calls.slice(-2), ['rollback', 'release']);
        } else {
            assert.equal(await tokens.reserve(7, 'a'.repeat(64)), scenario === 'ready');
            assert.equal(calls.includes('insert'), scenario === 'ready');
            assert.deepEqual(calls.slice(-2), ['commit', 'release']);
        }
    }
});

test('verification migration is additive, repeatable, and preserves existing access', async () => {
    const columns = new Set(); const alters = [];
    const db = { async query(sql, params) {
        if (sql.startsWith('SELECT')) return [columns.has(params[0]) ? [{}] : []];
        if (sql.startsWith('ALTER')) { alters.push(sql); columns.add(sql.match(/ADD COLUMN (\w+)/)[1]); }
        else assert.match(sql, /^CREATE TABLE IF NOT EXISTS email_verifications/);
        return [{}];
    } };
    await migrate(db); await migrate(db);
    assert.equal(alters.length, 2);
    assert.match(alters[0], /email_verification_required.*DEFAULT 0/);
    assert.match(alters[1], /email_verified_at DATETIME NULL/);
});

test('verification migration propagates database failures', async () => {
    await assert.rejects(migrate({ query: async () => { throw new Error('unavailable'); } }), /unavailable/);
});

test('rate limit isolates clients, reports retry delay, and resets after expiry', t => {
    let now = 1000; t.mock.method(Date, 'now', () => now);
    const middleware = rateLimit({ limit: 2, windowMs: 10000 });
    function request(ip) {
        const result = { next: false, headers: {} };
        const res = { set(key, value) { result.headers[key] = value; }, status(code) { result.status = code; return this; }, json(body) { result.body = body; } };
        middleware({ ip }, res, () => { result.next = true; });
        return result;
    }
    assert.equal(request('client-a').next, true); assert.equal(request('client-a').next, true);
    const blocked = request('client-a'); assert.equal(blocked.status, 429); assert.equal(blocked.headers['Retry-After'], '10');
    assert.equal(request('client-b').next, true);
    now += 10000; assert.equal(request('client-a').next, true);
});
