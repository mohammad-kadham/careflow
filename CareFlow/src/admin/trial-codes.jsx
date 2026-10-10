import { useRef, useState } from 'react';
import { adminRequest } from './api';

export function SharedTrialCode({ code, onDone, onUnauthorized }) {
    const [plan, setPlan] = useState('basic'), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const request = useRef(null), pending = useRef(false);
    async function create(event) {
        event.preventDefault();
        if (pending.current) return;
        pending.current = true; setBusy(true); setError('');
        if (!request.current || request.current.plan !== plan) request.current = { plan, requestId: crypto.randomUUID() };
        try {
            await adminRequest('/trial-codes', { body: request.current });
            request.current = null; onDone();
        } catch (error) {
            if (error.status === 401) onUnauthorized();
            else setError(error instanceof TypeError ? 'تعذر الاتصال. أعد المحاولة لاسترجاع الرمز نفسه.' : error.message);
        } finally { pending.current = false; setBusy(false); }
    }
    async function toggle() {
        if (pending.current) return;
        pending.current = true; setBusy(true); setError('');
        try { await adminRequest('/trial-codes/status', { body: { enabled: code.status === 'disabled' } }); onDone(); }
        catch (error) { if (error.status === 401) onUnauthorized(); else setError('تعذر تغيير حالة الرمز. حدّث الصفحة وحاول مجدداً.'); }
        finally { pending.current = false; setBusy(false); }
    }
    return <section className="trial-generator">
        <p className="info">رمز مشترك واحد لجميع العيادات. يمكن لكل عيادة استخدامه مرة واحدة لتفعيل ١٠ أيام مجاناً، وتبدأ المدة عند إدخال الرمز.</p>
        {code ? <div className="details">
            <span>رمز التجربة المشترك — انسخه وشاركه مع العملاء</span>
            <strong className="trial-code" dir="ltr">{code.code}</strong>
            <span>الباقة: {code.plan === 'advanced' ? 'المتقدمة' : 'الأساسية'} · ١٠ أيام مجاناً</span>
            <span>عدد العيادات المستفيدة: {Number(code.usageCount).toLocaleString('ar-IQ')}</span>
            <span>الحالة: {code.status === 'disabled' ? 'معطّل' : 'متاح'}</span>
            <button className="secondary" disabled={busy} onClick={toggle}>{busy ? 'جارٍ الحفظ…' : code.status === 'disabled' ? 'إعادة تفعيل الرمز' : 'تعطيل الرمز'}</button>
            <small>تعطيل الرمز يمنع استخدامات جديدة فقط. إعادة تفعيله لا تمنح تجربة ثانية لأي عيادة.</small>
        </div> : <form onSubmit={create}><fieldset disabled={busy}>
            <label>باقة التجربة<select value={plan} onChange={event => setPlan(event.target.value)}><option value="basic">الأساسية</option><option value="advanced">المتقدمة</option></select></label>
            <button>{busy ? 'جارٍ الإنشاء…' : 'إنشاء الرمز المشترك'}</button>
        </fieldset></form>}
        {error && <p className="error" role="alert">{error}</p>}
    </section>;
}
