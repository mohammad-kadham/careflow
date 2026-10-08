const assert = require('node:assert/strict');
const { test } = require('node:test');
const { subscriptionFor, requireSubscription } = require('../../middleware/subscription');
const { requireDoctor, allowPatientRegistration } = require('../../middleware/roles');
function invoke(t, handler, req) {
    const res = { statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    const next = t.mock.fn(); handler(req, res, next); return { res, next };
}
test('subscription exposes public fields only and defaults to inactive', () => {
    assert.deepEqual(subscriptionFor({ password: 'private', token: 'private' }), { active: false, required: false, plan: null, expiresAt: null });
    assert.deepEqual(subscriptionFor({ subscription_active: '1', subscription_required: '1', subscription_plan: 'basic', subscription_expires_at: '2030-01-01T00:00:00Z' }), {
        active: true, required: true, plan: 'basic', expiresAt: '2030-01-01T00:00:00Z',
    });
});
for (const value of [undefined, null, 0, '0', false, 2, 'active']) {
    test(`subscription rejects DB active flag ${JSON.stringify(value)} despite client claims`, t => {
        const { res, next } = invoke(t, requireSubscription, {
            user: { subscription_active: value, subscription_plan: 'advanced', subscription_expires_at: '2099-01-01T00:00:00Z' },
            body: { subscription_active: 1 }, query: { subscription_active: 1 },
        });
        assert.equal(res.statusCode, 402);
        assert.equal(res.body.code, 'SUBSCRIPTION_REQUIRED');
        assert.equal(next.mock.callCount(), 0);
    });
}
for (const value of [1, '1', true]) {
    test(`subscription permits DB active flag ${JSON.stringify(value)}`, t => {
        const { res, next } = invoke(t, requireSubscription, { user: { subscription_active: value } });
        assert.equal(next.mock.callCount(), 1);
        assert.deepEqual(next.mock.calls[0].arguments, []);
        assert.equal(res.body, undefined);
    });
}
for (const role of [undefined, 'staff', 'admin', 'Doctor']) {
    test(`doctor-only access rejects role ${String(role)} despite forged body`, t => {
        const { res, next } = invoke(t, requireDoctor, { user: role === undefined ? undefined : { role }, body: { role: 'doctor' } });
        assert.equal(res.statusCode, 403);
        assert.equal(next.mock.callCount(), 0);
    });
}
test('doctor-only access permits a verified doctor', t => {
    const { res, next } = invoke(t, requireDoctor, { user: { role: 'doctor' } });
    assert.equal(next.mock.callCount(), 1);
    assert.equal(res.body, undefined);
});
for (const field of ['bloodType', 'heightCm', 'weightKg', 'allergies', 'chronicConditions', 'notes']) {
    test(`staff registration rejects injected ${field}`, t => {
        const { res, next } = invoke(t, allowPatientRegistration, { user: { role: 'staff' }, body: { name: 'Test', [field]: 'clinical data' } });
        assert.equal(res.statusCode, 403);
        assert.equal(next.mock.callCount(), 0);
    });
}
test('staff can register demographics with empty clinical fields', t => {
    const { res, next } = invoke(t, allowPatientRegistration, { user: { role: 'staff' }, body: { name: 'Test', bloodType: null, notes: '', allergies: undefined } });
    assert.equal(next.mock.callCount(), 1);
    assert.equal(res.body, undefined);
});
test('doctor can register clinical fields', t => {
    const { res, next } = invoke(t, allowPatientRegistration, { user: { role: 'doctor' }, body: { notes: 'clinical data' } });
    assert.equal(next.mock.callCount(), 1);
    assert.equal(res.body, undefined);
});
