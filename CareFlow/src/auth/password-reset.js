import { apiFetch } from '../api.js';

async function post(path, body) {
    const response = await apiFetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }, { notifyUnauthorized: false });
    if (response.status === 429) throw new Error('طلبات كثيرة. يرجى الانتظار قبل المحاولة مجدداً.');
    if (response.status === 503) throw new Error('خدمة البريد غير متاحة مؤقتاً. حاول لاحقاً.');
    return response;
}

export async function requestPasswordReset(email) {
    const response = await post('/user/password-reset/request', { email: email.trim() });
    if (response.status === 400) throw new Error('أدخل بريداً إلكترونياً صحيحاً.');
    if (!response.ok) throw new Error('تعذر إرسال طلب الاستعادة. حاول مرة أخرى.');
}

export async function resetPassword(token, password) {
    const response = await post('/user/password-reset/confirm', { token, password });
    if (response.status === 400) {
        const result = await response.json().catch(() => null);
        throw Object.assign(new Error(result?.error || 'تحقق من الرابط وكلمة السر ثم حاول مجدداً.'), { code: result?.code });
    }
    if (!response.ok) throw new Error('تعذر تأكيد تغيير كلمة السر. حاول مرة أخرى أو اطلب رابطاً جديداً.');
}
