import { Link } from "react-router-dom";
import styles from "./header.module.css";

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link to="/" className={styles.logo} aria-label="كيرفلو — الصفحة الرئيسية">
          <img src="/careflow.png" alt="" className={styles.icon} />
          <span>كيرفلو<span className={styles.dot}>.</span></span>
        </Link>
        <nav className={styles.nav} aria-label="التنقل الرئيسي">
          <a href="#features">المميزات</a>
          <a href="#how-it-works">كيف يعمل؟</a>
          <a href="#pricing">الأسعار</a>
        </nav>
        <div className={styles.actions}>
          <Link to="/login" className={styles.button}>تسجيل الدخول</Link>
          <Link to="/signup" className={`${styles.button} ${styles.subscribe}`}>
            اشترك الآن
          </Link>
        </div>
      </div>
    </header>
  );
}
