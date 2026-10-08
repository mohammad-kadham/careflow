import { apiFetch } from '../api.js';

async function post(path, body) {
    const response = await apiFetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }, { notifyUnauthorized: false });
    if (response.status === 429) throw new Error('طلبات كثيرة. يرجى الانتظار قبل المحاولة مجدداً.');
    if (response.status === 503) throw new Error('خدمة البريد غير متاحة مؤقتاً. حاول لاحقاً.');
    return response;
}

export async function resendVerification(email) {
    const response = await post('/user/verification/resend', { email: email.trim() });
    if (response.status === 400) throw new Error('أدخل بريداً إلكترونياً صحيحاً.');
    if (!response.ok) throw new Error('تعذر إرسال الطلب. حاول مرة أخرى.');
}

export async function confirmEmail(token) {
    const response = await post('/user/verification/confirm', { token });
    if (response.status === 400) throw new Error('رابط التأكيد غير صالح أو انتهت صلاحيته أو تم استخدامه. يمكنك تسجيل الدخول إذا أكدت بريدك، أو طلب رابط جديد.');
    if (!response.ok) throw new Error('تعذر تأكيد البريد. حاول مرة أخرى.');
}
