import { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import layout from './main.module.css';
import styles from './visits.module.css';
import VisitHistory from './visit-history';

const genders = { male: 'ذكر', female: 'أنثى', other: 'آخر', 'prefer-not-to-say': 'يفضل عدم الإفصاح' };

function Details({ entries }) {
    return <dl className={styles.details}>
        {entries.map(([label, value]) => <div key={label}>
            <dt>{label}</dt>
            <dd><bdi>{value === null || value === undefined || value === '' ? 'غير مسجل' : value}</bdi></dd>
        </div>)}
    </dl>;
}

export default function Visits({ patientId, onVisitSaved }) {
    const [patient, setPatient] = useState(null);
    const [loading, setLoading] = useState(Boolean(patientId));
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);

    useEffect(() => {
        if (!patientId) return;
        const controller = new AbortController();
        async function load() {
            try {
                const response = await apiFetch(`/patients/${encodeURIComponent(patientId)}`, {
                    signal: controller.signal,
                });
                if (response.status === 404) throw new Error('لم يتم العثور على سجل المريض.');
                if (!response.ok) throw new Error('تعذر تحميل بيانات المريض والسجل الطبي.');
                const result = await response.json();
                if (!result.patient || !Array.isArray(result.patient.medicalRecords)) {
                    throw new Error('استجابة بيانات المريض غير صالحة.');
                }
                if (!controller.signal.aborted) setPatient(result.patient);
            } catch (failure) {
                if (!controller.signal.aborted) setError(failure instanceof TypeError
                    ? 'تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مرة أخرى.' : failure.message);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        load();
        return () => controller.abort();
    }, [patientId, reload]);

    return <>
        <header className={layout.header}>
            <p className={layout.eyebrow}>مساحة العمل</p>
            <h1 className={layout.title}>الزيارات</h1>
            <p className={layout.description}>بيانات المريض وسجله الطبي لمراجعتها أثناء الزيارة.</p>
        </header>
        {!patientId ? <div className={`${styles.panel} ${styles.placeholder}`}>
            <p>اختر مريضاً من قائمة الانتظار واضغط «فتح الزيارة» لعرض بياناته.</p>
        </div> : loading ? <p className={`${styles.panel} ${styles.placeholder}`} role="status">جارٍ تحميل بيانات المريض…</p>
            : error ? <div className={`${styles.panel} ${styles.placeholder}`}>
                <p role="alert">{error}</p>
                <button type="button" className={styles.button} onClick={() => {
                    setLoading(true); setError(''); setPatient(null); setReload(value => value + 1);
                }}>إعادة المحاولة</button>
            </div> : patient && <div className={styles.workspace}>
                <section className={styles.panel} aria-labelledby={`visit-patient-title-${patientId}`}>
                    <h2 id={`visit-patient-title-${patientId}`} className={styles.heading}><bdi>{patient.name}</bdi> — بيانات المريض والسجل الطبي</h2>
                    <Details entries={[
                        ['رقم الملف', patient.id],
                        ['تاريخ الميلاد', patient.dateOfBirth?.split('T')[0]],
                        ['الجنس', genders[patient.gender] || patient.gender],
                        ['الهاتف', patient.phone], ['العنوان', patient.address],
                        ['المدينة', patient.city], ['البلد', patient.country],
                        ['جهة اتصال الطوارئ', patient.emergencyContactName],
                        ['صلة القرابة أو العلاقة', patient.emergencyContactRelationship],
                        ['هاتف الطوارئ', patient.emergencyContactPhone],
                    ]} />
                <section className={styles.medicalSection} aria-labelledby={`visit-medical-title-${patientId}`}>
                    <h3 id={`visit-medical-title-${patientId}`} className={styles.subheading}>المعلومات الطبية</h3>
                    {patient.medicalRecords.length === 0
                        ? <p className={styles.message}>لا توجد معلومات طبية مسجلة لهذا المريض.</p>
                        : patient.medicalRecords.map(record => <section key={record.id} className={styles.medicalRecord} aria-label={`السجل الطبي ${record.id}`}>
                            <Details entries={[
                                ['رقم السجل الطبي', record.id], ['فصيلة الدم', record.bloodType],
                                ['الطول (سم)', record.heightCm], ['الوزن (كغم)', record.weightKg],
                                ['الحساسية', record.allergies], ['الأمراض المزمنة', record.chronicConditions],
                                ['ملاحظات', record.notes],
                            ]} />
                        </section>)}
                </section>
                </section>
                <VisitHistory key={patient.id} patientId={patient.id} onVisitSaved={onVisitSaved} />
            </div>}
    </>;
}
