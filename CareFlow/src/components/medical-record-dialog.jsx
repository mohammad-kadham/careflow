import { useEffect, useId, useRef, useState } from 'react';
import { apiFetch } from '../api';
import { createPortal } from 'react-dom';
import styles from './medical-record-dialog.module.css';

export default function MedicalRecordDialog({ patient, onClose }) {
    const dialogRef = useRef(null);
    const titleId = useId();
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    const [visits, setVisits] = useState([]);
    const [visitsLoading, setVisitsLoading] = useState(true);
    const [visitsError, setVisitsError] = useState('');
    const [visitsReload, setVisitsReload] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        async function loadVisits() {
            try {
                const response = await apiFetch(`/patients/${encodeURIComponent(patient.id)}/visits`, {
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error();
                const result = await response.json();
                if (!Array.isArray(result.visits)) throw new Error();
                if (!controller.signal.aborted) setVisits(result.visits);
            } catch {
                if (!controller.signal.aborted) setVisitsError('تعذر تحميل الزيارات. حاول مرة أخرى.');
            } finally {
                if (!controller.signal.aborted) setVisitsLoading(false);
            }
        }
        loadVisits();
        return () => controller.abort();
    }, [patient.id, visitsReload]);

    useEffect(() => {
        const dialog = dialogRef.current;
        dialog.showModal();
        return () => dialog.close();
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                const response = await apiFetch(`/patients/${encodeURIComponent(patient.id)}`, {
                    signal: controller.signal,
                });
                if (response.status === 404) throw new Error('لم يتم العثور على المريض.');
                if (!response.ok) throw new Error('تعذر تحميل السجل الطبي. حاول مرة أخرى.');
                const result = await response.json();
                if (!Array.isArray(result.patient?.medicalRecords)) throw new Error('استجابة السجل الطبي غير صالحة.');
                if (!controller.signal.aborted) setRecords(result.patient.medicalRecords);
            } catch (failure) {
                if (!controller.signal.aborted) setError(failure instanceof TypeError
                    ? 'تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مرة أخرى.' : failure.message);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        load();
        return () => controller.abort();
    }, [patient.id, reload]);

    return createPortal(<dialog ref={dialogRef} className={styles.dialog} dir="rtl"
        aria-labelledby={titleId} onClose={() => { if (!dialogRef.current?.open) onClose(); }}>
        <header className={styles.header}>
            <div><h2 id={titleId}>السجل الطبي والزيارات</h2><p><bdi>{patient.name}</bdi> — رقم الملف: {patient.id}</p></div>
            <button type="button" className={styles.button} onClick={() => dialogRef.current.close()}>إغلاق</button>
        </header>
        <div className={styles.content} aria-busy={loading}>
            {loading ? <p role="status">جارٍ تحميل السجل الطبي…</p>
                : error ? <div><p role="alert">{error}</p>
                    <button type="button" className={styles.button} onClick={() => {
                        setLoading(true); setError(''); setReload(value => value + 1);
                    }}>إعادة المحاولة</button></div>
                : records.length === 0 ? <p>لا توجد معلومات طبية مسجلة لهذا المريض.</p>
                : records.map(record => <section key={record.id} className={styles.record} aria-label={`سجل طبي ${record.id}`}>
                    <h3>سجل طبي #{record.id}</h3>
                    <dl className={styles.details}>
                        {[
                            ['فصيلة الدم', record.bloodType], ['الطول (سم)', record.heightCm],
                            ['الوزن (كغم)', record.weightKg], ['الحساسية', record.allergies],
                            ['الأمراض المزمنة', record.chronicConditions], ['ملاحظات', record.notes],
                        ].map(([label, value]) => <div key={label}>
                            <dt>{label}</dt><dd><bdi>{value === null || value === undefined || value === '' ? 'غير مسجل' : value}</bdi></dd>
                        </div>)}
                    </dl>
                </section>)}
        </div>
        <section className={`${styles.content} ${styles.visits}`} aria-label="سجل الزيارات" aria-busy={visitsLoading}>
            <h3>سجل الزيارات</h3>
            {visitsLoading ? <p role="status">جارٍ تحميل الزيارات…</p>
                : visitsError ? <div><p role="alert">{visitsError}</p>
                    <button type="button" className={styles.button} onClick={() => {
                        setVisitsLoading(true); setVisitsError(''); setVisitsReload(value => value + 1);
                    }}>إعادة المحاولة</button></div>
                : visits.length === 0 ? <p>لا توجد زيارات مسجلة لهذا المريض.</p>
                : visits.map(visit => <details key={visit.id} className={styles.visit}>
                    <summary>زيارة #{visit.id} — <bdi>{visit.visitDate}</bdi></summary>
                    <dl className={styles.details}>
                        {[
                            ['الأعراض', visit.symptoms], ['ملاحظات الفحص', visit.examinationNotes],
                            ['التشخيص', visit.diagnosis], ['العلاج', visit.treatment],
                            ['الأدوية', visit.medications], ['تاريخ المتابعة', visit.followUpDate],
                            ['ملاحظات', visit.notes],
                        ].map(([label, value]) => <div key={label}>
                            <dt>{label}</dt><dd><bdi>{value || 'غير مسجل'}</bdi></dd>
                        </div>)}
                    </dl>
                </details>)}
        </section>
    </dialog>, document.body);
}
