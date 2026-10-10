import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import styles from '../pages/auth.module.css';
import billingStyles from '../pages/subscription.module.css';

export default function TrialRedemption({ onRedeemed }) {
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [sharedCode, setSharedCode] = useState({ loading: true, code: null, error: false });
    const [reload, setReload] = useState(0);
    const pending = useRef(false);
    useEffect(() => {
        const controller = new AbortController();
        async function loadCode() {
            try {
                const response = await apiFetch('/user/trial-code', { signal: controller.signal });
                if (!response.ok) throw new Error('Unable to load trial code');
                const result = await response.json();
                if (result?.code !== null && typeof result?.code !== 'string') throw new Error('Invalid trial code response');
                if (!controller.signal.aborted) setSharedCode({ loading: false, code: result.code, error: false });
            } catch {
                if (!controller.signal.aborted) setSharedCode({ loading: false, code: null, error: true });
            }
        }
        loadCode();
        return () => controller.abort();
    }, [reload]);
    async function redeem(event) {
        event.preventDefault();
        if (pending.current) return;
        const code = new FormData(event.currentTarget).get('code').trim();
        pending.current = true; setBusy(true); setError(''); setNotice('');
        try {
            const response = await apiFetch('/user/trial-code', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
            });
            const result = await response.json().catch(() => null);
            if (!response.ok) throw new Error(result?.error || 'تعذر تفعيل التجربة. حاول مجدداً.');
            if (!result?.subscription) throw new Error('تعذر تأكيد التفعيل. أعد إرسال الرمز نفسه بأمان.');
            setNotice(result.subscription.active ? 'تم تفعيل التجربة المجانية. يمكنك الآن الدخول إلى مساحة العمل.' : 'تم استخدام هذا الرمز سابقاً، وانتهى الوصول المجاني للعيادة.');
            onRedeemed?.(result.subscription);
        } catch (failure) {
            setError(failure instanceof TypeError ? 'تعذر الاتصال. أعد إرسال الرمز نفسه بأمان؛ لن يُستخدم مرتين.' : failure.message);
        } finally { pending.current = false; setBusy(false); }
    }
    return <section className={billingStyles.trial} aria-labelledby="trial-title">
        <h2 id="trial-title">لديك رمز تجربة مجانية؟</h2>
        <p id="trial-help">أدخل رمز التجربة المشترك لتفعيل ١٠ أيام مجاناً على الباقة المحددة له. يمكن استخدام الرمز مرة واحدة فقط لكل عيادة.</p>
        <form onSubmit={redeem} aria-label="تفعيل التجربة المجانية" aria-busy={busy}>
            <div className={styles.field}>
                <label htmlFor="trial-code">رمز التجربة</label>
                {sharedCode.loading ? <span role="status">جارٍ تحميل رمز التجربة…</span>
                    : sharedCode.error ? <div role="alert">تعذر تحميل الرمز. <button type="button" className={billingStyles.retryCode} onClick={() => {
                        setSharedCode({ loading: true, code: null, error: false }); setReload(value => value + 1);
                    }}>إعادة المحاولة</button></div>
                        : sharedCode.code ? <code className={billingStyles.sharedCode} dir="ltr" aria-label="رمز التجربة المتاح">{sharedCode.code}</code>
                            : <span>رمز التجربة غير متاح حالياً.</span>}
                <input id="trial-code" name="code" type="text" dir="ltr" placeholder="CF-XXXXXX-XXXXXX-XXXXXX-XXXXXX"
                    autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={40} required disabled={busy} aria-describedby="trial-help" />
            </div>
            <button className={styles.button} disabled={busy}>{busy ? 'جارٍ التفعيل…' : 'تفعيل ١٠ أيام مجاناً'}</button>
        </form>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {notice && <p className={styles.notice} role="status">{notice}</p>}
    </section>;
}
