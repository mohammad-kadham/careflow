import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { requestPasswordReset, resetPassword } from '../src/auth/password-reset.js';

test('reset uses JSON bodies and never puts a password or token in a URL', async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return Response.json({}); });
    await requestPasswordReset(' user@example.com '); await resetPassword('a'.repeat(64), ' new-password ');
    assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'user@example.com' });
    assert.deepEqual(JSON.parse(calls[1].options.body), { token: 'a'.repeat(64), password: ' new-password ' });
    assert.equal(calls[1].options.method, 'POST'); assert.equal(calls[1].options.credentials, 'include');
    assert.doesNotMatch(calls[1].url, /aaaa|password=/);
});
test('reset errors distinguish invalid links, throttling and unavailable email', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ code: 'INVALID_RESET_LINK', error: 'Expired link' }, { status: 400 }));
    await assert.rejects(resetPassword('a'.repeat(64), 'password'), error => error.code === 'INVALID_RESET_LINK');
    fetch.mock.mockImplementation(async () => Response.json({}, { status: 429 }));
    await assert.rejects(requestPasswordReset('user@example.com'), /يرجى الانتظار/);
    fetch.mock.mockImplementation(async () => Response.json({}, { status: 503 }));
    await assert.rejects(requestPasswordReset('user@example.com'), /غير متاحة مؤقتاً/);
    fetch.mock.mockImplementation(async () => { throw new TypeError('Network offline'); });
    await assert.rejects(resetPassword('a'.repeat(64), 'password'), /Network offline/);
});
test('reset pages offer recovery, require explicit password entry and never render the token', async t => {
    const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'silent' });
    t.after(() => server.close());
    const { default: Forgot } = await server.ssrLoadModule('/src/pages/forgot-password.jsx');
    const { default: Reset } = await server.ssrLoadModule('/src/pages/reset-password.jsx');
    const { default: Login } = await server.ssrLoadModule('/src/pages/login.jsx');
    const render = (Component, entry) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [entry] }, createElement(Component)));
    assert.match(render(Login, '/login'), /href="\/forgot-password"/);
    assert.match(render(Forgot, '/forgot-password'), /إرسال رابط الاستعادة/);
    const token = 'b'.repeat(64), html = render(Reset, '/reset-password#token=' + token);
    assert.match(html, /حفظ كلمة السر الجديدة/); assert.match(html, /تأكيد كلمة السر الجديدة/);
    assert.match(html, /autocomplete="new-password"/i); assert.doesNotMatch(html, new RegExp(token));
    for (const entry of ['/reset-password', '/reset-password#token=invalid']) {
        const invalid = render(Reset, entry); assert.match(invalid, /طلب رابط استعادة جديد/); assert.doesNotMatch(invalid, /id="new-password"/);
    }
});
