import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "./auth.module.css";

export default function SignupPage() {
    const [emailValid, setEmailValid] = useState(false);
    const [passwordValid, setPasswordValid] = useState(false);
    const [passwordConfirm, setPasswordConfirm] = useState(false);

    function handleSubmit(event) {
        event.preventDefault();
        const formValues = Object.fromEntries(new FormData(event.target).entries());
        setEmailValid(!formValues.email.includes('@'));
        setPasswordValid(formValues.password.length < 6);
        setPasswordConfirm(formValues.confirm_password !== formValues.password);
    }

    return (
        <main className={styles.page} dir="rtl">
            <Link to="/" className={styles.brand} aria-label="كيرفلو — الصفحة الرئيسية">كيرفلو<span>.</span></Link>
            <section className={`${styles.card} ${styles.signupCard}`} aria-labelledby="signup-title">
                <header className={styles.intro}>
                    <h1 id="signup-title" className={styles.title}>ابدأ مع كيرفلو</h1>
                    <p className={styles.description}>أنشئ حسابك واجعل إدارة عيادتك أكثر سهولة.</p>
                </header>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.fields}>
                        <div className={styles.field}>
                            <label htmlFor="name">الاسم</label>
                            <input type="text" name="name" id="name" autoComplete="name" placeholder="الاسم الكامل" required />
                        </div>
                        <div className={styles.field}>
                            <label htmlFor="email">البريد الإلكتروني</label>
                            <input type="email" name="email" id="email" dir="ltr" autoComplete="email" placeholder="you@example.com" required
                                aria-invalid={emailValid} aria-describedby={emailValid ? 'email-error' : undefined} />
                            {emailValid && <p id="email-error" className={styles.error} role="alert">يرجى إدخال بريد إلكتروني صحيح.</p>}
                        </div>
                        <div className={styles.field}>
                            <label htmlFor="clinic">اسم العيادة</label>
                            <input type="text" name="clinic_name" id="clinic" autoComplete="organization" placeholder="أدخل اسم العيادة" required />
                        </div>
                        <div className={styles.field}>
                            <label htmlFor="phone">رقم الهاتف</label>
                            <input type="tel" name="phone" id="phone" dir="ltr" autoComplete="tel" placeholder="07xx xxx xxxx" required />
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
                    </div>
                    <button type="submit" className={styles.button}>إنشاء حساب</button>
                </form>
                <p className={styles.switch}>لديك حساب بالفعل؟ <Link to="/login">تسجيل الدخول</Link></p>
            </section>
        </main>
    );
}
