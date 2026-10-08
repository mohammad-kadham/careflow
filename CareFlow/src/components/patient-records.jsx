import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import layout from './main.module.css';
import styles from './patient-records.module.css';
import MedicalRecordDialog from './medical-record-dialog';

export default function PatientRecords({ canViewMedical = false }) {
    const [medicalPatient, setMedicalPatient] = useState(null);
    const [patients, setPatients] = useState([]);
    const [queued, setQueued] = useState(new Set());
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [feedback, setFeedback] = useState(null);
    const [saving, setSaving] = useState(null);
    const [reload, setReload] = useState(0);
    const savingRef = useRef(false);

    useEffect(() => {
        if (!search.trim()) return;
        const controller = new AbortController();
        async function load() {
            try {
                const query = new URLSearchParams({ q: search.trim() });
                const response = await apiFetch(`/patients?${query}`, { signal: controller.signal });
                if (!response.ok) throw new Error();
                const records = await response.json();
                if (!Array.isArray(records.patients)) throw new Error();
                if (controller.signal.aborted) return;
                setPatients(records.patients);
                setQueued(new Set(records.patients.filter(patient => patient.inQueue).map(patient => patient.id)));
            } catch {
                if (!controller.signal.aborted) setLoadError('تعذر تحميل سجل المرضى. حاول مرة أخرى.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        const timer = setTimeout(load, 300);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [search, reload]);

    function changeSearch(event) {
        const value = event.target.value;
        setSearch(value);
        setPatients([]);
        setQueued(new Set());
        setLoading(Boolean(value.trim()));
        setLoadError('');
        setFeedback(null);
    }

    async function addToQueue(patient) {
        if (savingRef.current) return;
        savingRef.current = true;
        setSaving(patient.id);
        setFeedback(null);
        try {
            const response = await apiFetch('/in-queue', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patientId: patient.id }),
            });
            if (response.ok || response.status === 409) {
                setQueued(previous => new Set([...previous, patient.id]));
                setFeedback({ error: false, text: response.status === 409
                    ? 'المريض موجود في قائمة الانتظار بالفعل.'
                    : `تمت إضافة ${patient.name} إلى قائمة الانتظار.` });
            } else {
                const result = await response.json().catch(() => null);
                throw new Error(response.status === 404 ? result?.error : 'تعذر إضافة المريض إلى قائمة الانتظار.');
            }
        } catch (error) {
            setFeedback({ error: true, text: error.message === 'Failed to fetch'
                ? 'تعذر الاتصال بالخادم. تحقق من الاتصال وأعد المحاولة.'
                : error.message || 'تعذر إضافة المريض إلى قائمة الانتظار.' });
        } finally {
            savingRef.current = false;
            setSaving(null);
        }
    }

    return <>
        <header className={layout.header}>
            <p className={layout.eyebrow}>مساحة العمل</p>
            <h1 className={layout.title}>سجل المرضى</h1>
            <p className={layout.description}>ابحث عن مريض مسجل وأضفه إلى قائمة انتظار العيادة.</p>
        </header>
        <section className={styles.panel} aria-label="البحث في سجل المرضى">
            <div className={styles.search}>
                <label htmlFor="patient-search">البحث عن مريض</label>
                <input id="patient-search" type="search" value={search} maxLength={150} onChange={changeSearch}
                    placeholder="الاسم، رقم الملف، الهاتف أو المدينة" />
                {search.trim() && !loading && !loadError && <p role="status">عدد النتائج: {patients.length}</p>}
            </div>
            {feedback && <p className={styles.message} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
            {loading ? <p className={styles.message} role="status">جارٍ البحث…</p>
                : loadError ? <div className={styles.message}>
                    <p role="alert">{loadError}</p>
                    <button type="button" onClick={() => { setLoading(true); setLoadError(''); setReload(value => value + 1); }}>إعادة المحاولة</button>
                </div> : patients.length === 0 ? <p className={styles.message}>
                    {search.trim() ? 'لا توجد نتائج مطابقة للبحث.' : 'أدخل اسم المريض أو رقم الملف أو الهاتف أو المدينة للبحث.'}
                </p> : <ul className={styles.list}>
                    {patients.map(patient => <li key={patient.id} className={styles.row}>
                        <div><h2><bdi>{patient.name}</bdi></h2><p>رقم الملف: <bdi>{patient.id}</bdi></p></div>
                        <div><p>الهاتف: <bdi>{patient.phone || 'غير مسجل'}</bdi></p><p>المدينة: <bdi>{patient.city || 'غير مسجلة'}</bdi></p></div>
                        <div className={styles.actions}>
                        {canViewMedical && <button type="button" aria-haspopup="dialog" aria-label={`السجل الطبي للمريض ${patient.name}`}
                            onClick={() => setMedicalPatient(patient)}>السجل الطبي</button>}
                        <button type="button" disabled={queued.has(patient.id) || saving !== null}
                            aria-label={`إضافة ${patient.name} إلى قائمة الانتظار`} onClick={() => addToQueue(patient)}>
                            {saving === patient.id ? 'جارٍ الإضافة…' : queued.has(patient.id) ? 'في قائمة الانتظار' : '+ إضافة إلى الانتظار'}
                        </button>
                        </div>
                    </li>)}
                </ul>}
        </section>
        {canViewMedical && medicalPatient && <MedicalRecordDialog key={medicalPatient.id} patient={medicalPatient} onClose={() => setMedicalPatient(null)} />}
    </>;
}
