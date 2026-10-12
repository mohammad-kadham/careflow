const assert = require('node:assert/strict');
const { test } = require('node:test');
const dbPath = require.resolve('../../data/db');
const db = { query: async () => { throw new Error('Test query missing'); } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const promotions = require('../../models/promotions');
const consent = require('../../config/promotion-consent.json');
const migrate = require('../../data/migrations/add-promotion-contacts');

test('contact insert binds data, records server consent, and never overwrites a contact on retry', async t => {
    const calls = [];
    t.mock.method(db, 'query', async (sql, values) => { calls.push({ sql, values }); return [{ affectedRows: 1 }]; });
    await promotions.subscribe({ email: 'person@example.com', phone: '+9647701234567', source: 'forged' });
    assert.deepEqual(calls[0].values, ['person@example.com', '+9647701234567', consent.version, consent.text]);
    assert.match(calls[0].sql, /'homepage', UTC_TIMESTAMP\(\)/);
    assert.match(calls[0].sql, /ON DUPLICATE KEY UPDATE id = id$/);
    assert.doesNotMatch(calls[0].sql, /person@example|forged/);
});

test('promotion lists page safely and escape literal searches', async t => {
    t.mock.method(db, 'query', async (sql, values) => {
        assert.deepEqual(values, ['%100!%!_!!%', '%100!%!_!!%', 25]);
        assert.match(sql, /ORDER BY id DESC LIMIT 26 OFFSET \?/);
        return [Array.from({ length: 26 }, (_, id) => ({ id }))];
    });
    const result = await promotions.list({ q: '100%_!', page: 2 });
    assert.equal(result.rows.length, 25);
    assert.equal(result.hasMore, true);
});

test('promotion migration is additive and deduplicates email/phone pairs', async () => {
    const queries = [];
    const database = { query: async sql => queries.push(sql) };
    await migrate(database); await migrate(database);
    assert.equal(queries.length, 2);
    assert.equal(queries[0], queries[1]);
    assert.match(queries[0], /CREATE TABLE IF NOT EXISTS promotion_contacts/);
    assert.match(queries[0], /UNIQUE KEY uq_promotion_contact \(email, phone\)/);
    assert.doesNotMatch(queries[0], /DROP|DELETE|ALTER TABLE users/);
});
