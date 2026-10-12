import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adminRequest } from '../src/admin/api.js';
import { exportPromotionContacts } from '../src/admin/promotion-export.js';

test('export requests use admin authentication, selected search, cancellation and a dated CSV download', async t => {
    const controller = new AbortController();
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'http://localhost:8080/admin/promotions/export?q=person%2Btag%40example.test');
        assert.equal(options.credentials, 'include');
        assert.equal(options.cache, 'no-store');
        assert.equal(options.signal, controller.signal);
        return new Response('email,phone\r\nperson@example.test,+9647701234567\r\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
    });
    let clicked = false, removed = false, appended = false;
    const link = { click() { clicked = true; }, remove() { removed = true; } };
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
        createElement(tag) { assert.equal(tag, 'a'); return link; },
        body: { appendChild(element) { assert.equal(element, link); appended = true; } },
    } });
    t.after(() => { if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document; });
    await exportPromotionContacts('person+tag@example.test', controller.signal);
    assert.ok(clicked && removed && appended);
    assert.match(link.href, /^blob:/);
    assert.match(link.download, /^careflow-promotion-contacts-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('export never downloads a login error, server error, HTML fallback or cancelled response', async t => {
    const mock = t.mock.method(globalThis, 'fetch');
    for (const status of [401, 500]) {
        mock.mock.mockImplementation(async () => Response.json({ error: 'Export failed' }, { status }));
        await assert.rejects(exportPromotionContacts(''), error => error.status === status);
    }
    mock.mock.mockImplementation(async () => new Response('<html>fallback</html>', { headers: { 'Content-Type': 'text/html' } }));
    await assert.rejects(adminRequest('/promotions/export', { download: true }), /تعذر تصدير/);
    const controller = new AbortController();
    mock.mock.mockImplementation(async () => {
        controller.abort();
        return new Response('email,phone', { headers: { 'Content-Type': 'text/csv' } });
    });
    await exportPromotionContacts('', controller.signal);
});
