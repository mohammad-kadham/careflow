import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import styles from './staff-buzzer.module.css';

export default function EntryControl({ onStaffStatus }) {
    const [paused, setPaused] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const pending = useRef(false);
    const revision = useRef(0);

    useEffect(() => {
        let stopped = false;
        let timer;
        let controller;
        async function refresh() {
            if (!pending.current) {
                const request = ++revision.current;
                controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 8000);
                try {
                    const response = await apiFetch('/user/entry-state', { signal: controller.signal });
                    if (!response.ok) throw new Error();
                    const result = await response.json();
                    if (typeof result.paused !== 'boolean') throw new Error();
                    if (!stopped && request === revision.current) {
                        setPaused(result.paused);
                        onStaffStatus?.(result.staff || null);
                        setError('');
                    }
                } catch {
                    if (!stopped && request === revision.current) {
                        setError('تعذر التحقق من حالة الدخول. جارٍ إعادة الاتصال…');
                        onStaffStatus?.(null);
                    }
                } finally { clearTimeout(timeout); }
            }
            if (!stopped) timer = setTimeout(refresh, 5000);
        }
        refresh();
        return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
    }, [onStaffStatus]);

    async function toggleEntry() {
        if (pending.current || paused === null) return;
        pending.current = true;
        ++revision.current;
        setSaving(true);
        setError('');
        try {
            const response = await apiFetch('/user/entry-state', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paused: !paused }),
            });
            const result = await response.json();
            if (!response.ok || typeof result.paused !== 'boolean') throw new Error();
            setPaused(result.paused);
        } catch {
            setError('تعذر تأكيد تغيير الحالة. تحقق من الاتصال ثم حاول مرة أخرى.');
        } finally { pending.current = false; setSaving(false); }
    }

    return <div className={styles.entryControl}>
        <div className={styles.buzzerMount}>
            <button type="button" className={`${styles.pushButton} ${styles.pauseButton} ${paused ? styles.resumeButton : ''}`}
                onClick={toggleEntry} disabled={saving || paused === null} aria-busy={saving}>
                <svg className={styles.bellIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    {paused ? <path d="M7 3v18l14-9z" /> : <path d="M5 3h5v18H5zM14 3h5v18h-5z" />}
                </svg>
                <span>{saving ? 'جارٍ التحديث…' : paused ? 'استئناف الدخول' : 'إيقاف الدخول'}</span>
            </button>
        </div>
        <p className={styles.entryStatus} role="status">{error || (paused === null ? 'جارٍ التحقق من الحالة…' : paused ? 'دخول المرضى متوقف' : 'دخول المرضى متاح')}</p>
    </div>;
}
