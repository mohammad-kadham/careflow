const assert = require('node:assert/strict');
const { test } = require('node:test');
const dbPath = require.resolve('../data/db');
let calls = [];
let rejectInsert = false;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    async getConnection() {
        return {
            async beginTransaction() { calls.push('begin'); },
            async query(sql, params) {
                calls.push({ sql, params });
                if (sql.startsWith('INSERT INTO clinics')) return [{ insertId: 42 }];
                if (rejectInsert) {
                    const error = new Error('duplicate email');
                    error.code = 'ER_DUP_ENTRY';
                    throw error;
                }
                return [{ insertId: 7 }];
            },
            async commit() { calls.push('commit'); },
            async rollback() { calls.push('rollback'); },
            release() { calls.push('release'); },
        };
    },
} };
const User = require('../models/users');
const data = { name: 'Doctor', email: 'doctor@example.com', password: 'hashed', clinic_name: 'Clinic', phone: '07701234567', clinic_id: 999, subscription_required: 0, subscription_active: 1, subscription_plan: 'advanced' };

test('doctor signup creates the clinic and user in one transaction', async () => {
    calls = []; rejectInsert = false;
    const user = await User.createDoctor(data);
    assert.equal(user.clinic_id, 42);
    assert.equal(user.id, 7);
    assert.equal(user.subscription_required, 1);
    assert.equal(calls[1].sql, 'INSERT INTO clinics (name, subscription_required) VALUES (?, 1)');
    assert.equal(calls[0], 'begin');
    assert.deepEqual(calls[1].params, ['Clinic']);
    assert.equal(calls[2].params.at(-1), 42);
    assert.deepEqual(calls.slice(-2), ['commit', 'release']);
});

test('failed doctor signup rolls back the clinic and releases the connection', async () => {
    calls = []; rejectInsert = true;
    await assert.rejects(User.createDoctor(data), error => error.code === 'ER_DUP_ENTRY');
    assert.ok(!calls.includes('commit'));
    assert.deepEqual(calls.slice(-2), ['rollback', 'release']);
});
