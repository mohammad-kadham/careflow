import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { signUp } from '../auth/session';
import styles from "./auth.module.css";

export default function SignupPage() {
    const [emailValid, setEmailValid] = useState(false);
    const [passwordValid, setPasswordValid] = useState(false);
    const [passwordConfirm, setPasswordConfirm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const submittingRef = useRef(false);
    const navigate = useNavigate();
    const location = useLocation();

    async function handleSubmit(event) {
        event.preventDefault();
        if (submittingRef.current) return;
        const formValues = Object.fromEntries(new FormData(event.currentTarget).entries());
        const invalidEmail = !formValues.email.trim().includes('@');
        const shortPassword = formValues.password.length < 6;
        const mismatch = formValues.confirm_password !== formValues.password;
        setEmailValid(invalidEmail);
        setPasswordValid(shortPassword);
        setPasswordConfirm(mismatch);
        setError('');
        if (invalidEmail || shortPassword || mismatch) return;
        if (['name', 'clinic_name', 'phone'].some(field => !formValues[field].trim())) {
            setError('يرجى إدخال الاسم واسم العيادة ورقم الهاتف.');
            return;
        }
        if (new TextEncoder().encode(formValues.password).length > 72) {
            setError('كلمة السر طويلة جداً. يرجى تقصيرها.');
            return;
        }
        submittingRef.current = true;
        setSubmitting(true);
        try {
            const result = await signUp(formValues);
            navigate(`/verify-email${location.search}`, { replace: true, state: { email: formValues.email.trim(), emailSent: result.emailSent } });
        } catch (failure) {
            setError(failure instanceof TypeError
                ? 'تعذر تأكيد إنشاء الحساب. تحقق من الاتصال؛ إذا كان الحساب قد أُنشئ، يمكنك تسجيل الدخول.'
                : failure.message);
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    }

    return (
        <main className={styles.page} dir="rtl">
            <Link to="/" className={styles.brand} aria-label="كيرفلو — الصفحة الرئيسية">كيرفلو<span>.</span></Link>
            <section className={`${styles.card} ${styles.signupCard}`} aria-labelledby="signup-title">
                <header className={styles.intro}>
                    <h1 id="signup-title" className={styles.title}>ابدأ مع كيرفلو</h1>
                    <p className={styles.description}>أنشئ حساب طبيب، ثم سجّل الدخول لعرض تعليمات الدفع عبر Qi Card. تبدأ إدارة العيادة بعد مراجعة التحويل وتفعيل الاشتراك.</p>
                </header>
                <form onSubmit={handleSubmit} className={styles.form} aria-busy={submitting}>
                    <fieldset className={`${styles.fields} ${styles.signupFields}`} disabled={submitting} aria-label="بيانات الحساب">
                        <div className={styles.field}>
                            <label htmlFor="name">الاسم</label>
                            <input type="text" name="name" id="name" autoComplete="name" placeholder="الاسم الكامل" maxLength={100} required />
                        </div>
                        <div className={styles.field}>
                            <label htmlFor="email">البريد الإلكتروني</label>
                            <input type="email" name="email" id="email" dir="ltr" autoComplete="email" placeholder="you@example.com" maxLength={255} required
                                aria-invalid={emailValid} aria-describedby={emailValid ? 'email-error' : undefined} />
                            {emailValid && <p id="email-error" className={styles.error} role="alert">يرجى إدخال بريد إلكتروني صحيح.</p>}
                        </div>
                        <div className={styles.field}>
                            <label htmlFor="clinic">اسم العيادة</label>
                            <input type="text" name="clinic_name" id="clinic" autoComplete="organization" placeholder="أدخل اسم العيادة" maxLength={150} required />
                        </div>
                        <div className={styles.field}>
                            <label htmlFor="phone">رقم الهاتف</label>
                            <input type="tel" name="phone" id="phone" dir="ltr" autoComplete="tel" placeholder="07xx xxx xxxx" maxLength={40} required />
                        </div>
                        <div className={styles.field}>
                            <label htmlFor="password">كلمة السر</label>
                            <input type="password" name="password" id="password" autoComplete="new-password" placeholder="6 أحرف على الأقل" required
                                aria-invalid={passwordValid} aria-describedby={passwordValid ? 'password-error' : undefined} />
                            {passwordValid && <p id="password-error" className={styles.error} role="alert">يجب أن تتكون كلمة السر من 6 أحرف على الأقل.</p>}
                        </div>
                        <div className={styles.field}>
                            <label htmlFor="confirm_password">تأكيد كلمة السر</label>
                            <input type="password" name="confirm_password" id="confirm_password" autoComplete="new-password" placeholder="أعد إدخال كلمة السر" required
                                aria-invalid={passwordConfirm} aria-describedby={passwordConfirm ? 'confirm-error' : undefined} />
                            {passwordConfirm && <p id="confirm-error" className={styles.error} role="alert">يجب أن تتطابق كلمتا السر.</p>}
                        </div>
                    </fieldset>
                    {error && <p className={styles.error} role="alert">{error}</p>}
                    <button type="submit" className={styles.button} disabled={submitting}>
                        {submitting ? 'جارٍ إنشاء الحساب…' : 'إنشاء حساب'}
                    </button>
                </form>
                <p className={styles.switch}>لديك حساب بالفعل؟ <Link to={`/login${location.search}`}>تسجيل الدخول</Link></p>
            </section>
        </main>
    );
}
