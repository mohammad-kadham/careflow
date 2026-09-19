import styles from "./main.module.css";
import PatientsQueue from "./patients-queue";

export default function Main() {
    return <main className={styles.main}>
        <header className={styles.header}>
            <p className={styles.eyebrow}>مساحة العمل</p>
            <h1 className={styles.title}>لوحة التحكم</h1>
            <p className={styles.description}>أهلاً بك في كيرفلو، مساحة إدارة عيادتك.</p>
        </header>
        <div className={styles.sections}>
            <section className={styles.card} aria-labelledby="overview-title">
                <div className={styles.cardHeader}>
                    <h2 id="overview-title">نظرة عامة</h2>
                    <span className={styles.badge}>العيادة</span>
                </div>
                <div className={styles.placeholder}>
                    <span className={styles.symbol} aria-hidden="true">＋</span>
                    <p>مساحة ملخص العيادة</p>
                    <p className={styles.hint}>ستظهر هنا إحصائيات العيادة عند ربط البيانات.</p>
                </div>
            </section>
           <PatientsQueue/>
        </div>
    </main>;
}
