import styles from "./patient-row.module.css";

export default function PatientsRow({ patient }) {
    return <li className={styles.row}>
        <div className={styles.identity}>
            <svg className={styles.avatar} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" focusable="false">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
            </svg>
            <div className={styles.nameBlock}>
                <span className={styles.label}>اسم المريض</span>
                <p className={styles.name}><bdi>{patient.name}</bdi></p>
            </div>
        </div>
        <dl className={styles.details}>
            <div className={styles.field}>
                <dt className={styles.label}>رقم الدور</dt>
                <dd className={styles.queue}><bdi>{patient.queue}</bdi></dd>
            </div>
            <div className={styles.field}>
                <dt className={styles.label}>رقم السجل</dt>
                <dd className={styles.record}><bdi>{patient.recordNumber}</bdi></dd>
            </div>
            <div className={styles.field}>
                <dt className={styles.label}>الحالة</dt>
                <dd className={styles.status}><bdi>{patient.status}</bdi></dd>
            </div>
        </dl>
    </li>;
}
