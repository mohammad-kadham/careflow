const assert = require('node:assert/strict');
const { test } = require('node:test');
const dbPath = require.resolve('../../data/db');
const pool = { query: async () => {}, getConnection: async () => {} };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
const tokens = require('../../models/password-reset');
const service = require('../../services/password-reset');

function database(t, { failDelete = false } = {}) {
    let now = Date.UTC(2026, 9, 10), user = { id: 7, password: 'original-hash', auth_version: 0 }, token;
    let sessions = [{ user_id: 7 }, { user_id: 8 }], releases = 0, rollbacks = 0, queue = Promise.resolve();
    t.mock.method(pool, 'query', async (sql, params) => {
        if (sql.startsWith('SELECT user_id')) return [token?.token_hash === params[0] ? [{ user_id: 7 }] : []];
        if (sql.startsWith('UPDATE password_resets')) {
            if (params[0] === 7 && token?.token_hash === params[1]) Object.assign(token, { token_hash: null, expires: null });
            return [{}];
        }
        throw new Error('Unexpected query: ' + sql);
    });
    t.mock.method(pool, 'getConnection', async () => {
        let backup, unlock;
        return {
            async beginTransaction() {
                const previous = queue;
                queue = new Promise(resolve => { unlock = resolve; });
                await previous; backup = structuredClone({ user, token, sessions });
            },
            async commit() {},
            async rollback() { ({ user, token, sessions } = backup); rollbacks++; },
            release() { releases++; unlock(); },
            async query(sql, params) {
                if (sql.startsWith('SELECT auth_version')) return [user ? [{ auth_version: user.auth_version }] : []];
                if (sql.startsWith('SELECT (sent_at')) return [token ? [{ cooling_down: token.sent > now - 60000 ? 1 : 0 }] : []];
                if (sql.startsWith('INSERT INTO password_resets')) {
                    assert.match(sql, /INTERVAL 30 MINUTE/);
                    token = { token_hash: params[1], auth_version: params[2], expires: now + 1800000, sent: now }; return [{}];
                }
                if (sql.startsWith('SELECT token_hash')) return [token ? [{ ...token, valid: token.expires > now ? 1 : 0 }] : []];
                if (sql.startsWith('UPDATE users')) { user.password = params[0]; user.auth_version++; return [{}]; }
                if (sql.startsWith('UPDATE password_resets')) { token.token_hash = null; token.expires = null; return [{}]; }
                if (sql.startsWith('DELETE FROM admin_sessions')) {
                    if (failDelete) throw new Error('Session storage unavailable');
                    sessions = sessions.filter(row => row.user_id !== params[0]); return [{}];
                }
                throw new Error('Unexpected query: ' + sql);
            },
        };
    });
    return { state: () => ({ user, token, sessions, releases, rollbacks }), advance: ms => { now += ms; } };
}

