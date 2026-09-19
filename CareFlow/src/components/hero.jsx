import styles from "./hero.module.css";

export default function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.content}>
        <p className={styles.eyebrow}>
          <span className={styles.indicator} aria-hidden="true" />
          إدارة عيادتك ببساطة
        </p>
        <h1 id="hero-title" className={styles.title}>
          عيادة أكثر تنظيمًا.
          <span>ووقت أكبر للرعاية.</span>
        </h1>
        <p className={styles.description}>
          نظّم يوم عيادتك مع كيرفلو. طريقة أبسط لإدارة العمل،
          لتمنح مرضاك الاهتمام الذي يستحقونه.
        </p>
        <a href="#pricing" className={styles.button}>
          اختر باقتك <span aria-hidden="true">&#8592;</span>
        </a>
        <p className={styles.note}>باقات تبدأ من ١٥ دولارًا شهريًا</p>
        <div className={styles.signature} aria-hidden="true">
          <span /> إدارة أسهل. رعاية أفضل. <span />
        </div>
      </div>
    </section>
  );
}
