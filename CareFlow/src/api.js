const defaultOrigin = globalThis.location?.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8080' : 'http://localhost:8080';
const apiOrigin = (import.meta.env?.VITE_API_URL || defaultOrigin).replace(/\/$/, '');
const sessionEvents = new EventTarget();

export function onUnauthorized(listener) {
    sessionEvents.addEventListener('unauthorized', listener);
    return () => sessionEvents.removeEventListener('unauthorized', listener);
}

export function onSubscriptionRequired(listener) {
    sessionEvents.addEventListener('subscription-required', listener);
    return () => sessionEvents.removeEventListener('subscription-required', listener);
}

export async function apiFetch(path, options = {}, { notifyUnauthorized = true } = {}) {
    if (!path.startsWith('/') || path.startsWith('//')) {
        throw new Error('API requests must use a relative path starting with /.');
    }
    // Demo requests stay in the browser, even if a real session cookie exists.
    if (/^\/demo\/?$/.test(globalThis.location?.pathname || '')) {
        const role = new URLSearchParams(globalThis.location.search).get('role') === 'staff' ? 'staff' : 'doctor';
        const { demoFetch } = await import('./demo/api.js');
        return demoFetch(path, options, role);
    }
    const response = await fetch(`${apiOrigin}${path}`, {
        ...options,
        credentials: 'include',
        cache: 'no-store',
    });
    if (response.status === 401 && notifyUnauthorized && !options.signal?.aborted) {
        sessionEvents.dispatchEvent(new Event('unauthorized'));
    }
    if (response.status === 402 && !options.signal?.aborted) {
        sessionEvents.dispatchEvent(new Event('subscription-required'));
    }
    return response;
}
