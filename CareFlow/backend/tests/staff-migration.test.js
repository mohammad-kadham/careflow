const assert = require('node:assert/strict');
const { test } = require('node:test');
const migrate = require('../data/migrations/add-staff-accounts');

test('staff migration is additive, narrows roles, and safely repeats', async () => {
    const state = { owner: false, index: false, foreign: false, role: false };
    const updates = [];
    const db = { async query(sql) {
        if (sql === 'SHOW COLUMNS FROM users') return [[
            { Field: 'role', Type: state.role ? "enum('doctor','staff')" : "enum('admin','doctor','staff')", Null: state.role ? 'NO' : 'YES', Default: state.role ? 'doctor' : 'staff' },
            ...(state.owner ? [{ Field: 'doctor_id' }] : []),
        ]];
        if (sql === 'SHOW INDEX FROM users') return [state.index ? [{ Key_name: 'uq_users_staff_doctor' }] : []];
        if (sql.includes('information_schema.TABLE_CONSTRAINTS')) return [state.foreign ? [{ CONSTRAINT_NAME: 'fk_users_doctor' }] : []];
        updates.push(sql);
        assert.ok(!/^(DROP|DELETE|TRUNCATE)\b/.test(sql));
        if (sql.includes('ADD COLUMN doctor_id')) state.owner = true;
        if (sql.includes('ADD UNIQUE KEY')) state.index = true;
        if (sql.includes('ADD CONSTRAINT')) state.foreign = true;
        if (sql.includes('MODIFY COLUMN role')) state.role = true;
        return [[]];
    } };
    await migrate(db);
    assert.deepEqual(state, { owner: true, index: true, foreign: true, role: true });
    assert.ok(updates.some(sql => sql.includes('UNIQUE KEY uq_users_staff_doctor (doctor_id)')));
    const count = updates.length;
    await migrate(db);
    assert.equal(updates.length, count);
});
