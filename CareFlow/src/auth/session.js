import { apiFetch } from '../api.js';

export async function getSession(signal) {
    const response = await apiFetch('/user/me', { signal }, { notifyUnauthorized: false });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error('تعذر التحقق من جلسة الدخول. حاول مرة أخرى.');
    const result = await response.json();
    if (!Number.isSafeInteger(result.user?.id) || result.user.id <= 0) {
        throw new Error('استجابة تسجيل الدخول غير صالحة. حاول مرة أخرى.');
    }
    return result.user;
}

export async function signIn(email, password) {
    const response = await apiFetch('/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
    }, { notifyUnauthorized: false });
    if (response.status === 401) throw new Error('البريد الإلكتروني أو كلمة السر غير صحيحة.');
    if (response.status === 400) throw new Error('يرجى التحقق من البريد الإلكتروني وكلمة السر.');
    if (response.status === 403) {
        const result = await response.json().catch(() => null);
        if (result?.code === 'EMAIL_NOT_VERIFIED') {
            throw Object.assign(new Error('يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول.'), { code: result.code });
        }
    }
    if (!response.ok) throw new Error('تعذر تسجيل الدخول. حاول مرة أخرى.');
    // The JWT stays in the HttpOnly cookie. /app verifies it through /user/me.
}

export async function signOut() {
    const response = await apiFetch('/user/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
    }, { notifyUnauthorized: false });
    if (!response.ok) throw new Error('تعذر تسجيل الخروج. حاول مرة أخرى.');
}

export async function signUp({ name, email, clinic_name, phone, password }) {
    const response = await apiFetch('/user/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: name.trim(), email: email.trim(),
            clinic_name: clinic_name.trim(), phone: phone.trim(), password,
        }),
    }, { notifyUnauthorized: false });
    if (response.status === 409) {
        throw new Error('البريد الإلكتروني مسجل بالفعل. سجّل الدخول أو استخدم بريداً آخر.');
    }
    if (response.status === 400) {
        const result = await response.json().catch(() => null);
        const labels = { name: 'الاسم', email: 'البريد الإلكتروني', clinic_name: 'اسم العيادة', phone: 'رقم الهاتف', password: 'كلمة السر' };
        const label = labels[result?.errors?.[0]?.field];
        throw new Error(label ? `يرجى التحقق من ${label}.` : 'يرجى التحقق من بيانات التسجيل.');
    }
    if (response.status === 429) throw new Error('طلبات كثيرة. يرجى الانتظار قبل إنشاء حساب آخر.');
    if (response.status === 503) throw new Error('خدمة تأكيد البريد غير متاحة مؤقتاً. حاول إنشاء الحساب لاحقاً.');
    if (!response.ok) throw new Error('تعذر إنشاء الحساب. حاول مرة أخرى.');
    return response.json();
}
