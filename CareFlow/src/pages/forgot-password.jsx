import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { requestPasswordReset } from '../auth/password-reset';
import styles from './auth.module.css';

export default function ForgotPasswordPage() {
    const location = useLocation();
    const [email, setEmail] = useState(location.state?.email || '');
    const [busy, setBusy] = useState(false), [cooldown, setCooldown] = useState(0);
    const [error, setError] = useState(''), [sent, setSent] = useState(false);
    const pending = useRef(false);
    useEffect(() => {
        if (!cooldown) return;
        const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);
    async function submit(event) {
        event.preventDefault();
        if (pending.current || cooldown) return;
        pending.current = true; setBusy(true); setError(''); setSent(false);
        try { await requestPasswordReset(email); setSent(true); setCooldown(60); }
        catch (failure) { setError(failure instanceof TypeError ? 'تعذر الاتصال بالخادم. حاول مرة أخرى.' : failure.message); }
        finally { pending.current = false; setBusy(false); }
    }
    return <main className={styles.page} dir="rtl">
        <Link to="/" className={styles.brand}>كيرفلو<span>.</span></Link>
        <section className={styles.card} aria-labelledby="forgot-title">
            <header className={styles.intro}>
                <h1 id="forgot-title" className={styles.title}>نسيت كلمة السر؟</h1>
                <p className={styles.description}>أدخل بريد حسابك لطلب رابط تعيين كلمة سر جديدة. الرابط صالح لمدة ٣٠ دقيقة.</p>
            </header>
            {sent && <p className={styles.notice} role="status">إذا كان البريد مرتبطاً بحساب، ستصلك رسالة برابط الاستعادة. تفقد البريد غير المرغوب فيه، وانتظر دقيقة قبل طلب رابط آخر.</p>}
            <form className={styles.form} onSubmit={submit} aria-busy={busy}>
                <div className={styles.field}>
                    <label htmlFor="reset-email">البريد الإلكتروني</label>
                    <input id="reset-email" name="email" type="email" dir="ltr" autoComplete="email" maxLength={255} required
                        value={email} onChange={event => setEmail(event.target.value)} disabled={busy} />
                </div>
                {error && <p className={styles.error} role="alert">{error}</p>}
                <button className={styles.button} disabled={busy || cooldown > 0}>{busy ? 'جارٍ إرسال الطلب…' : cooldown ? `إعادة الإرسال بعد ${cooldown} ثانية` : 'إرسال رابط الاستعادة'}</button>
            </form>
            <p className={styles.switch}><Link to="/login">العودة إلى تسجيل الدخول</Link></p>
        </section>
    </main>;
}
