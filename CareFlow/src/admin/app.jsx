import { useEffect, useRef, useState } from 'react';
import { adminRequest, localDateInput, subscriptionStatus } from './api';
import { SharedTrialCode } from './trial-codes';

const plans = { basic: 'الأساسية', advanced: 'المتقدمة' };
const decisions = { pending: 'بانتظار المراجعة', approved: 'مقبول', rejected: 'مرفوض' };
const actions = { approve: 'قبول الدفع', reject: 'رفض البلاغ', grant: 'إضافة مدة', set: 'تعديل الاشتراك', revoke: 'إيقاف الاشتراك' };
const money = amount => Number(amount || 0).toLocaleString('ar-IQ') + ' د.ع';
const dateText = value => value ? new Date(value).toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const errorText = error => error instanceof TypeError ? 'تعذر الاتصال بالخادم. تحقق من اتصالك وحاول مجددًا.' : error.message;

function Brand() { return <a className="brand" href="/admin/"><img src="/careflow.png" alt="" /><span>كيرفلو <small>إدارة الاشتراكات</small></span></a>; }

function Login({ onLogin }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try { const result = await adminRequest('/login', { body: { email: form.get('email'), password: form.get('password') } }); onLogin(result.user); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <main className="login-wrap"><div className="login-card"><Brand /><span className="eyebrow">مساحة الإدارة</span>
    <h1>مرحبًا بعودتك</h1><p>راجع المدفوعات وتابع اشتراكات العيادات من مكان واحد.</p>
    <form onSubmit={submit}>
      <label>البريد الإلكتروني<input type="email" name="email" autoComplete="username" dir="ltr" required maxLength={255} /></label>
      <label>كلمة المرور<input type="password" name="password" autoComplete="current-password" required /></label>
      <a href="/forgot-password">نسيت كلمة السر؟</a>
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy}>{busy ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول للإدارة'}</button>
    </form><p className="muted">هذه المساحة متاحة لحساب الإدارة المخوّل فقط.</p><a href="/">العودة إلى موقع كيرفلو ←</a>
  </div></main>;
}

export default function AdminApp() {
  const [session, setSession] = useState({ loading: true, user: null, error: '' });
  useEffect(() => {
    let active = true;
    adminRequest('/me').then(data => { if (active) setSession({ user: data.user }); }).catch(error => {
      if (active) setSession({ user: null, error: error.status === 401 ? '' : errorText(error) });
    });
    return () => { active = false; };
  }, []);
  if (session.loading) return <main className="loading" role="status">جارٍ فتح مساحة الإدارة…</main>;
  if (session.error) return <main className="login-wrap"><div className="login-card"><p role="alert">{session.error}</p><button onClick={() => window.location.reload()}>إعادة المحاولة</button></div></main>;
  if (!session.user) return <Login onLogin={user => setSession({ user })} />;
  return <Dashboard user={session.user} onLogout={() => setSession({ user: null })} />;
}

function Dashboard({ user, onLogout }) {
  const [view, setView] = useState('payments'), [status, setStatus] = useState('pending');
  const [search, setSearch] = useState(''), [q, setQ] = useState(''), [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0), [result, setResult] = useState(null), [summary, setSummary] = useState(null);
  const [modal, setModal] = useState(null), [notice, setNotice] = useState(''), [logoutBusy, setLogoutBusy] = useState(false);
  const query = new URLSearchParams({ page, q, status }).toString();
  const key = `${view}?${query}&revision=${revision}`;
  const loaded = result?.key === key;
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([adminRequest(`/${view}?${query}`, { signal: controller.signal }), adminRequest('/summary', { signal: controller.signal })])
      .then(([data, counts]) => { if (!controller.signal.aborted) { setResult({ key, ...data }); setSummary(counts); } })
      .catch(error => { if (!controller.signal.aborted) { if (error.status === 401) onLogout(); else setResult({ key, error: errorText(error) }); } });
    return () => controller.abort();
  }, [view, query, key, onLogout]);
  // A session change remounts this dashboard, clearing all customer data.
  function switchView(next) { setView(next); setSearch(''); setQ(''); setPage(1); setNotice(''); }
  async function logout() {
    setLogoutBusy(true);
    try { await adminRequest('/logout', { body: {} }); onLogout(); }
    catch (error) { setNotice(errorText(error)); setLogoutBusy(false); }
  }
  function completed() { setModal(null); setNotice('تم حفظ التغيير بنجاح.'); setRevision(value => value + 1); }
  const titles = { payments: 'بلاغات الدفع', clinics: 'اشتراكات العيادات', 'trial-codes': 'رمز التجربة المجانية', audit: 'سجل التغييرات' };
  return <div className="admin-shell">
    <aside className="sidebar"><Brand /><span className="eyebrow">لوحة الإدارة</span><nav aria-label="أقسام الإدارة">
      {Object.entries(titles).map(([id, label]) => <button key={id} className={view === id ? 'nav-active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => switchView(id)}>{label}{id === 'payments' && summary && <span>{Number(summary.pending).toLocaleString('ar-IQ')}</span>}</button>)}
    </nav><div className="sidebar-bottom"><span>{user.name}</span><small dir="ltr">{user.email}</small><button className="secondary" disabled={logoutBusy} onClick={logout}>تسجيل الخروج</button><a href="/" target="_blank" rel="noreferrer">فتح الموقع ↗</a></div></aside>
    <main className="workspace"><header className="workspace-heading"><div><span className="eyebrow">كيرفلو / الإدارة</span><h1>{titles[view]}</h1></div><button className="secondary" onClick={() => setRevision(value => value + 1)} disabled={!loaded}>تحديث البيانات ↻</button></header>
      <section className="stats" aria-label="ملخص الاشتراكات">
        <Stat label="بانتظار مراجعتك" value={summary?.pending} />
        <Stat label="عيادات بوصول نشط" value={summary?.active} />
        <Stat label="اشتراكات غير نشطة" value={summary?.inactive} />
        <Stat label="إجمالي البلاغات المقبولة" value={summary ? money(summary.approvedIqd) : null} />
      </section>
      {view === 'payments' && <p className="info">البلاغ يعني أن العميل أبلغ عن تحويل. تحقق من وصول المبلغ إلى حساب Qi Card قبل الموافقة. قبول البلاغ يضيف شهرًا واحدًا للاشتراك.</p>}
      {notice && <p role="status" className="notice">{notice}</p>}
      {view === 'trial-codes' && loaded && !result.error && <SharedTrialCode code={result.code} onDone={() => { setPage(1); completed(); }} onUnauthorized={onLogout} />}
      <section className="panel">
        <div className="toolbar">
          {['payments', 'clinics'].includes(view) && <form onSubmit={event => { event.preventDefault(); setQ(search.trim()); setPage(1); }} className="search"><label className="sr-only" htmlFor="search">بحث</label><input id="search" placeholder={view === 'payments' ? 'اسم، بريد، هاتف أو رقم التحويل…' : 'اسم العيادة، الطبيب، البريد أو رقم العيادة…'} value={search} onChange={event => setSearch(event.target.value)} maxLength={150} /><button className="secondary">بحث</button></form>}
          {view === 'payments' && <label className="filter">حالة البلاغ<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="pending">بانتظار المراجعة</option><option value="approved">مقبول</option><option value="rejected">مرفوض</option><option value="all">الكل</option></select></label>}
          {view === 'audit' && <p>سجل القرارات ومن قام بها. جميع الأوقات حسب توقيت جهازك.</p>}
          {view === 'trial-codes' && <p>العيادات التي استخدمت الرمز المشترك. المدة: ١٠ أيام من التفعيل لكل عيادة.</p>}
        </div>
        {!loaded ? <p className="empty" role="status">جارٍ تحميل البيانات…</p> : result.error ? <p className="empty error" role="alert">{result.error}</p> : !result.rows.length ? <div className="empty"><h2>لا توجد نتائج</h2><p>{q ? 'جرّب البحث بكلمات أخرى.' : view === 'payments' ? 'ستظهر هنا بلاغات الدفع التي يرسلها العملاء.' : 'لا توجد سجلات لعرضها حاليًا.'}</p></div> : <>
          <div className="table-scroll" role="region" aria-label={titles[view]} tabIndex={0}><table>
            {view === 'payments' ? <><thead><tr><th>العميل والعيادة</th><th>التحويل</th><th>الباقة والمبلغ</th><th>الحالة</th><th>المراجعة</th></tr></thead><tbody>{result.rows.map(row => <tr key={row.id}>
              <td><strong>{row.customerName}</strong><small dir="ltr">{row.email}</small><small>{row.clinicName} · #{row.clinicId}</small></td>
              <td><strong dir="ltr">{row.reference}</strong><small dir="ltr">{row.senderPhone}</small><small>{dateText(row.submittedAt)}</small></td>
              <td><strong>{money(row.amountIqd)}</strong><small>{plans[row.plan]} · شهر واحد</small></td>
              <td><span className={`badge ${row.status}`}>{decisions[row.status]}</span>{row.reviewedAt && <small>{dateText(row.reviewedAt)}</small>}</td>
              <td>{row.status === 'pending' ? <button className="small" onClick={() => setModal({ type: 'report', row })}>مراجعة البلاغ</button> : <span className="muted">تمت المراجعة</span>}</td>
            </tr>)}</tbody></> : view === 'clinics' ? <><thead><tr><th>العيادة</th><th>الحساب</th><th>الاشتراك</th><th>ينتهي في</th><th>الإدارة</th></tr></thead><tbody>{result.rows.map(row => <tr key={row.id}>
              <td><strong>{row.name}</strong><small>عيادة #{row.id}</small></td><td><strong>{row.customerName || '—'}</strong><small dir="ltr">{row.email || '—'}</small></td>
              <td><span className={`badge ${Number(row.active) ? 'approved' : 'rejected'}`}>{subscriptionStatus(row)}</span><small>{plans[row.plan] || 'بدون باقة'}</small></td>
              <td>{dateText(row.expiresAt)}</td><td><button className="small secondary" onClick={() => setModal({ type: 'clinic', row })}>إدارة الاشتراك</button></td>
            </tr>)}</tbody></> : view === 'trial-codes' ? <><thead><tr><th>العيادة</th><th>استخدمه</th><th>تاريخ التفعيل</th><th>نهاية التجربة</th></tr></thead><tbody>{result.rows.map(row => <tr key={row.id}>
              <td><strong>{row.clinicName}</strong><small>عيادة #{row.id}</small></td>
              <td>{row.redeemedBy}</td><td>{dateText(row.redeemedAt)}</td><td>{dateText(row.expiresAt)}</td>
            </tr>)}</tbody></> : <><thead><tr><th>العملية</th><th>العيادة</th><th>التغيير</th><th>السبب</th><th>المسؤول</th></tr></thead><tbody>{result.rows.map(row => <tr key={row.id}>
              <td><strong>{actions[row.action]}</strong><small>{dateText(row.createdAt)}</small>{row.reportId && <small>بلاغ #{row.reportId}</small>}</td>
              <td>{row.clinicName}<small>#{row.clinicId}</small></td><td><AuditState value={row.beforeState} label="قبل" /><AuditState value={row.afterState} label="بعد" /></td><td className="reason">{row.reason}</td><td>{row.actorName}</td>
            </tr>)}</tbody></>}
          </table></div>
        </>}
        <div className="pagination"><button className="secondary small" disabled={page === 1 || !loaded} onClick={() => setPage(value => value - 1)}>السابق</button><span>صفحة {page.toLocaleString('ar-IQ')}</span><button className="secondary small" disabled={!loaded || !result?.hasMore} onClick={() => setPage(value => value + 1)}>التالي</button></div>
      </section>
    </main>
    {modal && <ManagementDialog key={`${modal.type}-${modal.row.id}`} {...modal} onClose={() => setModal(null)} onDone={completed} onUnauthorized={onLogout} />}
  </div>;
}

function Stat({ label, value }) { return <div className="stat"><span>{label}</span><strong>{value == null ? '—' : typeof value === 'number' ? value.toLocaleString('ar-IQ') : value}</strong></div>; }
function AuditState({ value, label }) {
  let data;
  try { data = JSON.parse(value); } catch { return <small>{label}: —</small>; }
  return <small>{label}: {plans[data.plan] || 'بدون باقة'} · {Number(data.required) === 0 ? 'وصول سابق' : dateText(data.expiresAt)}</small>;
}

export function ManagementDialog({ type, row, onClose, onDone, onUnauthorized }) {
  const dialog = useRef(null), request = useRef(null);
  const [action, setAction] = useState(type === 'report' ? 'approve' : 'grant');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { dialog.current.showModal(); }, []);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const values = { action, reason: form.get('reason'), confirmed: form.get('confirmed') === 'on' };
    if (type === 'clinic') {
      values.expectedRevision = row.revision;
      if (action !== 'revoke') values.plan = form.get('plan');
      if (action === 'grant') values.months = Number(form.get('months'));
      if (action === 'set') values.expiresAt = new Date(form.get('expiresAt')).toISOString();
    }
    const fingerprint = JSON.stringify(values);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    setBusy(true); setError('');
    try {
      await adminRequest(type === 'report' ? `/payments/${row.id}/review` : `/clinics/${row.id}/subscription`, { body: { ...values, requestId: request.current.id } });
      onDone();
    } catch (error) { if (error.status === 401) onUnauthorized(); else setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} aria-labelledby="dialog-title">
    <form onSubmit={submit}><header className="dialog-header"><div><span className="eyebrow">{type === 'report' ? `بلاغ #${row.id}` : `عيادة #${row.id}`}</span><h2 id="dialog-title">{type === 'report' ? 'مراجعة بلاغ الدفع' : 'إدارة الاشتراك'}</h2></div><button type="button" className="secondary" aria-label="إغلاق" onClick={onClose} disabled={busy}>×</button></header>
      <div className="details"><strong>{row.clinicName || row.name}</strong><span>{row.customerName}</span><span dir="ltr">{row.email}</span>
        {type === 'report' ? <><span>{plans[row.plan]} · {money(row.amountIqd)}</span><span>رقم التحويل: <bdi>{row.reference}</bdi></span><span>هاتف المرسل: <bdi>{row.senderPhone}</bdi></span></> : <span>الاشتراك الحالي: {subscriptionStatus(row)} · {dateText(row.expiresAt)}</span>}
      </div>
      <fieldset disabled={busy}><label>القرار<select value={action} onChange={event => { setAction(event.target.value); setError(''); }}>
        {(type === 'report' ? ['approve', 'reject'] : ['grant', 'set', 'revoke']).map(value => <option key={value} value={value}>{actions[value]}</option>)}
      </select></label>
      {type === 'clinic' && action !== 'revoke' && <label>الباقة<select name="plan" defaultValue={row.plan || 'basic'}><option value="basic">الأساسية</option><option value="advanced">المتقدمة</option></select></label>}
      {action === 'grant' && <><label>عدد الأشهر<input name="months" type="number" min="1" max="12" defaultValue="1" required /></label><p className="muted">تُضاف المدة إلى تاريخ الانتهاء الحالي، أو تبدأ من الآن إذا كان الاشتراك منتهيًا. لا تستخدم هذه العملية لتحويل وافقت عليه في بلاغات الدفع.</p></>}
      {action === 'set' && <label>تاريخ الانتهاء الجديد (بتوقيت جهازك)<input name="expiresAt" type="datetime-local" defaultValue={localDateInput(row.expiresAt)} required /></label>}
      {action === 'revoke' && <p className="warning">سيُوقف وصول العيادة إلى مساحة العمل فورًا. تبقى حساباتها وبياناتها محفوظة.</p>}
      {action === 'approve' && <label className="check"><input name="confirmed" type="checkbox" required />تحققت من وصول {money(row.amountIqd)} إلى حساب Qi Card ومن تطابق رقم التحويل. أوافق على إضافة شهر واحد.</label>}
      {action === 'reject' && <p className="muted">رفض البلاغ لا يغيّر اشتراك العيادة الحالي.</p>}
      <label>ملاحظة / سبب القرار<textarea name="reason" required maxLength={1000} rows={3} placeholder="اكتب ما يوضح هذا القرار في سجل التغييرات" /></label></fieldset>
      {error && <p role="alert" className="error">{error}</p>}
      <footer className="dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>إلغاء</button><button className={['revoke', 'reject'].includes(action) ? 'danger' : ''} disabled={busy}>{busy ? 'جارٍ الحفظ…' : `تأكيد ${actions[action]}`}</button></footer>
    </form>
  </dialog>;
}
