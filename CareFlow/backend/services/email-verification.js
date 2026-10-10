const { randomBytes, createHash } = require('node:crypto');
const tokens = require('../models/email-verification');
const { configuration, escapeHtml, send, unavailable } = require('./email');
const hashToken = token => createHash('sha256').update(token).digest('hex');

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
        await send(config, {
            user, subject: 'تأكيد بريدك الإلكتروني — كيرفلو', tag: 'email-verification',
            htmlContent: `<html lang="ar" dir="rtl"><body style="font-family:Arial,sans-serif;line-height:1.9;color:#172b2a"><h1>تأكيد البريد الإلكتروني</h1><p>مرحباً ${escapeHtml(user.name)}،</p><p>اضغط على الرابط ثم اختر «تأكيد بريدي الإلكتروني» لإكمال إنشاء حسابك في كيرفلو.</p><p><a href="${escapeHtml(link)}" style="color:#0d8278">تأكيد البريد الإلكتروني</a></p><p>هذا الرابط صالح لمدة ساعة واحدة ويُستخدم مرة واحدة. إذا لم تطلب إنشاء الحساب، يمكنك تجاهل هذه الرسالة.</p></body></html>`,
        });
        return true;
    } catch {
        await tokens.revoke(user.id, hash);
        throw unavailable();
    }
};
exports.verify = token => tokens.consume(hashToken(token));
