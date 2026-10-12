import { useRef, useState } from 'react';
import consent from '../../backend/config/promotion-consent.json';
import { subscribeToPromotions } from '../promotions';
import styles from './promotions.module.css';

export default function Promotions() {
    const [busy, setBusy] = useState(false), [submitted, setSubmitted] = useState(false), [error, setError] = useState('');
    const pending = useRef(false);
    async function submit(event) {
        event.preventDefault();
        if (pending.current) return;
        const form = event.currentTarget;
        const data = new FormData(form);
        pending.current = true; setBusy(true); setError('');
        try {
            await subscribeToPromotions({ email: data.get('email'), phone: data.get('phone'), consent: data.get('consent') === 'on' });
            form.reset(); setSubmitted(true);
        } catch (failure) {
            setError(failure instanceof TypeError ? 'تعذر الاتصال بالخادم. تحقق من اتصالك وحاول مجددًا.' : failure.message);
        } finally { pending.current = false; setBusy(false); }
    }
    return <section id="promotions" className={styles.section} dir="rtl" aria-labelledby="promotions-title">
        <div className={styles.card}>
            <div className={styles.intro}>
                <span className={styles.eyebrow}>عروض كيرفلو</span>
                <h2 id="promotions-title">كن أول من يعرف<br />عن عروضنا الجديدة.</h2>
                <p>اترك بريدك الإلكتروني ورقم هاتفك لنتواصل معك بشأن عروض وباقات كيرفلو.</p>
                <p className={styles.note}>الاشتراك اختياري ولا يتطلب إنشاء حساب. نستخدم هذه البيانات للتواصل بشأن عروض كيرفلو فقط.</p>
            </div>
            {submitted ? <div className={styles.success} role="status"><h3>شكرًا لاهتمامك بكيرفلو</h3><p>تم تسجيل رغبتك في استقبال العروض بنجاح.</p></div>
                : <form className={styles.form} onSubmit={submit} aria-busy={busy} aria-describedby="promotions-note">
                    <div className={styles.fields}>
                        <label htmlFor="promotions-email">البريد الإلكتروني<input id="promotions-email" name="email" type="email" dir="ltr" autoComplete="email" placeholder="you@example.com" maxLength={254} required disabled={busy} /></label>
                        <label htmlFor="promotions-phone">رقم الهاتف<input id="promotions-phone" name="phone" type="tel" dir="ltr" autoComplete="tel" inputMode="tel" placeholder="0770 123 4567" maxLength={40} required disabled={busy} aria-describedby="promotions-note" /></label>
                    </div>
                    <p id="promotions-note" className={styles.note}>أدخل رقمًا عراقيًا أو رقمًا دوليًا مع رمز الدولة.</p>
                    <label className={styles.consent}><input type="checkbox" name="consent" required disabled={busy} /><span>{consent.text}</span></label>
                    {error && <p className={styles.error} role="alert">{error}</p>}
                    <button type="submit" disabled={busy}>{busy ? 'جارٍ التسجيل…' : 'أريد استقبال العروض'}</button>
                </form>}
        </div>
    </section>;
}
