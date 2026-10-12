import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, Outlet, StaticRouterProvider } from 'react-router-dom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

test('error pages offer safe recovery for missing routes and failed requests', async t => {
    const server = await createServer({
        configFile: false, plugins: [react()],
        server: { middlewareMode: true, hmr: false }, logLevel: 'silent',
    });
    t.after(() => server.close());
    const { default: ErrorPage } = await server.ssrLoadModule('/src/pages/error.jsx');

    async function render({ path = '/failed', failure, wildcard = false } = {}) {
        const routes = [{
            element: createElement(Outlet),
            errorElement: createElement(ErrorPage),
            children: [
                { path: '/', element: createElement('p', null, 'Home') },
                { path: '/failed', loader: () => { throw failure; }, element: createElement('p', null, 'Page') },
                ...(wildcard ? [{ path: '*', element: createElement(ErrorPage, { notFound: true }) }] : []),
            ],
        }];
        const handler = createStaticHandler(routes);
        const context = await handler.query(new Request(`http://localhost${path}`));
        return renderToStaticMarkup(createElement(StaticRouterProvider, {
            router: createStaticRouter(handler.dataRoutes, context), context, hydrate: false,
        }));
    }

    await t.test('unknown URLs show an Arabic 404 with a home link', async () => {
        for (const wildcard of [false, true]) {
            const html = await render({ path: '/missing/nested-page', wildcard });
            assert.match(html, /الصفحة غير موجودة/);
            assert.match(html, /<title[^>]*>الصفحة غير موجودة \| كيرفلو<\/title>/);
            assert.match(html, /dir="rtl" lang="ar"/);
            assert.match(html, /href="\/"/);
            assert.doesNotMatch(html, /<button/);
        }
    });

    await t.test('a thrown 404 response uses the missing-page message', async () => {
        const html = await render({ failure: new Response('PRIVATE-RESPONSE', { status: 404 }) });
        assert.match(html, /الصفحة غير موجودة/);
        assert.doesNotMatch(html, /PRIVATE-RESPONSE/);
    });

    await t.test('unexpected failures do not expose error details', async () => {
        for (const failure of [new Error('PRIVATE-STACK-DETAILS'), new Response('PRIVATE-RESPONSE', { status: 500 })]) {
            const html = await render({ failure });
            assert.match(html, /تعذّر عرض الصفحة/);
            assert.match(html, /<button[^>]*>إعادة تحميل الصفحة<\/button>/);
            assert.match(html, /التغييرات غير المحفوظة/);
            assert.doesNotMatch(html, /PRIVATE-|Unexpected Application Error|<pre>/);
        }
    });
});
