import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { confirmEmail, resendVerification } from '../auth/email-verification';
import styles from './auth.module.css';

export default function VerifyEmailPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const [token, setToken] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') || '');
    const [email, setEmail] = useState(location.state?.email || '');
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const [verified, setVerified] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState(location.state?.emailSent === false
        ? 'تم إنشاء الحساب، لكن تعذر إرسال رسالة التأكيد. انتظر دقيقة ثم اطلب رابطاً جديداً.' : '');
    const [cooldown, setCooldown] = useState(0);

    useEffect(() => {
        // Keep the token in memory only, and require a click so mail scanners cannot consume it.
        if (location.hash) navigate({ pathname: location.pathname, search: location.search, hash: '' }, { replace: true, state: location.state });
    }, [location.hash, location.pathname, location.search, location.state, navigate]);

    useEffect(() => {
        if (!cooldown) return;
        const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    async function act(kind, event) {
        event.preventDefault();
        if (busyRef.current || (kind === 'resend' && cooldown)) return;
        busyRef.current = true;
        setBusy(true); setError(''); setMessage('');
        try {
            if (kind === 'confirm') {
                await confirmEmail(token);
                setVerified(true); setToken('');
            } else {
                await resendVerification(email);
                setCooldown(60);
                setMessage('تم استلام الطلب. إذا كان الحساب بحاجة للتأكيد، ستصلك رسالة. تفقد البريد غير المرغوب فيه، وانتظر دقيقة قبل طلب رابط آخر.');
            }
        } catch (failure) {
            setError(failure instanceof TypeError ? 'تعذر الاتصال بالخادم. حاول مرة أخرى.' : failure.message);
        } finally { busyRef.current = false; setBusy(false); }
    }

    return <main className={styles.page} dir="rtl">
        <Link to="/" className={styles.brand}>كيرفلو<span>.</span></Link>
        <section className={styles.card} aria-labelledby="verify-title">
            <header className={styles.intro}>
                <h1 id="verify-title" className={styles.title}>{verified ? 'تم تأكيد بريدك' : 'تأكيد البريد الإلكتروني'}</h1>
                <p className={styles.description}>{verified
                    ? 'يمكنك الآن تسجيل الدخول إلى حسابك.'
                    : token ? 'اضغط على الزر لتأكيد ملكيتك لهذا البريد الإلكتروني.'
                        : 'افتح رسالة كيرفلو في بريدك واضغط على رابط التأكيد. الرابط صالح لمدة ساعة واحدة.'}</p>
                {!verified && email && <p className={styles.description} dir="ltr">{email}</p>}
            </header>
            {error && <p className={styles.error} role="alert">{error}</p>}
            {message && <p className={styles.notice} role="status">{message}</p>}
            {!verified && token && <form onSubmit={event => act('confirm', event)}>
                <button className={styles.button} disabled={busy}>{busy ? 'جارٍ التأكيد…' : 'تأكيد بريدي الإلكتروني'}</button>
            </form>}
            {!verified && <form className={styles.form} onSubmit={event => act('resend', event)} aria-busy={busy}>
                <div className={styles.field}>
                    <label htmlFor="verification-email">لم تصلك الرسالة؟ أدخل بريد حسابك</label>
                    <input id="verification-email" type="email" dir="ltr" autoComplete="email" maxLength={255} required value={email} onChange={event => setEmail(event.target.value)} disabled={busy} />
                </div>
                <button className={styles.button} disabled={busy || cooldown > 0}>
                    {cooldown > 0 ? `إعادة الإرسال بعد ${cooldown} ثانية` : 'إرسال رابط تأكيد جديد'}
                </button>
            </form>}
            <p className={styles.switch}><Link to={`/login${location.search}`} state={verified ? { reason: 'email-verified' } : undefined}>العودة إلى تسجيل الدخول</Link></p>
        </section>
    </main>;
}
