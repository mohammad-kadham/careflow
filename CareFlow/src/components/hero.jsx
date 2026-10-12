import styles from "./hero.module.css";
import { Link } from 'react-router-dom';

export default function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.content}>
        <p className={styles.eyebrow}>
          <span className={styles.indicator} aria-hidden="true" />
          برنامج إدارة العيادات في العراق
        </p>
        <h1 id="hero-title" className={styles.title}>
          إدارة عيادتك في مكان واحد.
          <span>ووقت أكبر للرعاية.</span>
        </h1>
        <p className={styles.description}>
          نظّم سجلات المرضى وقائمة الانتظار والزيارات مع كيرفلو.
          برنامج عربي يجمع عمل الطبيب والموظف، لتمنح مرضاك الاهتمام الذي يستحقونه.
        </p>
        <div className={styles.actions}>
        <a href="#pricing" className={styles.button}>
          اختر باقتك <span aria-hidden="true">&#8592;</span>
        </a>
        <Link to="/demo" className={`${styles.button} ${styles.demoButton}`}>جرّب بدون تسجيل</Link>
        </div>
        <p className={styles.note}>باقات تبدأ من ٢٢٬٥٠٠ دينار عراقي شهريًا</p>
        <div className={styles.signature} aria-hidden="true">
          <span /> إدارة أسهل. رعاية أفضل. <span />
        </div>
      </div>
    </section>
  );
}
