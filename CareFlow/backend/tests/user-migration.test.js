const assert = require('node:assert/strict');
const { test } = require('node:test');
const migrate = require('../data/migrations/add-user-signup-fields');

test('migration adds only missing columns and safely runs again', async () => {
    const columns = new Set(['id', 'name', 'email', 'password', 'role']);
    const alters = [];
    const db = {
        async query(sql) {
            if (sql === 'SHOW COLUMNS FROM users') return [[...columns].map(Field => ({ Field }))];
            alters.push(sql);
            const match = sql.match(/^ALTER TABLE users ADD COLUMN (clinic_name|phone) VARCHAR\((150|40)\) NULL$/);
            assert.ok(match, 'Only additive schema changes are allowed');
            columns.add(match[1]);
            return [{}];
        },
    };
    await migrate(db);
    assert.equal(alters.length, 2);
    assert.ok(columns.has('clinic_name'));
    assert.ok(columns.has('phone'));
    await migrate(db);
    assert.equal(alters.length, 2);
});

test('partially applied migration adds only the remaining field', async () => {
    const alters = [];
    await migrate({
        async query(sql) {
            if (sql === 'SHOW COLUMNS FROM users') return [[{ Field: 'clinic_name' }]];
            alters.push(sql);
        },
    });
    assert.deepEqual(alters, ['ALTER TABLE users ADD COLUMN phone VARCHAR(40) NULL']);
});

test('migration propagates real database errors', async () => {
    const failure = new Error('database unavailable');
    await assert.rejects(migrate({ query: async () => { throw failure; } }), error => error === failure);
});
