const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomUUID } = require('node:crypto');
const dbPath = require.resolve('../../data/db');
const pool = { query: async () => { throw new Error('Missing query stub'); }, getConnection: async () => { throw new Error('Missing connection stub'); } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
const trials = require('../../models/trial-codes');

function database(t, { active = 0, required = 1, failWrite = false } = {}) {
    const now = Date.UTC(2026, 9, 10, 12);
    let clinics = [10, 20].map(id => ({ id, active, subscription_required: required, revision: 0, expiresAt: null }));
    let codes = [{ id: 1, code: 'SHARED', plan: 'advanced', disabled_at: null }], redemptions = [];
    let commits = 0, rollbacks = 0, releases = 0, queue = Promise.resolve();
    t.mock.method(pool, 'getConnection', async () => {
        let backup, unlock;
        return {
            async beginTransaction() {
                const previous = queue;
                queue = new Promise(resolve => { unlock = resolve; });
                await previous;
                backup = structuredClone({ clinics, codes, redemptions });
            },
            async commit() { commits++; },
            async rollback() { ({ clinics, codes, redemptions } = backup); rollbacks++; },
            release() { releases++; unlock(); },
            async query(sql, params) {
                if (sql.startsWith('SELECT') && sql.includes('FROM clinics WHERE')) { assert.match(sql, /FOR UPDATE/); return [clinics.filter(row => row.id === params[0])]; }
                if (sql.includes('WHERE code = ?')) { assert.match(sql, /AND id = 1 LOCK IN SHARE MODE/); return [codes.filter(row => row.code === params[0])]; }
                if (sql.startsWith('SELECT clinic_id FROM trial_redemptions')) return [redemptions.filter(row => row.clinic_id === params[0])];
                if (sql.startsWith('UPDATE clinics')) {
                    assert.match(sql, /DATE_ADD\(UTC_TIMESTAMP\(\), INTERVAL 10 DAY\)/);
                    const clinic = clinics.find(row => row.id === params[1]);
                    Object.assign(clinic, { plan: params[0], active: 1, expiresAt: now + 10 * 86400000, revision: clinic.revision + 1 });
                    return [{ affectedRows: 1 }];
                }
                if (sql.startsWith('INSERT INTO trial_redemptions')) {
                    if (failWrite) throw new Error('Storage failure');
                    if (redemptions.some(row => row.clinic_id === params[2])) throw Object.assign(new Error('Duplicate'), { code: 'ER_DUP_ENTRY' });
                    redemptions.push({ code_id: params[0], clinic_id: params[2], redeemed_by: params[1], expiresAt: clinics.find(row => row.id === params[2]).expiresAt });
                    return [{ affectedRows: 1 }];
                }
                throw new Error('Unexpected SQL: ' + sql);
            },
        };
    });
    return () => ({ clinics, codes, redemptions, commits, rollbacks, releases, now });
}

test('a code grants exactly 10 days on its stored plan and retries never extend it', async t => {
    const state = database(t);
    assert.equal((await trials.redeem('SHARED', 10, 7)).replayed, false);
    assert.equal(state().clinics[0].plan, 'advanced');
    assert.equal(state().clinics[0].expiresAt - state().now, 10 * 86400000);
    assert.equal(state().redemptions[0].redeemed_by, 7);
    assert.equal((await trials.redeem('SHARED', 10, 7)).replayed, true);
    assert.equal(state().clinics[0].revision, 1);
    state().clinics[0].active = 0;
    assert.equal((await trials.redeem('SHARED', 10, 7)).replayed, true);
    assert.equal(state().clinics[0].active, 0, 'Retry cannot restore an expired/revoked trial');
    assert.equal(state().redemptions.length, 1);
});
test('different clinics can redeem the same shared code for their own ten-day trials', async t => {
    const state = database(t);
    const results = await Promise.all([trials.redeem('SHARED', 10, 7), trials.redeem('SHARED', 20, 8)]);
    assert.ok(results.every(result => result.replayed === false));
    assert.equal(state().clinics.filter(clinic => clinic.active).length, 2);
    assert.deepEqual(state().redemptions.map(row => row.clinic_id), [10, 20]);
    assert.equal(state().commits, 2); assert.equal(state().rollbacks, 0); assert.equal(state().releases, 2);
});
test('concurrent submissions by the same clinic grant only one trial', async t => {
    const state = database(t);
    const results = await Promise.all([trials.redeem('SHARED', 10, 7), trials.redeem('SHARED', 10, 7)]);
    assert.deepEqual(results.map(result => result.replayed), [false, true]);
    assert.equal(state().redemptions.length, 1);
    assert.equal(state().clinics[0].revision, 1);
});
test('invalid and disabled codes do not grant access', async t => {
    const state = database(t);
    state().codes[0].disabled_at = '2026-10-10';
    for (const code of ['MISSING', 'SHARED']) await assert.rejects(trials.redeem(code, 10, 7), error => error.statusCode === 400);
    assert.equal(state().clinics[0].revision, 0);
});
test('a trial cannot shorten paid access or replace unlimited legacy access', async t => {
    for (const options of [{ active: 1 }, { required: 0 }]) {
        const state = database(t, options);
        await assert.rejects(trials.redeem('SHARED', 10, 7), error => error.statusCode === 409);
        assert.equal(state().clinics[0].revision, 0);
        assert.equal(state().redemptions.length, 0);
    }
});
test('failed code consumption rolls back subscription activation', async t => {
    const state = database(t, { failWrite: true });
    await assert.rejects(trials.redeem('SHARED', 10, 7), /Storage failure/);
    assert.equal(state().clinics[0].active, 0); assert.equal(state().clinics[0].revision, 0);
    assert.equal(state().redemptions.length, 0); assert.equal(state().releases, 1);
});
test('only one shared code can be generated, with safe retries and concurrent creation', async t => {
    const rows = [];
    t.mock.method(pool, 'query', async (sql, params) => {
        if (sql.startsWith('INSERT')) {
            assert.match(sql, /VALUES \(1, /);
            if (rows.length) throw Object.assign(new Error('Duplicate'), { code: 'ER_DUP_ENTRY' });
            rows.push({ id: 1, code: params[0], plan: params[1], request_id: params[2], created_by: params[3] });
            return [{ affectedRows: 1 }];
        }
        return [rows];
    });
    const input = { plan: 'basic', requestId: randomUUID() };
    const results = await Promise.allSettled([trials.create(input, 1), trials.create({ ...input, requestId: randomUUID() }, 1)]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
    const first = results[0].value;
    assert.match(first.code, /^CF-(?:[A-F0-9]{6}-){3}[A-F0-9]{6}$/);
    assert.deepEqual(await trials.create(input, 1), first);
    await assert.rejects(trials.create({ ...input, requestId: randomUUID() }, 1), error => error.statusCode === 409);
    await assert.rejects(trials.create(input, 2), error => error.statusCode === 409);
    await assert.rejects(trials.create({ ...input, plan: 'advanced' }, 1), error => error.statusCode === 409);
    assert.equal(rows.length, 1);
});
test('migration is repeatable and enforces one shared code and one redemption per clinic', async () => {
    const statements = [];
    const migrate = require('../../data/migrations/add-trial-codes');
    const db = { query: async sql => statements.push(sql) };
    await migrate(db); await migrate(db);
    assert.equal(statements[0], statements[2]); assert.equal(statements[1], statements[3]);
    assert.match(statements[0], /CREATE TABLE IF NOT EXISTS trial_codes/);
    assert.match(statements[0], /CHECK \(id = 1\)/);
    assert.match(statements[1], /CREATE TABLE IF NOT EXISTS trial_redemptions/);
    assert.match(statements[1], /clinic_id INT PRIMARY KEY/);
    assert.match(statements[0], /ENGINE=InnoDB/);
});

test('disabling and re-enabling preserves previous clinic trials', async t => {
    const state = database(t);
    t.mock.method(pool, 'query', async (sql, params) => {
        assert.equal(sql, 'UPDATE trial_codes SET disabled_at = IF(?, NULL, UTC_TIMESTAMP()) WHERE id = 1');
        state().codes[0].disabled_at = params[0] ? null : '2026-10-10';
        return [{ affectedRows: 1 }];
    });
    await trials.redeem('SHARED', 10, 7);
    await trials.setEnabled(false);
    await assert.rejects(trials.redeem('SHARED', 20, 8), error => error.statusCode === 400);
    assert.equal((await trials.redeem('SHARED', 10, 7)).replayed, true);
    await trials.setEnabled(true);
    state().clinics[0].active = 0;
    await trials.redeem('SHARED', 10, 7);
    assert.equal(state().clinics[0].active, 0);
    assert.equal(state().clinics[0].revision, 1);
    await trials.redeem('SHARED', 20, 8);
    assert.equal(state().redemptions.length, 2);
});
