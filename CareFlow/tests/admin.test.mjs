import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adminRequest, subscriptionStatus, localDateInput } from '../src/admin/api.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

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

test('shared trial code can be created only before setup and then shows the same reusable code', async t => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'silent' });
  t.after(() => server.close());
  const { SharedTrialCode } = await server.ssrLoadModule('/src/admin/trial-codes.jsx');
  const render = code => renderToStaticMarkup(createElement(SharedTrialCode, { code }));
  assert.match(render(null), /إنشاء الرمز المشترك/);
  const code = { code: 'CF-ABCDEF-123456-789ABC-DEF012', plan: 'advanced', usageCount: 2, status: 'available' };
  const html = render(code);
  assert.match(html, /CF-ABCDEF-123456-789ABC-DEF012/);
  assert.match(html, /مرة واحدة/);
  assert.match(html, /المتقدمة/);
  assert.match(html, /عدد العيادات المستفيدة/);
  assert.match(html, /تعطيل الرمز/);
  assert.doesNotMatch(html, /إنشاء الرمز المشترك/);
  assert.match(render({ ...code, status: 'disabled' }), /إعادة تفعيل الرمز/);
});

test('all-clinics directory is discoverable and renders clinics with and without doctor accounts', async t => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, logLevel: 'silent' });
  t.after(() => server.close());
  const { Dashboard } = await server.ssrLoadModule('/src/admin/app.jsx');
  const dashboard = renderToStaticMarkup(createElement(Dashboard, { user: { name: 'Owner', email: 'owner@example.test' }, onLogout() {} }));
  assert.match(dashboard, /جميع العيادات/);
  assert.match(dashboard, /اشتراكات العيادات/);
  const { default: ClinicDirectory } = await server.ssrLoadModule('/src/admin/clinics.jsx');
  const rows = [
    { id: 7, name: 'عيادة الاختبار', customerName: 'طبيب الاختبار', email: 'doctor@example.test', phone: '07700000001', doctorCount: 2, staffCount: 3, createdAt: '2026-10-01T00:00:00Z', required: 1, active: 1, plan: 'basic', expiresAt: '2027-01-01T00:00:00Z' },
    { id: 8, name: '<script>clinic</script>', customerName: null, doctorCount: 0, staffCount: 0, required: 1, active: 0 },
  ];
  const html = renderToStaticMarkup(createElement('table', null, createElement(ClinicDirectory, { rows, onManage() {} })));
  for (const text of ['عيادة الاختبار', 'طبيب الاختبار', 'doctor@example.test', '07700000001', 'الأطباء: ٢', 'الموظفون: ٣', 'لا يوجد حساب طبيب', 'الأطباء: ٠', 'تاريخ التسجيل', 'نشط', 'غير مفعّل']) assert.ok(html.includes(text), text);
  assert.match(html, /إدارة اشتراك عيادة الاختبار — عيادة 7/);
  assert.doesNotMatch(html, /<script>/);
});
