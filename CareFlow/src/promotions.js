import { apiFetch } from './api.js';

export async function subscribeToPromotions({ email, phone, consent }) {
    const response = await apiFetch('/promotions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), phone: phone.trim(), consent }),
    }, { notifyUnauthorized: false });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok !== true) {
        const message = response.status === 429 ? 'طلبات كثيرة. انتظر قليلًا قبل المحاولة مجددًا.'
            : response.status === 400 ? 'تحقق من البريد ورقم الهاتف والموافقة على استقبال العروض.'
            : 'تعذر حفظ بياناتك الآن. حاول مجددًا بعد قليل.';
        throw new Error(message);
    }
}
