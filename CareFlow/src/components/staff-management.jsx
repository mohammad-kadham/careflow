import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import layout from './main.module.css';
import styles from './add-patient.module.css';

export default function StaffManagement() {
    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [reload, setReload] = useState(0);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState(null);
    const savingRef = useRef(false);

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                const response = await apiFetch('/user/staff', { signal: controller.signal });
                if (!response.ok) throw new Error();
                const result = await response.json();
                if (!Array.isArray(result.staff)) throw new Error();
                if (!controller.signal.aborted) setStaff(result.staff);
            } catch {
                if (!controller.signal.aborted) setLoadError('تعذر تحميل حساب الموظف. حاول مرة أخرى.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }
        load();
        return () => controller.abort();
    }, [reload]);

    function refresh() {
        setLoadError(''); setLoading(true); setReload(value => value + 1);
    }

    async function save(event) {
        event.preventDefault();
        if (savingRef.current) return;
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        const data = {
            name: values.name.trim(), email: values.email.trim(),
            phone: values.phone.trim(), password: values.password,
        };
        if (!data.name || !data.phone || data.password.length < 6 || new TextEncoder().encode(data.password).length > 72) {
            setFeedback({ error: true, text: 'تحقق من الاسم والهاتف وكلمة السر. استخدم كلمة سر من 6 أحرف على الأقل وبطول مناسب.' });
            return;
        }
        if (data.password !== values.confirm_password) {
            setFeedback({ error: true, text: 'يجب أن تتطابق كلمتا السر.' });
            return;
        }
        savingRef.current = true; setSaving(true); setFeedback(null);
        try {
            const response = await apiFetch('/user/staff', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
            });
            const result = await response.json().catch(() => null);
            if (!response.ok) {
                if (result?.code === 'STAFF_LIMIT' || result?.code === 'ACCOUNT_CONFLICT') refresh();
                throw new Error(response.status === 400 ? 'يرجى التحقق من بيانات الموظف.'
                    : [403, 409].includes(response.status) && result?.error ? result.error : 'تعذر إنشاء حساب الموظف.');
            }
            if (!result?.user?.id) throw new Error('تعذر تأكيد إنشاء الحساب. حدّث القائمة قبل إعادة المحاولة.');
            form.reset();
            setStaff([result.user]);
            setFeedback({ error: false, text: 'تم إنشاء حساب الموظف. يمكنه الآن تسجيل الدخول ببريده وكلمة السر التي حددتها.' });
        } catch (error) {
            setFeedback({ error: true, text: error instanceof TypeError
                ? 'تعذر تأكيد إنشاء الحساب. حدّث القائمة قبل إعادة المحاولة.' : error.message });
        } finally {
            savingRef.current = false; setSaving(false);
        }
    }

    return <>
        <header className={layout.header}>
            <p className={layout.eyebrow}>إدارة العيادة</p>
            <h1 className={layout.title}>إدارة الموظفين</h1>
            <p className={layout.description}>أنشئ حساب موظف لتسجيل بيانات المرضى وإضافتهم إلى قائمة الانتظار.</p>
        </header>
        <section className={styles.card} aria-labelledby="staff-title">
            <div className={styles.cardHeader}>
                <h2 id="staff-title">حساب الموظف</h2><span className={styles.badge}>حساب واحد لكل طبيب</span>
            </div>
            <div className={styles.form}>
                {feedback && <p className={feedback.error ? styles.error : styles.success} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
                {loading ? <p className={styles.hint} role="status">جارٍ التحميل…</p>
                    : loadError ? <p className={styles.error} role="alert">{loadError}</p>
                    : staff.length > 0 ? staff.map(account => <div key={account.id} className={styles.fullWidth}>
                        <h3><bdi>{account.name}</bdi></h3>
                        <p>البريد الإلكتروني: <bdi>{account.email}</bdi></p>
                        <p>الهاتف: <bdi>{account.phone || 'غير مسجل'}</bdi></p>
                        <p className={styles.hint}>الصلاحيات: بيانات المرضى الأساسية وقائمة الانتظار. المعلومات الطبية والزيارات متاحة للطبيب فقط.</p>
                    </div>) : <p className={styles.hint}>لم تُنشئ حساب موظف بعد. سيرتبط الحساب بعيادتك تلقائياً.</p>}
                <div className={styles.actions}>
                    <button className={styles.reset} type="button" disabled={loading || saving} onClick={refresh}>تحديث القائمة</button>
                </div>
            </div>
            {!loading && !loadError && staff.length === 0 && <form className={styles.form} onSubmit={save} aria-busy={saving}>
                <fieldset className={styles.fields} disabled={saving}>
                    <legend className={styles.legend}>إضافة موظف</legend>
                    <div className={styles.field}>
                        <label htmlFor="staff-name">اسم الموظف</label>
                        <input id="staff-name" name="name" maxLength={100} autoComplete="off" required />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="staff-email">البريد الإلكتروني</label>
                        <input id="staff-email" name="email" type="email" dir="ltr" maxLength={255} autoComplete="off" required />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="staff-phone">رقم الهاتف</label>
                        <input id="staff-phone" name="phone" type="tel" dir="ltr" maxLength={40} autoComplete="off" required />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="staff-password">كلمة السر</label>
                        <input id="staff-password" name="password" type="password" autoComplete="new-password" minLength={6} required />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="staff-confirm">تأكيد كلمة السر</label>
                        <input id="staff-confirm" name="confirm_password" type="password" autoComplete="new-password" required />
                    </div>
                </fieldset>
                <div className={styles.actions}>
                    <button className={styles.save} type="submit" disabled={saving}>{saving ? 'جارٍ الإنشاء…' : 'إنشاء حساب الموظف'}</button>
                </div>
            </form>}
        </section>
    </>;
}
