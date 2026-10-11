import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyticsNavigation, isPublicAnalyticsPath, startPublicAnalytics } from '../src/analytics.js';

function documentFixture() {
    const scripts = [];
    return {
        scripts,
        querySelector: () => scripts.find(script => script.attributes['data-cf-beacon']),
        createElement: () => ({ attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } }),
        body: { appendChild: script => scripts.push(script) },
    };
}

test('only public marketing, blog and demo routes are eligible for analytics', () => {
    for (const path of ['/', '/demo', '/demo/', '/blog', '/blog/', '/blog/clinic-organization']) {
        assert.equal(isPublicAnalyticsPath(path), true, path);
    }
    for (const path of ['/app', '/app/patients/12', '/subscription', '/admin/', '/login', '/signup',
        '/reset-password', '/forgot-password', '/verify-email', '/missing', '/blog/one/two', '/demographic']) {
        assert.equal(isPublicAnalyticsPath(path), false, path);
    }
});

test('production public pages load the supplied beacon once', () => {
    for (const hostname of ['app-careflow.com', 'www.app-careflow.com']) {
        const document = documentFixture();
        const options = { production: true, location: { hostname, pathname: '/' }, document };
        startPublicAnalytics(options);
        startPublicAnalytics(options);
        assert.equal(document.scripts.length, 1);
        const script = document.scripts[0];
        assert.equal(script.src, 'https://static.cloudflareinsights.com/beacon.min.js');
        assert.equal(script.type, 'module');
        assert.deepEqual(JSON.parse(script.attributes['data-cf-beacon']), { token: 'd41da91562774900b25a2631366eb753' });
    }
});

test('private pages, development and preview hosts never load the beacon', () => {
    for (const [production, hostname, pathname] of [
        [false, 'app-careflow.com', '/'], [true, 'localhost', '/'],
        [true, 'preview.example.com', '/'], [true, 'app-careflow.com', '/app'],
        [true, 'app-careflow.com', '/reset-password'], [true, 'app-careflow.com', '/admin/'],
    ]) {
        const document = documentFixture();
        startPublicAnalytics({ production, location: { hostname, pathname }, document });
        assert.equal(document.scripts.length, 0, `${hostname}${pathname}`);
    }
});

test('crossing the public/private boundary requests a full document navigation', t => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    t.after(() => {
        if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
        else delete globalThis.window;
    });
    for (const [from, to] of [['/', '/login'], ['/demo', '/signup?plan=yearly'],
        ['/blog/article', '/app'], ['/login', '/demo'], ['/reset-password', '/']]) {
        globalThis.window = { location: { pathname: from } };
        const response = analyticsNavigation({ request: new Request(`https://app-careflow.com${to}`) });
        assert.equal(response.status, 302);
        assert.equal(response.headers.get('Location'), to);
        assert.equal(response.headers.get('X-Remix-Reload-Document'), 'true');
    }
    for (const [from, to] of [['/', '/blog/article'], ['/blog', '/demo'], ['/login', '/app'],
        ['/signup', '/verify-email'], ['/app', '/subscription']]) {
        globalThis.window = { location: { pathname: from } };
        assert.equal(analyticsNavigation({ request: new Request(`https://app-careflow.com${to}`) }), null);
    }
});
