import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AppPage from './app-page';
import { demoUsers, resetDemo } from '../demo/api';
import styles from './demo.module.css';

export default function DemoPage() {
    const [params, setParams] = useSearchParams();
    const [revision, setRevision] = useState(0);
    const role = params.get('role') === 'staff' ? 'staff' : 'doctor';
    const navigate = useNavigate();
    const root = useRef(null);
    const banner = useRef(null);

    useEffect(() => {
        const update = () => root.current?.style.setProperty('--workspace-top', `${banner.current.getBoundingClientRect().height}px`);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(banner.current);
        return () => observer.disconnect();
    }, []);

    return <div ref={root} className={styles.demo} dir="rtl">
        <header ref={banner} className={styles.banner}>
            <div><strong>عرض تجريبي — بدون تسجيل</strong>
                <p>بيانات وهمية في هذه الصفحة فقط؛ تُمسح عند إعادة تحميلها. بدّل الحساب لتجربة النداء وإيقاف الدخول.</p></div>
            <nav aria-label="الحساب التجريبي">
                <button type="button" aria-pressed={role === 'doctor'} onClick={() => setParams({ role: 'doctor' })}>الطبيب</button>
                <button type="button" aria-pressed={role === 'staff'} onClick={() => setParams({ role: 'staff' })}>الموظف</button>
                <button type="button" onClick={() => { resetDemo(); setRevision(value => value + 1); }}>إعادة التجربة</button>
                <Link to="/login">الخروج من التجربة</Link>
            </nav>
        </header>
        <AppPage key={`${role}:${revision}`} user={demoUsers[role]} onLogout={() => navigate('/login')} />
    </div>;
}
