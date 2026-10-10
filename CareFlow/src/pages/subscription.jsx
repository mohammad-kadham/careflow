import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { manualPayment, selectedPlanId, subscriptionPlans } from '../billing';
import { apiFetch } from '../api';
import styles from './auth.module.css';
import billingStyles from './subscription.module.css';

export default function SubscriptionPage({ user, onLogout, loggingOut, logoutError }) {
    const [params, setParams] = useSearchParams();
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [reports, setReports] = useState([]);
    const [reportsError, setReportsError] = useState('');
    const [reportsLoading, setReportsLoading] = useState(true);
    const [reload, setReload] = useState(0);
    const submittingRef = useRef(false);
    const reportVersion = useRef(0);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const plan = subscriptionPlans.find(item => item.id === selectedPlanId(params.get('plan') || user.subscription?.plan));
    const active = user.subscription?.active === true;
    const isDoctor = user.role === 'doctor';

    useEffect(() => {
        if (!isDoctor) return;
        const controller = new AbortController();
        const version = reportVersion.current;
        async function load() {
            try {
                const response = await apiFetch('/user/payment-reports', { signal: controller.signal });
                if (!response.ok) throw new Error();
                const result = await response.json();
                if (!Array.isArray(result.reports)) throw new Error();
                if (!controller.signal.aborted && version === reportVersion.current) {
                    setReports(result.reports); setReportsError('');
                }
            } catch {
                if (!controller.signal.aborted) setReportsError('تعذر تحميل طلبات الدفع السابقة.');
            } finally { if (!controller.signal.aborted) setReportsLoading(false); }
        }
        load();
        return () => controller.abort();
    }, [isDoctor, user.clinic_id, active, reload]);

    async function submitPayment(event) {
        event.preventDefault();
        if (submittingRef.current) return;
        const form = new FormData(event.currentTarget);
        submittingRef.current = true;
        setSubmitting(true); setNotice(''); setError('');
        try {
            const response = await apiFetch('/user/payment-reports', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: plan.id, senderPhone: form.get('senderPhone'), transactionReference: form.get('transactionReference') }),
            });
            const result = await response.json().catch(() => null);
            if (!response.ok) throw new Error(result?.error || 'تعذر إرسال بيانات الدفع. حاول مرة أخرى.');
            if (!result?.report?.id) throw new Error('تعذر تأكيد استلام الطلب. يمكنك إعادة إرسال رقم العملية نفسه بأمان.');
            reportVersion.current++;
            setReports(previous => [result.report, ...previous.filter(item => item.id !== result.report.id)].slice(0, 20));
            setShowForm(false);
            setNotice(result.report.status === 'pending'
                ? `تم تسجيل طلب الدفع رقم ${result.report.id}. ستراجع الإدارة التحويل؛ إرسال الطلب لا يفعّل الاشتراك تلقائياً.`
                : `رقم العملية مسجل مسبقاً في الطلب ${result.report.id}. يمكنك الاطلاع على نتيجة المراجعة أدناه.`);
        } catch (failure) {
            setError(failure instanceof TypeError ? 'تعذر تأكيد استلام الطلب. تحقق من الاتصال وأعد إرسال رقم العملية نفسه؛ لن يتكرر الطلب.' : failure.message);
        } finally { submittingRef.current = false; setSubmitting(false); }
    }

    return <main className={styles.page} dir="rtl">
        <Link to="/" className={styles.brand}>كيرفلو<span>.</span></Link>
        <section className={`${styles.card} ${styles.signupCard}`} aria-labelledby="subscription-title">
            <header className={styles.intro}>
                <h1 id="subscription-title" className={styles.title}>{active ? 'اشتراك العيادة' : 'تفعيل اشتراك العيادة'}</h1>
                <p className={styles.description}>{active ? user.subscription?.required === false
                    ? 'حساب عيادتك الحالي متاح. يمكنك متابعة استخدام مساحة العمل أو الاشتراك بإحدى الباقات أدناه.'
                    : 'اشتراكك مفعّل. يمكنك استخدام مساحة العمل أو تجديد الاشتراك يدوياً.'
                    : isDoctor ? 'حوّل مبلغ الاشتراك عبر Qi Card. يتفعّل حساب العيادة بعد استلام التحويل ومراجعته.'
                        : 'اشتراك العيادة غير مفعّل. يرجى التواصل مع الطبيب لتجديده أو تفعيله.'}</p>
                {user.subscription?.expiresAt && <p className={styles.description}>نهاية الاشتراك: <bdi>{new Date(user.subscription.expiresAt).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' })}</bdi> (توقيت بغداد)</p>}
            </header>
            <dl className={billingStyles.details}>
                <div><dt>العيادة</dt><dd>{user.clinic_name}</dd></div>
                <div><dt>رقم العيادة</dt><dd><bdi>{user.clinic_id}</bdi></dd></div>
                <div><dt>البريد الإلكتروني</dt><dd><bdi>{user.email}</bdi></dd></div>
            </dl>
            {isDoctor && <>
                <fieldset className={billingStyles.plans} disabled={submitting}>
                    <legend>اختر الباقة الشهرية</legend>
                    {subscriptionPlans.map(item => <label key={item.id}>
                        <input type="radio" name="plan" value={item.id} checked={plan.id === item.id}
                            onChange={() => setParams({ plan: item.id }, { replace: true })} />
                        <span>{item.name} — {item.price.toLocaleString('ar-IQ')} د.ع / شهر</span>
                    </label>)}
                </fieldset>
                <fieldset className={billingStyles.paymentMethods}>
                    <legend>طريقة الدفع</legend>
                    <label className={`${billingStyles.paymentMethod} ${billingStyles.selectedMethod}`}>
                        <input type="radio" name="paymentMethod" value="qi-card" checked readOnly disabled={submitting} />
                        <span><strong dir="ltr">Qi Card</strong><small>تحويل يدوي — متاح الآن</small></span>
                    </label>
                    <label className={`${billingStyles.paymentMethod} ${billingStyles.upcomingMethod}`}>
                        <input type="radio" name="paymentMethod" value="mastercard" disabled />
                        <span><strong dir="ltr">Mastercard</strong><small>الدفع بالبطاقة</small></span>
                        <span className={billingStyles.comingSoon}>قريباً</span>
                    </label>
                </fieldset>
                <section className={billingStyles.transfer} aria-label="تفاصيل التحويل اليدوي">
                    <h2>التحويل عبر {manualPayment.service}</h2>
                    <p>امسح رمز QR أدناه لتحويل <strong>{plan.price.toLocaleString('ar-IQ')} د.ع</strong> عبر Qi Card:</p>
                    <img className={billingStyles.qrCode} src={manualPayment.qrCode} alt="رمز QR للدفع عبر Qi Card" width="1137" height="1033" />
                    <a className={billingStyles.qrDownload} href={manualPayment.qrCode} download="careflow-qi-card.jpeg">تنزيل رمز QR</a>
                    <p>مرجع الاشتراك: <strong><bdi>CF-{user.clinic_id}-{plan.id}</bdi></strong></p>
                    <p>بعد التحويل، اضغط «لقد دفعت» وأدخل رقم هاتف المرسل ورقم العملية الموجود في الإيصال. سيُربط الطلب بحسابك وعيادتك تلقائياً.</p>
                    <p>احتفظ بالإيصال. التفعيل يتم يدوياً بعد مراجعة التحويل.</p>
                </section>
                {!showForm && <div className={billingStyles.actions}>
                    <button type="button" className={styles.button} onClick={() => { setShowForm(true); setNotice(''); setError(''); }}>لقد دفعت</button>
                </div>}
                {showForm && <form className={billingStyles.paymentForm} onSubmit={submitPayment} aria-label="إبلاغ عن دفعة" aria-busy={submitting}>
                    <h2>بيانات التحويل</h2>
                    <p>{plan.name} — {plan.price.toLocaleString('ar-IQ')} د.ع</p>
                    <fieldset disabled={submitting}>
                        <div className={styles.field}>
                            <label htmlFor="sender-phone">رقم هاتف المرسل</label>
                            <input id="sender-phone" name="senderPhone" type="tel" dir="ltr" autoComplete="tel" maxLength={40} required autoFocus />
                        </div>
                        <div className={styles.field}>
                            <label htmlFor="transaction-reference">رقم عملية التحويل</label>
                            <input id="transaction-reference" name="transactionReference" type="text" dir="ltr" maxLength={100} required aria-describedby="reference-help" />
                            <p id="reference-help">أدخل رقم العملية كما يظهر في إيصال Qi Card، وليس رقم البطاقة أو رمز PIN.</p>
                        </div>
                        <button type="submit" className={styles.button}>{submitting ? 'جارٍ إرسال الطلب…' : 'إرسال بيانات الدفع'}</button>
                        <button type="button" className={styles.demoButton} onClick={() => { setShowForm(false); setError(''); }}>إلغاء</button>
                    </fieldset>
                </form>}
                <section className={billingStyles.reports} aria-label="طلبات الدفع السابقة">
                    <h2>طلبات الدفع السابقة</h2>
                    {reportsLoading && <p role="status">جارٍ تحميل الطلبات…</p>}
                    {reportsError && <p role="alert">{reportsError} <button type="button" onClick={() => { setReportsLoading(true); setReportsError(''); setReload(value => value + 1); }}>إعادة المحاولة</button></p>}
                    {!reportsLoading && !reportsError && reports.length === 0 && <p>لم تُرسل بيانات أي دفعة بعد.</p>}
                    {reports.map(report => <article key={report.id}>
                        <strong>طلب #{report.id} — {({ pending: 'بانتظار المراجعة', approved: 'تمت الموافقة', rejected: 'لم تتم الموافقة' })[report.status] || 'قيد المراجعة'}</strong>
                        <p>رقم العملية: <bdi>{report.transactionReference}</bdi></p>
                        <p>{subscriptionPlans.find(item => item.id === report.plan)?.name} — {Number(report.amountIqd).toLocaleString('ar-IQ')} د.ع</p>
                    </article>)}
                </section>
            </>}
            <div className={billingStyles.actions}>
                {active && <Link className={styles.demoButton} to="/app">الانتقال إلى مساحة العمل</Link>}
                <button type="button" className={styles.demoButton} disabled={loggingOut} onClick={onLogout}>
                    {loggingOut ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}
                </button>
            </div>
            {notice && <p className={styles.notice} role="status">{notice}</p>}
            {(error || logoutError) && <p className={styles.error} role="alert">{error || logoutError}</p>}
        </section>
    </main>;
}
