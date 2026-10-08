import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { signIn, signUp } from '../src/auth/session.js';
import { confirmEmail, resendVerification } from '../src/auth/email-verification.js';

test('login identifies pending verification without claiming a session', async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ code: 'EMAIL_NOT_VERIFIED' }, { status: 403 }));
    await assert.rejects(signIn('test@example.com', 'secret'), error => error.code === 'EMAIL_NOT_VERIFIED');
});

test('signup preserves delivery failure so the UI offers recovery', async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ verificationRequired: true, emailSent: false }, { status: 201 }));
    const result = await signUp({ name: 'Test', email: 'test@example.com', clinic_name: 'Clinic', phone: '07700000000', password: 'secret' });
    assert.equal(result.verificationRequired, true); assert.equal(result.emailSent, false);
});

test('verification uses POST bodies and resend trims the email', async t => {
    const token = 'a'.repeat(64);
    const requests = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => { requests.push({ url, options }); return Response.json({}); });
    await confirmEmail(token); await resendVerification(' test@example.com ');
    assert.equal(requests[0].url, 'http://localhost:8080/user/verification/confirm');
    assert.equal(requests[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(requests[0].options.body), { token });
    assert.ok(!requests[0].url.includes(token));
    assert.deepEqual(JSON.parse(requests[1].options.body), { email: 'test@example.com' });
});

test('verification failures and throttling have useful recovery messages', async t => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 400 }));
    await assert.rejects(confirmEmail('a'.repeat(64)), /انتهت صلاحيته/);
    fetchMock.mock.mockImplementation(async () => Response.json({}, { status: 429 }));
    await assert.rejects(resendVerification('test@example.com'), /يرجى الانتظار/);
    fetchMock.mock.mockImplementation(async () => Response.json({}, { status: 503 }));
    await assert.rejects(resendVerification('test@example.com'), /غير متاحة مؤقتاً/);
});

test('confirmation page requires a click and does not render the token', async t => {
    const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'silent' });
    t.after(() => server.close());
    const { default: VerifyEmailPage } = await server.ssrLoadModule('/src/pages/verify-email.jsx');
    const token = 'b'.repeat(64);
    const render = entry => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [entry] }, createElement(VerifyEmailPage)));
    const html = render('/verify-email#token=' + token);
    assert.match(html, /تأكيد بريدي الإلكتروني/);
    assert.doesNotMatch(html, new RegExp(token));
    assert.match(html, /إرسال رابط تأكيد جديد/);
    const failed = render({ pathname: '/verify-email', state: { email: 'user@example.com', emailSent: false } });
    assert.match(failed, /تعذر إرسال رسالة التأكيد/);
    assert.match(failed, /user@example.com/);
});
