import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import pane from './visits.module.css';
import styles from './visit-history.module.css';

const fields = [
    ['symptoms', 'الأعراض'], ['examinationNotes', 'ملاحظات الفحص'],
    ['diagnosis', 'التشخيص'], ['treatment', 'العلاج'], ['medications', 'الأدوية'], ['notes', 'ملاحظات'],
];

export default function VisitHistory({ patientId, onVisitSaved }) {
    const [visits, setVisits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState(null);
    const savingRef = useRef(false);
    const endpoint = `/patients/${encodeURIComponent(patientId)}/visits`;

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                const response = await apiFetch(endpoint, { signal: controller.signal });
                if (!response.ok) throw new Error();
                const result = await response.json();
                if (!Array.isArray(result.visits)) throw new Error();
                if (!controller.signal.aborted) setVisits(result.visits);
            } catch {
                if (!controller.signal.aborted) setError('تعذر تحميل سجل الزيارات. أعد المحاولة.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        load();
        return () => controller.abort();
    }, [endpoint, reload]);

    function refreshHistory() {
        setLoading(true); setError(''); setReload(value => value + 1);
    }

    async function save(event) {
        event.preventDefault();
        if (savingRef.current) return;
        const form = event.currentTarget;
        const values = new FormData(form);
        const data = Object.fromEntries(fields.map(([field]) => [field, values.get(field).trim()]));
        data.followUpDate = values.get('followUpDate') || null;
        if (!fields.some(([field]) => data[field])) {
            setFeedback({ error: true, text: 'أدخل تفاصيل الزيارة في حقل واحد على الأقل.' });
            return;
        }
        savingRef.current = true; setSaving(true); setFeedback(null);
        try {
            const response = await apiFetch(endpoint, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
            });
            if (!response.ok) {
                const result = await response.json().catch(() => null);
                throw new Error([400, 404].includes(response.status) && result?.error
                    ? result.error : 'تعذر حفظ الزيارة. حاول مرة أخرى.');
            }
            onVisitSaved();
        } catch (failure) {
            setFeedback({ error: true, text: failure instanceof TypeError
                ? 'تعذر تأكيد الحفظ. حدّث سجل الزيارات قبل إعادة الإرسال لتجنب التكرار.' : failure.message });
        } finally {
            savingRef.current = false; setSaving(false);
        }
    }

    return <section className={pane.panel} aria-labelledby={`visit-workspace-title-${patientId}`}>
        <h2 className={pane.heading} id={`visit-workspace-title-${patientId}`}>الزيارة الحالية وسجل الزيارات</h2>
        <form className={styles.form} onSubmit={save} aria-busy={saving}>
            <fieldset disabled={saving} className={styles.fields}>
                <legend>تسجيل الزيارة الحالية</legend>
                <p className={styles.hint}>الحفظ يسجّل الزيارة ويُنهيها ويشطب رقم الدور في القائمة.</p>
                {fields.map(([field, label]) => <div className={styles.field} key={field}>
                    <label htmlFor={`visit-${patientId}-${field}`}>{label}</label>
                    <textarea id={`visit-${patientId}-${field}`} name={field} rows={3} maxLength={5000} />
                </div>)}
                <div className={styles.field}>
                    <label htmlFor={`visit-follow-up-${patientId}`}>تاريخ المتابعة</label>
                    <input id={`visit-follow-up-${patientId}`} name="followUpDate" type="date" dir="ltr" />
                </div>
            </fieldset>
            {feedback && <p className={feedback.error ? styles.error : styles.success} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
            <div className={styles.actions}>
                <button type="submit" className={pane.button} disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ الزيارة'}</button>
                <button type="reset" className={pane.button} disabled={saving} onClick={() => setFeedback(null)}>مسح الحقول</button>
            </div>
        </form>
        <section className={pane.medicalSection} aria-labelledby={`visit-history-title-${patientId}`}>
            <div className={styles.historyHeader}>
                <h3 id={`visit-history-title-${patientId}`}>جميع الزيارات</h3>
                <button type="button" className={pane.button} disabled={loading} onClick={refreshHistory}>تحديث السجل</button>
            </div>
            {loading ? <p className={pane.message} role="status">جارٍ تحميل الزيارات…</p>
                : error ? <p className={styles.error} role="alert">{error}</p>
                : visits.length === 0 ? <p className={pane.message}>لا توجد زيارات مسجلة لهذا المريض.</p>
                : <div className={styles.history}>
                    {visits.map(visit => <details className={styles.visit} key={visit.id}>
                        <summary>زيارة #{visit.id} — <bdi>{visit.visitDate}</bdi></summary>
                        <dl>
                            {fields.map(([field, label]) => <div key={field}><dt>{label}</dt><dd>{visit[field] || 'غير مسجل'}</dd></div>)}
                            <div><dt>تاريخ المتابعة</dt><dd><bdi>{visit.followUpDate || 'غير محدد'}</bdi></dd></div>
                        </dl>
                    </details>)}
                </div>}
        </section>
    </section>;
}
