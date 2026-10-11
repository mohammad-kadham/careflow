import { redirectDocument } from 'react-router-dom';

const productionHosts = new Set(['app-careflow.com', 'www.app-careflow.com']);

export function isPublicAnalyticsPath(pathname) {
    return /^\/(?:demo\/?|blog(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?\/?)?$/.test(pathname);
}

// The beacon has no teardown API. Cross this boundary with a fresh document
// so its SPA listeners can never follow navigation into the clinic or auth pages.
export function analyticsNavigation({ request }) {
    const next = new URL(request.url);
    if (isPublicAnalyticsPath(window.location.pathname) !== isPublicAnalyticsPath(next.pathname)) {
        return redirectDocument(`${next.pathname}${next.search}${next.hash}`);
    }
    return null;
}

export function startPublicAnalytics({ production = import.meta.env?.PROD, location = window.location, document: doc = document } = {}) {
    if (!production || !productionHosts.has(location.hostname) ||
        !isPublicAnalyticsPath(location.pathname) || doc.querySelector('[data-cf-beacon]')) return;

    const script = doc.createElement('script');
    script.type = 'module';
    script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    script.setAttribute('data-cf-beacon', JSON.stringify({ token: 'd41da91562774900b25a2631366eb753' }));
    doc.body.appendChild(script);
}
