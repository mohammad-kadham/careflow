import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router-dom';
import { apiFetch, onSubscriptionRequired } from '../src/api.js';
import { selectedPlanId, subscriptionPlans, manualPayment } from '../src/billing.js';

test('manual payment details use the supplied destination and existing plan prices', () => {
    assert.equal(manualPayment.qrCode, '/payments/qicard.jpeg');
    assert.deepEqual(subscriptionPlans.map(plan => plan.price), [22500, 37500]);
    assert.equal(selectedPlanId('advanced'), 'advanced');
    assert.equal(selectedPlanId('untrusted'), 'basic');
});

test('payment-required responses notify the workspace without activating a subscription', async t => {
    let notices = 0;
    const unsubscribe = onSubscriptionRequired(() => notices++);
    t.after(unsubscribe);
    t.mock.method(globalThis, 'fetch', async () => Response.json({ code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 }));
    assert.equal((await apiFetch('/in-queue')).status, 402);
    assert.equal(notices, 1);
    const controller = new AbortController(); controller.abort();
    await apiFetch('/in-queue', { signal: controller.signal });
    assert.equal(notices, 1);
    unsubscribe();
    await apiFetch('/in-queue');
    assert.equal(notices, 1);
});

test('subscription screen shows transfer details only to doctors and preserves plan selection', async t => {
    const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'silent' });
    t.after(() => server.close());
    const { default: SubscriptionPage } = await server.ssrLoadModule('/src/pages/subscription.jsx');
    const render = (role, active = false) => renderToStaticMarkup(createElement(MemoryRouter, {
        initialEntries: ['/subscription?plan=advanced'],
    }, createElement(SubscriptionPage, { user: {
        id: 7, clinic_id: 42, clinic_name: 'Test Clinic', email: 'test@example.com', role,
        subscription: { active, plan: null, expiresAt: null },
    } })));
    const doctor = render('doctor');
    assert.match(doctor, /<img[^>]+src="\/payments\/qicard\.jpeg"/);
    assert.match(doctor, /download="careflow-qi-card\.jpeg"/);
    assert.doesNotMatch(doctor, /07736250346/);
    assert.match(doctor, /CF-42-advanced/);
    assert.match(doctor, /test@example.com/);
    assert.match(doctor, /لقد دفعت/);
    assert.match(doctor, /id="trial-code"/);
    assert.match(doctor, /تفعيل ١٠ أيام مجاناً/);
    assert.match(doctor, /يمكن استخدام الرمز مرة واحدة فقط لكل عيادة/);
    assert.doesNotMatch(doctor, /التحقق من تفعيل الاشتراك/);
    assert.doesNotMatch(doctor, /الانتقال إلى مساحة العمل/);
    assert.match(render('doctor', true), /الانتقال إلى مساحة العمل/);
    assert.doesNotMatch(render('doctor', true), /id="trial-code"/);
    const staff = render('staff');
    assert.doesNotMatch(staff, /qicard\.jpeg|07736250346|CF-42/);
    assert.doesNotMatch(staff, /id="trial-code"/);
    assert.match(staff, /التواصل مع الطبيب/);
});
