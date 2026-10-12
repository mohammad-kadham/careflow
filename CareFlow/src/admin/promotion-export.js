import { adminRequest } from './api.js';

export async function exportPromotionContacts(q, signal) {
    const blob = await adminRequest('/promotions/export?' + new URLSearchParams({ q }), { signal, download: true });
    if (signal?.aborted) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `careflow-promotion-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    try { link.click(); }
    finally {
        link.remove();
        // Allow the browser to start reading the download before releasing it.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
