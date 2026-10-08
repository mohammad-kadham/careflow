import { useRef, useState } from "react";
import { apiFetch } from '../api';
import layout from "./main.module.css";
import styles from "./add-patient.module.css";

export default function AddPatient({ canEditMedical = false }) {
    const [isSaving, setIsSaving] = useState(false);
    const [feedback, setFeedback] = useState(null);
    const savingRef = useRef(false);
    const today = new Date();
    const maxDateOfBirth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    async function handleSubmit(event) {
        event.preventDefault();
        if (savingRef.current) return;

        const form = event.currentTarget;
        const values = new FormData(form);
        const name = values.get('name').trim();
        const details = Object.fromEntries([
            'dateOfBirth', 'address', 'city', 'country', 'phone', 'gender',
            'emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone',
        ].map(field => [field, values.get(field).trim()]));
        for (const field of canEditMedical ? ['bloodType', 'allergies', 'chronicConditions', 'notes'] : []) {
            details[field] = values.get(field).trim() || null;
        }
        for (const field of canEditMedical ? ['heightCm', 'weightKg'] : []) {
            details[field] = values.get(field) === '' ? null : Number(values.get(field));
        }

        if (!name) {
            setFeedback({ type: 'error', text: 'يرجى إدخال اسم المريض.' });
            return;
        }

        savingRef.current = true;
        setIsSaving(true);
        setFeedback(null);

        try {
            const response = await apiFetch('/patients/new', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, ...details }),
            });

            if (!response.ok) {
                if (response.status === 400) {
                    const result = await response.json().catch(() => null);
                    setFeedback({ type: 'error', text: result?.error || 'يرجى التحقق من بيانات المريض.' });
                    return;
                }
                throw new Error('Patient save failed');
            }

            form.reset();
            setFeedback({ type: 'success', text: 'تمت إضافة المريض إلى سجل المرضى بنجاح.' });
        } catch {
            setFeedback({ type: 'error', text: 'تعذر تأكيد حفظ المريض. تحقق من اتصال الخادم وقائمة المرضى قبل إعادة المحاولة.' });
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    }

    return <>
        <header className={layout.header}>
            <p className={layout.eyebrow}>مساحة العمل</p>
            <h1 className={layout.title}>إضافة مريض</h1>
            <p className={layout.description}>أدخل بيانات المريض لإضافته إلى سجل المرضى.</p>
        </header>
        <section className={styles.card} aria-labelledby="patient-form-title">
            <div className={styles.cardHeader}>
                <h2 id="patient-form-title">بيانات المريض</h2>
                <span className={styles.badge}>مريض جديد</span>
            </div>
            <form className={styles.form} onSubmit={handleSubmit} aria-busy={isSaving}>
                <p className={styles.hint}>الحقول المعلّمة بـ * مطلوبة، وبقية التفاصيل اختيارية.</p>
                <fieldset className={styles.fields} disabled={isSaving}>
                    <legend className={styles.legend}>معلومات المريض</legend>
                    <div className={`${styles.field} ${styles.fullWidth}`}>
                        <label htmlFor="patient-name">اسم المريض *</label>
                        <input id="patient-name" name="name" type="text" placeholder="أدخل الاسم الكامل" autoComplete="off" maxLength={120} required />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="patient-birth-date">تاريخ الميلاد</label>
                        <input id="patient-birth-date" name="dateOfBirth" type="date" dir="ltr" autoComplete="off" max={maxDateOfBirth} />
                    </div>
                </fieldset>
                <fieldset className={styles.fields} disabled={isSaving}>
                    <legend className={styles.legend}>العنوان وبيانات التواصل</legend>
                    <div className={`${styles.field} ${styles.fullWidth}`}>
                        <label htmlFor="patient-address">العنوان</label>
                        <input id="patient-address" name="address" type="text" autoComplete="off" placeholder="الشارع، الحي، رقم المنزل" maxLength={250} />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="patient-city">المدينة</label>
                        <input id="patient-city" name="city" type="text" autoComplete="off" maxLength={100} />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="patient-country">البلد</label>
                        <input id="patient-country" name="country" type="text" autoComplete="off" maxLength={100} />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="patient-phone">رقم الهاتف</label>
                        <input id="patient-phone" name="phone" type="tel" dir="ltr" autoComplete="off" placeholder="+964 …" maxLength={40} />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="patient-gender">الجنس</label>
                        <select id="patient-gender" name="gender" defaultValue="">
                            <option value="">اختر الجنس</option>
                            <option value="male">ذكر</option>
                            <option value="female">أنثى</option>
                            <option value="other">آخر</option>
                            <option value="prefer-not-to-say">يفضل عدم الإفصاح</option>
                        </select>
                    </div>
                </fieldset>
                <fieldset className={styles.fields} disabled={isSaving}>
                    <legend className={styles.legend}>جهة الاتصال في حالات الطوارئ</legend>
                    <div className={`${styles.field} ${styles.fullWidth}`}>
                        <label htmlFor="emergency-name">اسم جهة الاتصال</label>
                        <input id="emergency-name" name="emergencyContactName" type="text" autoComplete="off" maxLength={120} />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="emergency-relationship">صلة القرابة أو العلاقة</label>
                        <input id="emergency-relationship" name="emergencyContactRelationship" type="text" placeholder="مثال: أخ، أخت، صديق" maxLength={100} />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="emergency-phone">رقم هاتف الطوارئ</label>
                        <input id="emergency-phone" name="emergencyContactPhone" type="tel" dir="ltr" autoComplete="off" placeholder="+964 …" maxLength={40} />
                    </div>
                </fieldset>
                {canEditMedical && <fieldset className={`${styles.fields} ${styles.fullWidth}`} disabled={isSaving}>
                    <legend className={styles.legend}>المعلومات الطبية (اختيارية)</legend>
                    <div className={styles.field}>
                        <label htmlFor="blood-type">فصيلة الدم</label>
                        <select id="blood-type" name="bloodType" defaultValue="">
                            <option value="">غير معروفة</option>
                            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(type => <option key={type} value={type}>{type}</option>)}
                        </select>
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="height">الطول (سم)</label>
                        <input id="height" name="heightCm" type="number" min="0.01" max="999.99" step="0.01" dir="ltr" />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="weight">الوزن (كغم)</label>
                        <input id="weight" name="weightKg" type="number" min="0.01" max="999.99" step="0.01" dir="ltr" />
                    </div>
                    {[['allergies', 'الحساسية'], ['chronicConditions', 'الأمراض المزمنة'], ['notes', 'ملاحظات طبية']].map(([field, label]) =>
                        <div key={field} className={`${styles.field} ${styles.fullWidth}`}>
                            <label htmlFor={`medical-${field}`}>{label}</label>
                            <textarea id={`medical-${field}`} name={field} rows={3} maxLength={5000} />
                        </div>)}
                </fieldset>}
                {feedback && <p className={feedback.type === 'error' ? styles.error : styles.success}
                    role={feedback.type === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}
                <div className={styles.actions}>
                    <button className={styles.save} type="submit" disabled={isSaving}>
                        {isSaving ? 'جارٍ الحفظ…' : 'حفظ المريض'}
                    </button>
                    <button className={styles.reset} type="reset" disabled={isSaving} onClick={() => setFeedback(null)}>مسح الحقول</button>
                </div>
            </form>
        </section>
    </>;
}
