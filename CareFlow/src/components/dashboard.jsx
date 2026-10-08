import PatientsQueue from './patients-queue';
import { DoctorBuzzer } from './staff-buzzer';
import styles from './dashboard.module.css';

export default function Dashboard({ user, onOpenVisit, queueRevision }) {
    const isDoctor = user?.role === 'doctor';
    const dashboard = useRef(null);
    const consolePanel = useRef(null);

    useEffect(() => {
        if (!isDoctor || !consolePanel.current) return;
        const panel = consolePanel.current;
        const updateHeight = () => dashboard.current?.style.setProperty('--console-height', `${panel.getBoundingClientRect().height}px`);
        updateHeight();
        const observer = new ResizeObserver(updateHeight);
        observer.observe(panel);
        return () => observer.disconnect();
    }, [isDoctor]);

    return <main ref={dashboard} className={`${styles.dashboard} ${isDoctor ? styles.doctorDashboard : ''}`}>
        <div ref={consolePanel} className={isDoctor ? styles.doctorConsole : undefined}>
        <header className={styles.header}>
            <div className={styles.intro}>
                <p className={styles.greeting}>أهلاً بك{user?.name && <>، <bdi>{user.name}</bdi></>}</p>
                <p className={styles.eyebrow}>كيرفلو / {isDoctor ? 'حساب الطبيب' : 'حساب الموظف'}</p>
                {user?.clinic_name && <p className={styles.eyebrow}><bdi>{user.clinic_name}</bdi></p>}
                <h1>لوحة التحكم</h1>
                <p className={styles.description}>{isDoctor ? 'تابع قائمة الانتظار وأرسل نداءً إلى الموظف.' : 'سجّل بيانات المرضى وأضفهم إلى قائمة انتظار العيادة.'}</p>
            </div>
        </header>
        {isDoctor && <section className={styles.consoleControls} aria-label="نداء الموظف والتحكم بالدخول">
            <DoctorBuzzer />
        </section>}
        </div>
        <PatientsQueue key={queueRevision} canCloseClinic={isDoctor} onOpenVisit={isDoctor ? onOpenVisit : undefined} />
    </main>;
}
import { useEffect, useRef } from 'react';
