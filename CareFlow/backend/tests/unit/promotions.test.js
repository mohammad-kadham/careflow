const assert = require('node:assert/strict');
const { test } = require('node:test');
const dbPath = require.resolve('../../data/db');
const db = { query: async () => { throw new Error('Test query missing'); } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const promotions = require('../../models/promotions');
const consent = require('../../config/promotion-consent.json');
const migrate = require('../../data/migrations/add-promotion-contacts');
const promotionCsv = require('../../utils/promotion-csv');

test('export returns every matching contact without pagination and binds literal searches', async t => {
    const contacts = Array.from({ length: 60 }, (_, id) => ({ email: `person${id}@example.test` }));
    const calls = [];
    t.mock.method(db, 'query', async (sql, values) => { calls.push({ sql, values }); return [contacts]; });
    assert.equal((await promotions.exportContacts({ q: '' })).length, 60);
    assert.deepEqual(calls[0].values, []);
    assert.doesNotMatch(calls[0].sql, /LIMIT|OFFSET|WHERE/);
    assert.equal((await promotions.exportContacts({ q: '100%_!' })).length, 60);
    assert.deepEqual(calls[1].values, ['%100!%!_!!%', '%100!%!_!!%']);
    assert.match(calls[1].sql, /WHERE email LIKE \? ESCAPE '!' OR phone LIKE \? ESCAPE '!'/);
});

test('CSV supports Arabic, quotes and newlines while protecting phones and formula-like values', () => {
    const csv = promotionCsv([
        { email: 'شخص@example.test', phone: '+9647701234567', createdAt: '2026-10-12T00:00:00Z' },
        { email: '=HYPERLINK("evil","click")', phone: '07701234567', createdAt: '' },
        { email: 'line,one\r\nline"two', phone: '', createdAt: '' },
        ...['+cmd', '-cmd', '@cmd', '  =cmd', '\tcmd', '\rcmd', '\ncmd'].map(email => ({ email })),
    ]);
    assert.ok(csv.startsWith('\uFEFF"البريد الإلكتروني"'));
    assert.ok(csv.includes('"شخص@example.test","\'+9647701234567","2026-10-12T00:00:00Z"\r\n'));
    assert.ok(csv.includes('"\'=HYPERLINK(""evil"",""click"")","\'07701234567"'));
    assert.ok(csv.includes('"line,one\r\nline""two"'));
    for (const value of ['+cmd', '-cmd', '@cmd', '  =cmd', '\tcmd', '\rcmd', '\ncmd']) assert.ok(csv.includes('"\'' + value + '"'));
    assert.equal(promotionCsv([]).split('\r\n').length, 2, 'Empty exports contain only the header');
});

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
