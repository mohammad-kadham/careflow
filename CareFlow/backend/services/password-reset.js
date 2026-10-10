const { randomBytes, createHash } = require('node:crypto');
const bcrypt = require('bcryptjs');
const tokens = require('../models/password-reset');
const mail = require('./email');
const hashToken = token => createHash('sha256').update(token).digest('hex');
exports.hashToken = hashToken;
exports.assertConfigured = () => { mail.configuration(); };

exports.sendFor = async user => {
    const config = mail.configuration();
    const token = randomBytes(32).toString('hex'), hash = hashToken(token);
    if (!await tokens.reserve(user.id, hash, Number(user.auth_version ?? 0))) return false;
    const link = `${config.origin}/reset-password#token=${token}`;
    try {
        await mail.send(config, {
            user, subject: 'إعادة تعيين كلمة السر — كيرفلو', tag: 'password-reset',
            htmlContent: `<html lang="ar" dir="rtl"><body style="font-family:Arial,sans-serif;line-height:1.9;color:#172b2a"><h1>إعادة تعيين كلمة السر</h1><p>مرحباً ${mail.escapeHtml(user.name)}،</p><p>طلبت إعادة تعيين كلمة السر لحسابك في كيرفلو. افتح الرابط أدناه واختر كلمة سر جديدة.</p><p><a href="${mail.escapeHtml(link)}" style="color:#0d8278">إعادة تعيين كلمة السر</a></p><p>الرابط صالح لمدة ٣٠ دقيقة ويُستخدم مرة واحدة. إذا لم تطلب تغيير كلمة السر، تجاهل هذه الرسالة؛ لن تتغير كلمة سرك.</p></body></html>`,
        });
        return true;
    } catch {
        await tokens.revoke(user.id, hash);
        throw mail.unavailable();
    }
};

exports.reset = async (token, password) => tokens.consume(hashToken(token), await bcrypt.hash(password, 10));
