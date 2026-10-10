function unavailable() {
    return Object.assign(new Error('Email delivery is temporarily unavailable.'), { statusCode: 503 });
}

function configuration() {
    const apiKey = process.env.BREVO_API_KEY?.trim();
    const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
    let url;
    try { url = new URL(process.env.APP_URL); } catch { throw unavailable(); }
    if (!apiKey || apiKey.startsWith('xsmtpsib-') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail || '') ||
        url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw unavailable();
    return { apiKey, senderEmail, origin: url.origin, senderName: process.env.BREVO_SENDER_NAME?.trim() || 'CareFlow' };
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

async function send(config, { user, subject, htmlContent, tag }) {
    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST', headers: { 'api-key': config.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
            signal: AbortSignal.timeout(10000), redirect: 'error',
            body: JSON.stringify({ sender: { name: config.senderName, email: config.senderEmail },
                to: [{ email: user.email, name: user.name }], subject, htmlContent, tags: [tag] }),
        });
        if (response.status !== 201) throw unavailable();
        const result = await response.json();
        if (typeof result.messageId !== 'string' || !result.messageId) throw unavailable();
    } catch { throw unavailable(); }
}

module.exports = { configuration, escapeHtml, send, unavailable };
