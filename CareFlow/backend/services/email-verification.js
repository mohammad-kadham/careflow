const { randomBytes, createHash } = require('node:crypto');
const tokens = require('../models/email-verification');

function unavailable() {
    const error = new Error('Email verification is temporarily unavailable.');
    error.statusCode = 503;
    return error;
}

function configuration() {
    const apiKey = process.env.BREVO_API_KEY?.trim();
    const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
    let url;
    try { url = new URL(process.env.APP_URL); } catch { throw unavailable(); }
    if (!apiKey || apiKey.startsWith('xsmtpsib-') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail || '') ||
        url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
        throw unavailable();
    }
    return { apiKey, senderEmail, origin: url.origin, senderName: process.env.BREVO_SENDER_NAME?.trim() || 'CareFlow' };
}

const hashToken = token => createHash('sha256').update(token).digest('hex');
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

exports.assertConfigured = () => { configuration(); };
exports.hashToken = hashToken;
exports.sendFor = async user => {
    const config = configuration();
    const token = randomBytes(32).toString('hex');
    const hash = hashToken(token);
    if (!await tokens.reserve(user.id, hash)) return false;
    // Fragments are not sent in HTTP requests or Referer headers.
    const link = `${config.origin}/verify-email#token=${token}`;
    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': config.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
            signal: AbortSignal.timeout(10000),
            redirect: 'error',
            body: JSON.stringify({
                sender: { name: config.senderName, email: config.senderEmail },
                to: [{ email: user.email, name: user.name }],
                subject: 'تأكيد بريدك الإلكتروني — كيرفلو',
                htmlContent: `<html lang="ar" dir="rtl"><body style="font-family:Arial,sans-serif;line-height:1.9;color:#172b2a"><h1>تأكيد البريد الإلكتروني</h1><p>مرحباً ${escapeHtml(user.name)}،</p><p>اضغط على الرابط ثم اختر «تأكيد بريدي الإلكتروني» لإكمال إنشاء حسابك في كيرفلو.</p><p><a href="${escapeHtml(link)}" style="color:#0d8278">تأكيد البريد الإلكتروني</a></p><p>هذا الرابط صالح لمدة ساعة واحدة ويُستخدم مرة واحدة. إذا لم تطلب إنشاء الحساب، يمكنك تجاهل هذه الرسالة.</p></body></html>`,
                tags: ['email-verification'],
            }),
        });
        if (response.status !== 201) throw unavailable();
        const result = await response.json();
        if (typeof result.messageId !== 'string' || !result.messageId) throw unavailable();
        return true;
    } catch {
        // Never expose provider responses, API keys, or verification tokens.
        await tokens.revoke(user.id, hash);
        throw unavailable();
    }
};
exports.verify = token => tokens.consume(hashToken(token));