test('reset requests preserve the password, enforce persistent cooldown and replace older links', async t => {
    const { state, advance } = database(t);
    assert.equal(await tokens.reserve(7, 'first-hash', 0), true);
    assert.equal(state().user.password, 'original-hash');
    assert.equal(await tokens.reserve(7, 'second-hash', 0), false);
    advance(60001);
    assert.equal(await tokens.reserve(7, 'second-hash', 0), true);
    assert.equal(await tokens.consume('first-hash', 'new-hash'), false);
    await tokens.revoke(7, 'first-hash');
    assert.equal(state().token.token_hash, 'second-hash', 'Failed older delivery cannot revoke a newer token');
    await tokens.revoke(7, 'second-hash');
    assert.equal(await tokens.consume('second-hash', 'new-hash'), false);
});
test('expired and stale-version tokens cannot change a password', async t => {
    const { state, advance } = database(t);
    await tokens.reserve(7, 'hash', 0); advance(1800000);
    assert.equal(await tokens.consume('hash', 'new-hash'), false);
    assert.equal(state().user.password, 'original-hash');
    await tokens.reserve(7, 'fresh-hash', 0); state().user.auth_version++;
    assert.equal(await tokens.consume('fresh-hash', 'new-hash'), false);
    advance(60001);
    assert.equal(await tokens.reserve(7, 'delayed-send', 0), false, 'Delayed request before password change cannot issue a new valid link');
});
test('concurrent reset submissions change the password once and invalidate only that user sessions', async t => {
    const { state } = database(t);
    await tokens.reserve(7, 'hash', 0);
    const results = await Promise.all([tokens.consume('hash', 'new-hash'), tokens.consume('hash', 'other-hash')]);
    assert.deepEqual(results, [true, false]);
    assert.equal(state().user.password, 'new-hash'); assert.equal(state().user.auth_version, 1);
    assert.deepEqual(state().sessions, [{ user_id: 8 }]); assert.equal(state().token.token_hash, null);
    assert.equal(await tokens.consume('hash', 'again'), false);
    assert.equal(state().releases, 3);
});
test('a failed reset rolls back the password, token and session revocation together', async t => {
    const { state } = database(t, { failDelete: true });
    await tokens.reserve(7, 'hash', 0);
    await assert.rejects(tokens.consume('hash', 'new-hash'), /Session storage unavailable/);
    assert.equal(state().user.password, 'original-hash'); assert.equal(state().user.auth_version, 0);
    assert.equal(state().token.token_hash, 'hash'); assert.equal(state().sessions.length, 2);
    assert.equal(state().rollbacks, 1); assert.equal(state().releases, 2);
});
test('reset migration is additive, repeatable and preserves existing sessions before a reset', async () => {
    const migrate = require('../../data/migrations/add-password-reset');
    const columns = new Set(), changes = [];
    const db = { async query(sql, params) {
        if (sql.startsWith('SELECT')) return [columns.has(params[0]) ? [{}] : []];
        if (sql.startsWith('ALTER')) { columns.add(sql.split(' ')[2]); changes.push(sql); }
        else { assert.match(sql, /CREATE TABLE IF NOT EXISTS password_resets/); assert.match(sql, /token_hash.*NULL UNIQUE/); }
        return [{}];
    } };
    await migrate(db); await migrate(db);
    assert.equal(changes.length, 2);
    assert.ok(changes.every(sql => sql.endsWith('auth_version INT UNSIGNED NOT NULL DEFAULT 0')));
    await assert.rejects(migrate({ query: async () => { throw new Error('offline'); } }), /offline/);
});

function configure(t) {
    for (const [key, value] of Object.entries({ NODE_ENV: 'production', BREVO_API_KEY: 'test-only-key', BREVO_SENDER_EMAIL: 'sender@example.com', APP_URL: 'https://clinic.example' })) {
        const previous = process.env[key]; process.env[key] = value;
        t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
    }
}
test('reset email contains an escaped single-use link and only its hash is persisted', async t => {
    configure(t);
    let storedHash, email;
    t.mock.method(tokens, 'reserve', async (id, hash, version) => { assert.equal(id, 7); assert.equal(version, 3); storedHash = hash; return true; });
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'https://api.brevo.com/v3/smtp/email'); assert.equal(options.redirect, 'error');
        email = JSON.parse(options.body); return Response.json({ messageId: 'test-message' }, { status: 201 });
    });
    assert.equal(await service.sendFor({ id: 7, email: 'user@example.com', name: '<img onerror="bad">', auth_version: 3 }), true);
    const token = email.htmlContent.match(/reset-password#token=([a-f0-9]{64})/)[1];
    assert.equal(storedHash, service.hashToken(token)); assert.notEqual(storedHash, token);
    assert.match(email.htmlContent, /https:\/\/clinic.example\/reset-password#token=/);
    assert.match(email.htmlContent, /&lt;img/); assert.doesNotMatch(email.htmlContent, /<img/);
    assert.deepEqual(email.tags, ['password-reset']);
});
for (const failure of ['network', 'rejection', 'bad response']) {
    test(`reset email ${failure} revokes the attempted token without exposing provider details`, async t => {
        configure(t); let hash;
        t.mock.method(tokens, 'reserve', async (id, value) => { hash = value; return true; });
        const revoke = t.mock.method(tokens, 'revoke', async (id, value) => { assert.equal(id, 7); assert.equal(value, hash); });
        t.mock.method(globalThis, 'fetch', async () => {
            if (failure === 'network') throw new Error('private-provider-detail');
            return Response.json({ error: 'private-provider-detail' }, { status: failure === 'rejection' ? 401 : 201 });
        });
        await assert.rejects(service.sendFor({ id: 7, email: 'user@example.com', name: 'Test' }), error => error.statusCode === 503 && !error.message.includes('private'));
        assert.equal(revoke.mock.callCount(), 1);
    });
}
test('reset email cooldown does not call Brevo', async t => {
    configure(t); t.mock.method(tokens, 'reserve', async () => false);
    const send = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected email'); });
    assert.equal(await service.sendFor({ id: 7 }), false); assert.equal(send.mock.callCount(), 0);
});
