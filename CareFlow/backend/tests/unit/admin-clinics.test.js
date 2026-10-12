const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const dbPath = require.resolve('../../data/db');
const pool = { query: async () => { throw new Error('Test database missing'); } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
const admin = require('../../models/admin');

// Execute the listing SELECT against temporary data. Only MySQL's date functions
// need adapters; filtering, joins, counts, LIKE escaping and pagination run as SQL.
function database(t) {
    const db = new DatabaseSync(':memory:');
    t.after(() => db.close());
    db.function('UTC_TIMESTAMP', () => '2026-10-12 00:00:00');
    db.function('DATE_FORMAT', (date, format) => {
        assert.equal(format, '%Y-%m-%dT%H:%i:%sZ');
        return date ? date.replace(' ', 'T') + 'Z' : null;
    });
    db.exec(`CREATE TABLE clinics (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT,
        subscription_required INTEGER, subscription_plan TEXT, subscription_revision INTEGER, subscription_expires_at TEXT);
        CREATE TABLE users (id INTEGER PRIMARY KEY, clinic_id INTEGER, role TEXT, name TEXT, email TEXT, phone TEXT);`);
    const insert = db.prepare('INSERT INTO clinics VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (let id = 1; id <= 27; id++) {
        insert.run(id, `Clinic ${id}`, '2026-10-01 10:30:00', id === 1 ? 0 : 1,
            id === 2 || id === 3 ? 'basic' : null, 0,
            id === 2 ? '2027-01-01 00:00:00' : id === 3 ? '2020-01-01 00:00:00' : null);
    }
    const user = db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)');
    user.run(1, 26, 'doctor', 'First Doctor', 'first@example.test', '07700000001');
    user.run(2, 26, 'doctor', 'Second Doctor', 'second@example.test', '07700000002');
    user.run(3, 26, 'staff', 'Clinic Staff', 'staff@example.test', '07700000003');
    user.run(4, 12, 'doctor', 'Doctor 100%_!', 'literal@example.test', null);
    user.run(5, 25, 'staff', 'Staff without doctor', 'staff-only@example.test', null);
    t.mock.method(pool, 'query', async (sql, values) => [db.prepare(sql).all(...values)]);
}

test('clinic directory includes every clinic once, across pages, regardless of accounts or subscription', async t => {
    database(t);
    const first = await admin.clinics({ q: '', page: 1 });
    const second = await admin.clinics({ q: '', page: 2 });
    assert.equal(first.rows.length, 25);
    assert.equal(first.hasMore, true);
    assert.equal(second.hasMore, false);
    const all = [...first.rows, ...second.rows];
    assert.deepEqual(all.map(row => row.id), Array.from({ length: 27 }, (_, index) => 27 - index));
    const orphan = all.find(row => row.id === 27);
    assert.equal(orphan.customerName, null);
    assert.equal(orphan.doctorCount, 0);
    assert.equal(orphan.staffCount, 0);
    assert.equal(orphan.createdAt, '2026-10-01T10:30:00Z');
    assert.equal(all.find(row => row.id === 25).staffCount, 1);
    const team = all.find(row => row.id === 26);
    assert.equal(team.customerName, 'First Doctor');
    assert.equal(team.phone, '07700000001');
    assert.equal(team.doctorCount, 2);
    assert.equal(team.staffCount, 1);
    assert.equal(all.find(row => row.id === 1).active, 1, 'Legacy access remains visible');
    assert.equal(all.find(row => row.id === 2).active, 1, 'Active subscriptions remain visible');
    assert.equal(all.find(row => row.id === 3).active, 0, 'Expired subscriptions remain visible');
    assert.equal(orphan.active, 0, 'Unpaid clinics remain visible');
    assert.deepEqual(await admin.clinics({ q: '', page: 3 }), { rows: [], hasMore: false });
});

test('clinic search matches any doctor contact, names and IDs while treating wildcard input literally', async t => {
    database(t);
    for (const q of ['Second Doctor', 'second@example.test', '07700000002', '26']) {
        assert.deepEqual((await admin.clinics({ q, page: 1 })).rows.map(row => row.id), [26], q);
    }
    assert.deepEqual((await admin.clinics({ q: 'Clinic 27', page: 1 })).rows.map(row => row.id), [27]);
    assert.deepEqual((await admin.clinics({ q: '100%_!', page: 1 })).rows.map(row => row.id), [12]);
    assert.deepEqual((await admin.clinics({ q: "' OR 1=1 --", page: 1 })).rows, []);
});
