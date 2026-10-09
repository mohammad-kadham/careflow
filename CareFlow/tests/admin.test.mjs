import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adminRequest, subscriptionStatus, localDateInput } from '../src/admin/api.js';

test('admin requests use separate endpoints, cookies and JSON without storing credentials', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return Response.json({ ok: true }); });
  await adminRequest('/payments/3/review', { body: { action: 'approve', confirmed: true } });
  assert.equal(calls[0].url, 'http://localhost:8080/admin/payments/3/review');
  assert.equal(calls[0].options.credentials, 'include'); assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.method, 'POST'); assert.deepEqual(JSON.parse(calls[0].options.body), { action: 'approve', confirmed: true });
  await assert.rejects(adminRequest('//evil.example/path'), /Invalid admin endpoint/);
});
test('admin errors preserve expiry and conflict status for recovery', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Login required' }, { status: 401 }));
  await assert.rejects(adminRequest('/me'), error => error.status === 401);
  mock.mock.mockImplementation(async () => Response.json({ error: 'Refresh before editing' }, { status: 409 }));
  await assert.rejects(adminRequest('/clinics/5/subscription', { body: {} }), error => error.status === 409 && /Refresh/.test(error.message));
});
test('subscription display distinguishes legacy access, unpaid and expired clinics', () => {
  assert.equal(subscriptionStatus({ required: 0, active: 1 }), 'وصول سابق');
  assert.equal(subscriptionStatus({ required: 1, active: 1, expiresAt: '2027-01-01' }), 'نشط');
  assert.equal(subscriptionStatus({ required: 1, active: 0, expiresAt: '2020-01-01' }), 'منتهي');
  assert.equal(subscriptionStatus({ required: 1, active: 0, expiresAt: null }), 'غير مفعّل');
  const source = '2027-01-01T12:30:00.000Z';
  assert.equal(new Date(localDateInput(source)).toISOString(), source);
});
