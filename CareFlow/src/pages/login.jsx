import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "./auth.module.css";

export default function LoginPage() {
    const [inputValues, setInputValues] = useState({ email: '', password: '' });
    const [didEdit, setDidEdit] = useState({ email: false, password: false });

    const isNotEmail = didEdit.email && !inputValues.email.includes('@');
    const invalidPassword = didEdit.password && inputValues.password.length === 0;

    function handleSubmit(event) {
        event.preventDefault();
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
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.field}>
                        <label htmlFor="email">البريد الإلكتروني</label>
                        <input type="email" name="email" id="email" dir="ltr" placeholder="you@example.com"
                            autoComplete="email" required value={inputValues.email}
                            aria-invalid={isNotEmail} aria-describedby={isNotEmail ? 'email-error' : undefined}
                            onChange={(e) => handleInputChange('email', e.target.value)}
                            onBlur={() => handleInputBlur('email')} />
                        {isNotEmail && <p id="email-error" className={styles.error} role="alert">يرجى إدخال بريد إلكتروني صحيح.</p>}
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="password">كلمة السر</label>
                        <input type="password" name="password" id="password" placeholder="أدخل كلمة السر"
                            autoComplete="current-password" required value={inputValues.password}
                            aria-invalid={invalidPassword} aria-describedby={invalidPassword ? 'password-error' : undefined}
                            onChange={(e) => handleInputChange('password', e.target.value)}
                            onBlur={() => handleInputBlur('password')} />
                        {invalidPassword && <p id="password-error" className={styles.error} role="alert">يرجى إدخال كلمة السر.</p>}
                    </div>
                    <button type="submit" className={styles.button}>تسجيل الدخول</button>
                </form>
                <p className={styles.switch}>ليس لديك حساب؟ <Link to="/signup">إنشاء حساب جديد</Link></p>
            </section>
        </main>
    );
}
