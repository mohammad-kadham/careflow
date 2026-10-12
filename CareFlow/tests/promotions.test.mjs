import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { subscribeToPromotions } from '../src/promotions.js';

test('promotion signup sends only contact and consent in a POST body', async t => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'http://localhost:8080/promotions');
        assert.equal(options.method, 'POST');
        assert.deepEqual(JSON.parse(options.body), { email: 'person@example.test', phone: '07701234567', consent: true });
        return Response.json({ ok: true });
    });
    await subscribeToPromotions({ email: ' person@example.test ', phone: ' 07701234567 ', consent: true, source: 'forged' });
});

test('failed or malformed signup responses never claim success or retry automatically', async t => {
    const mock = t.mock.method(globalThis, 'fetch');
    const values = { email: 'person@example.test', phone: '07701234567', consent: true };
    for (const [status, message] of [[400, /تحقق/], [429, /طلبات كثيرة/], [500, /تعذر حفظ/]]) {
        mock.mock.mockImplementation(async () => Response.json({ error: 'PRIVATE-DETAILS' }, { status }));
        await assert.rejects(subscribeToPromotions(values), message);
    }
    mock.mock.mockImplementation(async () => new Response('<html>fallback</html>'));
    await assert.rejects(subscribeToPromotions(values), /تعذر حفظ/);
    mock.mock.mockImplementation(async () => { throw new TypeError('Offline'); });
    await assert.rejects(subscribeToPromotions(values), TypeError);
    assert.equal(mock.mock.callCount(), 5);
});

test('promotion form requires both fields and an unchecked opt-in; admin displays submitted contacts safely', async t => {
    const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, logLevel: 'silent' });
    t.after(() => server.close());
    const { default: Promotions } = await server.ssrLoadModule('/src/components/promotions.jsx');
    const html = renderToStaticMarkup(createElement(Promotions));
    assert.match(html, /<input\b(?=[^>]*name="email")(?=[^>]*required)[^>]*>/);
    assert.match(html, /<input\b(?=[^>]*name="phone")(?=[^>]*required)[^>]*>/);
    assert.match(html, /<input\b(?=[^>]*type="checkbox")(?=[^>]*name="consent")(?=[^>]*required)[^>]*>/);
    assert.doesNotMatch(html, /checked|action="[^\"]*\?/);
    assert.match(html, /أوافق على استخدام بريدي الإلكتروني ورقم هاتفي/);
    const { default: PromotionContacts } = await server.ssrLoadModule('/src/admin/promotions.jsx');
    const table = renderToStaticMarkup(createElement('table', null, createElement(PromotionContacts, { rows: [
        { id: 1, email: '<script>@example.test', phone: '+9647701234567', createdAt: '2026-10-12T00:00:00Z' },
    ] })));
    assert.match(table, /تاريخ الموافقة/);
    assert.match(table, /\+9647701234567/);
    assert.doesNotMatch(table, /<script>/);
});
