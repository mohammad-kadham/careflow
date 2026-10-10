import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { resetPassword } from '../auth/password-reset';
import styles from './auth.module.css';

export default function ResetPasswordPage() {
    const location = useLocation(), navigate = useNavigate();
    const [token, setToken] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') || '');
    const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
    const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [invalid, setInvalid] = useState(false);
    const [error, setError] = useState('');
    const pending = useRef(false);
    const validToken = /^[0-9a-f]{64}$/.test(token) && !invalid;
    useEffect(() => {
        // Keep the token in memory only; opening a link never changes a password.
        if (location.hash) navigate({ pathname: location.pathname, search: location.search, hash: '' }, { replace: true });
    }, [location.hash, location.pathname, location.search, navigate]);
    async function submit(event) {
        event.preventDefault();
        if (pending.current || !validToken) return;
        setError('');
        if ([...password].length < 6 || new TextEncoder().encode(password).length > 72) {
            setError('استخدم كلمة سر من ٦ أحرف على الأقل، ولا تتجاوز ٧٢ بايت.'); return;
        }
        if (password !== confirmation) { setError('كلمتا السر غير متطابقتين.'); return; }
        pending.current = true; setBusy(true);
        try { await resetPassword(token, password); setDone(true); setToken(''); setPassword(''); setConfirmation(''); }
        catch (failure) {
            if (failure.code === 'INVALID_RESET_LINK') setInvalid(true);
            setError(failure instanceof TypeError ? 'تعذر تأكيد تغيير كلمة السر. تحقق من الاتصال وحاول مجدداً، أو اطلب رابطاً جديداً.' : failure.message);
        } finally { pending.current = false; setBusy(false); }
    }
    return <main className={styles.page} dir="rtl">
        <Link to="/" className={styles.brand}>كيرفلو<span>.</span></Link>
        <section className={styles.card} aria-labelledby="reset-title">
            <header className={styles.intro}>
                <h1 id="reset-title" className={styles.title}>{done ? 'تم تغيير كلمة السر' : 'تعيين كلمة سر جديدة'}</h1>
                <p className={styles.description}>{done ? 'تم تسجيل الخروج من الجلسات السابقة. سجّل الدخول بكلمة السر الجديدة.'
                    : validToken ? 'اختر كلمة سر جديدة لحسابك وأعد كتابتها للتأكيد.' : 'رابط الاستعادة غير صالح أو لم يعد متاحاً. اطلب رابطاً جديداً للمتابعة.'}</p>
            </header>
            {error && <p className={styles.error} role="alert">{error}</p>}
            {!done && validToken && <form className={styles.form} onSubmit={submit} aria-busy={busy}>
                <div className={styles.field}>
                    <label htmlFor="new-password">كلمة السر الجديدة</label>
                    <input id="new-password" type="password" autoComplete="new-password" minLength={6} maxLength={72} required disabled={busy}
                        value={password} onChange={event => setPassword(event.target.value)} aria-describedby="password-help" />
                    <small id="password-help">٦ أحرف على الأقل. يُفضّل استخدام كلمة سر طويلة وفريدة.</small>
                </div>
                <div className={styles.field}>
                    <label htmlFor="confirm-password">تأكيد كلمة السر الجديدة</label>
                    <input id="confirm-password" type="password" autoComplete="new-password" minLength={6} maxLength={72} required disabled={busy}
                        value={confirmation} onChange={event => setConfirmation(event.target.value)} />
                </div>
                <button className={styles.button} disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ كلمة السر الجديدة'}</button>
            </form>}
            {!done && <p className={styles.switch}><Link to="/forgot-password">طلب رابط استعادة جديد</Link></p>}
            <p className={styles.switch}><Link to="/login" state={done ? { reason: 'password-reset' } : undefined}>العودة إلى تسجيل الدخول</Link></p>
        </section>
    </main>;
}
