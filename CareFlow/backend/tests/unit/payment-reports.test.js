const assert = require('node:assert/strict');
const { test } = require('node:test');

// Load only the controller. Persistence is replaced before import, so no database is opened.
const modelPath = require.resolve('../../models/payment-reports');
const unexpected = () => { throw new Error('Unexpected model call'); };
const model = { create: unexpected, findByReference: unexpected, list: unexpected };
require.cache[modelPath] = { id: modelPath, filename: modelPath, loaded: true, exports: model };
const controller = require('../../controllers/payment-reports');
const valid = { plan: 'basic', senderPhone: '07712345678', transactionReference: 'QI-123' };
const user = Object.freeze({ id: 7, clinic_id: 42, subscription_active: 0 });
async function invoke(t, body, handler = controller.create) {
    const res = { statusCode: 200, body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; } };
    const next = t.mock.fn();
    await handler({ user, body, query: { clinic_id: 999 } }, res, next);
    return { res, next };
}
function successfulModel(t) {
    let values;
    const create = t.mock.method(model, 'create', async input => { values = input; return [{ insertId: 15 }]; });
    const find = t.mock.method(model, 'findByReference', async () => [[{ ...values, id: 15, status: 'pending' }]]);
    return { create, find };
}
for (const [plan, amount] of [['basic', 22500], ['advanced', 37500]]) {
    test(`payment ${plan}: server sets price and ownership; client cannot approve`, async t => {
        const { create } = successfulModel(t);
        const { res, next } = await invoke(t, { ...valid, plan, amountIqd: 1, userId: 99, clinicId: 999, status: 'approved', subscription_active: 1 });
        assert.equal(res.statusCode, 201);
        assert.deepEqual(create.mock.calls[0].arguments[0], {
            clinicId: 42, userId: 7, plan, amountIqd: amount, senderPhone: valid.senderPhone, transactionReference: valid.transactionReference,
        });
        assert.equal(res.body.report.status, 'pending');
        assert.equal(user.subscription_active, 0);
        assert.equal(next.mock.callCount(), 0);
    });
}
test('payment normalizes Arabic digits, phone formatting, and reference case', async t => {
    const { find } = successfulModel(t);
    const { res } = await invoke(t, { ...valid, senderPhone: ' +٩٦٤ (٧٧١) ٢٣٤-٥٦٧٨ ', transactionReference: '  ｑｉ-١٢٣  ' });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.report.senderPhone, '+9647712345678');
    assert.equal(res.body.report.transactionReference, 'QI-123');
    assert.deepEqual(find.mock.calls[0].arguments, ['QI-123']);
});
const invalidCases = [
    ['missing body', undefined], ['null body', null], ['array body', []], ['empty body', {}],
    ['unavailable plan', { ...valid, plan: 'mastercard' }],
    ['inherited property plan', { ...valid, plan: '__proto__' }],
    ['non-string plan', { ...valid, plan: 1 }],
    ['non-string phone', { ...valid, senderPhone: 7712345678 }],
    ['short phone', { ...valid, senderPhone: '123456' }],
    ['long phone', { ...valid, senderPhone: '1'.repeat(16) }],
    ['oversized raw phone', { ...valid, senderPhone: ' '.repeat(41) }],
    ['phone containing letters', { ...valid, senderPhone: '077abc45678' }],
    ['non-string reference', { ...valid, transactionReference: 123 }],
    ['empty reference', { ...valid, transactionReference: '  ' }],
    ['oversized reference', { ...valid, transactionReference: 'x'.repeat(101) }],
    ['reference expanded beyond limit by normalization', { ...valid, transactionReference: 'ß'.repeat(51) }],
    ['reference with control characters', { ...valid, transactionReference: 'QI\u0000123' }],
];
for (const [name, body] of invalidCases) {
    test(`payment rejects ${name} before persistence`, async t => {
        const create = t.mock.method(model, 'create');
        const find = t.mock.method(model, 'findByReference');
        const { res, next } = await invoke(t, body);
        assert.equal(res.statusCode, 400);
        assert.equal(create.mock.callCount(), 0);
        assert.equal(find.mock.callCount(), 0);
        assert.equal(next.mock.callCount(), 0);
        assert.ok(res.body.error);
    });
}
for (const length of [7, 15]) {
    test(`payment accepts ${length}-digit phone and 100-character reference`, async t => {
        successfulModel(t);
        const { res } = await invoke(t, { ...valid, senderPhone: '1'.repeat(length), transactionReference: 'A'.repeat(100) });
        assert.equal(res.statusCode, 201);
    });
}
for (const status of ['pending', 'approved', 'rejected']) {
    test(`payment retry preserves an existing ${status} report`, async t => {
        t.mock.method(model, 'create', async () => { throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }); });
        const report = { id: 15, clinicId: 42, plan: valid.plan, senderPhone: valid.senderPhone, status };
        t.mock.method(model, 'findByReference', async () => [[report]]);
        const { res, next } = await invoke(t, valid);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { report });
        assert.equal(next.mock.callCount(), 0);
    });
}
for (const [name, overrides] of [['another clinic', { clinicId: 99 }], ['different plan', { plan: 'advanced' }], ['different sender', { senderPhone: '07799999999' }]]) {
    test(`duplicate for ${name} returns conflict without leaking the record`, async t => {
        t.mock.method(model, 'create', async () => { throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }); });
        t.mock.method(model, 'findByReference', async () => [[{ id: 15, clinicId: 42, plan: 'basic', senderPhone: valid.senderPhone, ...overrides }]]);
        const { res } = await invoke(t, valid);
        assert.equal(res.statusCode, 409);
        assert.deepEqual(Object.keys(res.body), ['error']);
    });
}
test('insert failure is forwarded without claiming success or reading back', async t => {
    const failure = new Error('database unavailable');
    t.mock.method(model, 'create', async () => { throw failure; });
    const find = t.mock.method(model, 'findByReference');
    const { res, next } = await invoke(t, valid);
    assert.equal(res.body, undefined);
    assert.equal(find.mock.callCount(), 0);
    assert.deepEqual(next.mock.calls[0].arguments, [failure]);
});
test('readback failure is forwarded without confirming submission', async t => {
    const failure = new Error('read unavailable');
    t.mock.method(model, 'create', async () => [{ insertId: 15 }]);
    t.mock.method(model, 'findByReference', async () => { throw failure; });
    const { res, next } = await invoke(t, valid);
    assert.equal(res.body, undefined);
    assert.deepEqual(next.mock.calls[0].arguments, [failure]);
});
test('missing report after insert is not reported as successful', async t => {
    t.mock.method(model, 'create', async () => [{ insertId: 15 }]);
    t.mock.method(model, 'findByReference', async () => [[]]);
    const { res, next } = await invoke(t, valid);
    assert.equal(res.body, undefined);
    assert.equal(next.mock.callCount(), 1);
    assert.ok(next.mock.calls[0].arguments[0] instanceof Error);
});
test('listing uses the authenticated clinic instead of supplied clinic IDs', async t => {
    const rows = [{ id: 15, clinicId: 42 }];
    const list = t.mock.method(model, 'list', async () => [rows]);
    const { res, next } = await invoke(t, { clinic_id: 999 }, controller.list);
    assert.deepEqual(list.mock.calls[0].arguments, [42]);
    assert.deepEqual(res.body, { reports: rows });
    assert.equal(next.mock.callCount(), 0);
});
test('listing failure is forwarded rather than disguised as an empty list', async t => {
    const failure = new Error('list unavailable');
    t.mock.method(model, 'list', async () => { throw failure; });
    const { res, next } = await invoke(t, undefined, controller.list);
    assert.equal(res.body, undefined);
    assert.deepEqual(next.mock.calls[0].arguments, [failure]);
});
