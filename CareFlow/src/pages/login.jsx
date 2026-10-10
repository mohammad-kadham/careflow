import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { signIn } from '../auth/session';
import styles from "./auth.module.css";

export default function LoginPage() {
    const [inputValues, setInputValues] = useState({ email: '', password: '' });
    const [didEdit, setDidEdit] = useState({ email: false, password: false });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const submittingRef = useRef(false);
    const navigate = useNavigate();
    const location = useLocation();
    const notices = {
        required: 'يرجى تسجيل الدخول للوصول إلى مساحة العمل.',
        expired: 'انتهت جلسة الدخول. يرجى تسجيل الدخول مرة أخرى. لم تُحفظ التغييرات غير المرسلة.',
        'signed-out': 'تم تسجيل الخروج بنجاح.',
        'signed-up': 'تم إنشاء حسابك بنجاح. سجّل الدخول للمتابعة.',
        'email-verified': 'تم تأكيد بريدك الإلكتروني. سجّل الدخول للمتابعة.',
        'password-reset': 'تم تغيير كلمة السر بنجاح. سجّل الدخول بكلمة السر الجديدة.',
    };

    const isNotEmail = didEdit.email && !inputValues.email.includes('@');
    const invalidPassword = didEdit.password && inputValues.password.length === 0;

    async function handleSubmit(event) {
        event.preventDefault();
        if (submittingRef.current) return;
        submittingRef.current = true;
        setSubmitting(true);
        setError('');
        try {
            await signIn(inputValues.email, inputValues.password);
            navigate(`/app${location.search}`, { replace: true });
        } catch (failure) {
            if (failure.code === 'EMAIL_NOT_VERIFIED') {
                navigate(`/verify-email${location.search}`, { state: { email: inputValues.email.trim() } });
                return;
            }
            setError(failure instanceof TypeError
                ? 'تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مرة أخرى.'
                : failure.message);
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    }

    function handleInputChange(identifier, value) {
        setInputValues(prevValues => ({ ...prevValues, [identifier]: value }));
        setDidEdit(prev => ({ ...prev, [identifier]: false }));
    }

    function handleInputBlur(identifier) {
        setDidEdit(prev => ({ ...prev, [identifier]: true }));
    }

    return (
        <main className={styles.page} dir="rtl">
            <Link to="/" className={styles.brand} aria-label="كيرفلو — الصفحة الرئيسية">كيرفلو<span>.</span></Link>
            <section className={styles.card} aria-labelledby="login-title">
                <header className={styles.intro}>
                    <h1 id="login-title" className={styles.title}>أهلاً بعودتك</h1>
                    <p className={styles.description}>سجّل دخولك لمتابعة إدارة عيادتك.</p>
                </header>
                {notices[location.state?.reason] && <p className={styles.notice} role="status">{notices[location.state.reason]}</p>}
                <form onSubmit={handleSubmit} className={styles.form} aria-busy={submitting}>
                    <div className={styles.field}>
                        <label htmlFor="email">البريد الإلكتروني</label>
                        <input type="email" name="email" id="email" dir="ltr" placeholder="you@example.com"
                            autoComplete="email" required disabled={submitting} value={inputValues.email}
                            aria-invalid={isNotEmail} aria-describedby={isNotEmail ? 'email-error' : undefined}
                            onChange={(e) => handleInputChange('email', e.target.value)}
                            onBlur={() => handleInputBlur('email')} />
                        {isNotEmail && <p id="email-error" className={styles.error} role="alert">يرجى إدخال بريد إلكتروني صحيح.</p>}
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="password">كلمة السر</label>
                        <input type="password" name="password" id="password" placeholder="أدخل كلمة السر"
                            autoComplete="current-password" required disabled={submitting} value={inputValues.password}
                            aria-invalid={invalidPassword} aria-describedby={invalidPassword ? 'password-error' : undefined}
                            onChange={(e) => handleInputChange('password', e.target.value)}
                            onBlur={() => handleInputBlur('password')} />
                        {invalidPassword && <p id="password-error" className={styles.error} role="alert">يرجى إدخال كلمة السر.</p>}
                        <Link to="/forgot-password" state={{ email: inputValues.email.trim() }}>نسيت كلمة السر؟</Link>
                    </div>
                    {error && <p className={styles.error} role="alert">{error}</p>}
                    <button type="submit" className={styles.button} disabled={submitting}>
                        {submitting ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول'}
                    </button>
                </form>
                <Link to="/demo" className={styles.demoButton}>جرّب بدون تسجيل — حساب الطبيب والموظف</Link>
                <p className={styles.switch}><Link to="/verify-email">إعادة إرسال رسالة تأكيد البريد</Link></p>
                <p className={styles.switch}>ليس لديك حساب؟ <Link to={`/signup${location.search}`}>إنشاء حساب جديد</Link></p>
            </section>
        </main>
    );
}
