import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import styles from './dashboard.module.css';
import PatientsRow from './patient-row';

export default function PatientsQueue({ onOpenVisit, canCloseClinic = false }) {
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    const [opening, setOpening] = useState(null);
    const [openError, setOpenError] = useState('');
    const [closing, setClosing] = useState(false);
    const [closeMessage, setCloseMessage] = useState('');
    const closingRef = useRef(false);
    const queueVersion = useRef(0);
    const openingRef = useRef(false);
    const autoRefresh = !onOpenVisit;
    const waitingCount = patients.filter(patient => !patient.visitCompleted).length;

    useEffect(() => {
        let controller;
        let timer;
        let stopped = false;
        async function load() {
            const version = queueVersion.current;
            controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            try {
                const response = await apiFetch('/in-queue', { signal: controller.signal });
                if (!response.ok) throw new Error();
                const result = await response.json();
                if (!Array.isArray(result.patients)) throw new Error();
                if (!stopped && version === queueVersion.current) { setPatients(result.patients); setError(''); }
            } catch {
                if (!stopped && version === queueVersion.current) setError('تعذر تحديث قائمة الانتظار. البيانات المعروضة قديمة؛ جارٍ إعادة المحاولة.');
            } finally {
                clearTimeout(timeout);
                if (!stopped) {
                    setLoading(false);
                    if (autoRefresh) timer = setTimeout(load, 3000);
                }
            }
        }
        load();
        return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
    }, [reload, autoRefresh]);

    async function openVisit(patientId, name) {
        if (openingRef.current || closingRef.current) return;
        openingRef.current = true;
        setOpening(patientId);
        setOpenError('');
        try {
            const response = await apiFetch(`/in-queue/${patientId}/open-visit`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
            });
            if (!response.ok) {
                const result = await response.json().catch(() => null);
                throw new Error(result?.error || 'تعذر فتح الزيارة. حاول مرة أخرى.');
            }
            onOpenVisit(patientId, name);
        } catch (failure) {
            setOpenError(failure instanceof TypeError ? 'تعذر الاتصال بالخادم. حاول مرة أخرى.' : failure.message);
        } finally { openingRef.current = false; setOpening(null); }
    }

    async function closeClinic() {
        if (closingRef.current || openingRef.current) return;
        if (!window.confirm('هل تريد إغلاق العيادة وإفراغ قائمة الانتظار؟\nستبقى سجلات المرضى والزيارات المحفوظة دون تغيير.')) return;
        closingRef.current = true;
        queueVersion.current++;
        setClosing(true);
        setOpenError('');
        setCloseMessage('');
        try {
            const response = await apiFetch('/in-queue', {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}',
            });
            if (!response.ok) {
                const result = await response.json().catch(() => null);
                throw new Error(result?.error || 'تعذر إغلاق العيادة. حاول مرة أخرى.');
            }
            queueVersion.current++;
            setPatients([]);
            setError('');
            setCloseMessage('تم إغلاق العيادة وإفراغ قائمة الانتظار.');
            setReload(value => value + 1);
        } catch (failure) {
            setOpenError(failure instanceof TypeError ? 'تعذر الاتصال بالخادم. حاول مرة أخرى.' : failure.message);
        } finally {
            closingRef.current = false;
            setClosing(false);
        }
    }

    return <section className={styles.panel} aria-labelledby="queue-title">
        <div className={styles.panelHeader}>
            <h2 id="queue-title">قائمة انتظار العيادة</h2>
            <div className={styles.queueActions}>
                {!loading && !error && <span className={styles.count} aria-label={`عدد المرضى في الانتظار: ${waitingCount}`}>{String(waitingCount).padStart(2, '0')}</span>}
                {canCloseClinic && <button type="button" className={`${styles.button} ${styles.closeClinic}`}
                    disabled={loading || closing || opening !== null} aria-busy={closing} onClick={closeClinic}>
                    {closing ? 'جارٍ إغلاق العيادة…' : 'إغلاق العيادة'}
                </button>}
                <button type="button" className={styles.button} disabled={loading || closing}
                    onClick={() => { setLoading(true); setError(''); setReload(value => value + 1); }}>
                    {loading ? 'جارٍ التحديث…' : error ? 'إعادة المحاولة' : 'تحديث القائمة'}
                </button>
            </div>
        </div>
        {openError && <p className={styles.queueNotice} role="alert">{openError}</p>}
        {closeMessage && <p className={styles.queueSuccess} role="status">{closeMessage}</p>}
        {!loading && error && <p className={styles.queueNotice} role="alert">{error}</p>}
        {loading ? <p className={styles.message} role="status">جارٍ التحميل…</p>
            : error && patients.length === 0 ? null
            : patients.length === 0 ? <p className={styles.message}>لا يوجد مرضى في الانتظار. أضف المرضى من سجل المرضى.</p>
            : <ul className={styles.list}>
                {patients.map((patient, index) => <PatientsRow key={patient.id}
                    patient={{ ...patient, queue: index + 1, recordNumber: patient.id }}
                    onOpenVisit={onOpenVisit ? openVisit : undefined} opening={opening === patient.id} disabled={opening !== null || closing} />)}
            </ul>}
    </section>;
}
