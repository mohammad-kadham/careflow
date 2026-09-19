import { Link } from "react-router-dom";
import styles from "./footer.module.css";

export default function Footer() {
  const year = new Date().getFullYear().toLocaleString("ar-IQ", { useGrouping: false });

  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <Link to="/" className={styles.logo} aria-label="كيرفلو — الصفحة الرئيسية">
              <img src="/careflow.png" alt="" width="64" height="64" />
              <span>كيرفلو<span className={styles.dot}>.</span></span>
            </Link>
            <p className={styles.description}>
              إدارة أسهل لعيادتك، ووقت أكبر لرعاية مرضاك.
            </p>
          </div>

          <nav className={styles.nav} aria-label="روابط التذييل">
            <h2 className={styles.heading}>اكتشف كيرفلو</h2>
            <Link to="/">الرئيسية</Link>
            <a href="#pricing">الباقات والأسعار</a>
          </nav>

          <div className={styles.start}>
            <h2 className={styles.heading}>خطوتك نحو عيادة أكثر تنظيمًا</h2>
            <p>اختر الباقة التي تناسب عيادتك.</p>
            <a href="#pricing" className={styles.button}>
              اشترك الآن <span aria-hidden="true">&#8592;</span>
            </a>
          </div>
        </div>

        <div className={styles.bottom}>
          <p>© {year} كيرفلو. جميع الحقوق محفوظة.</p>
          <span>إدارة أسهل. رعاية أفضل.</span>
        </div>
      </div>
    </footer>
  );
}
