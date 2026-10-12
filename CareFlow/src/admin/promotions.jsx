import { useEffect, useRef, useState } from 'react';
import { exportPromotionContacts } from './promotion-export.js';

export function PromotionExport({ q, onUnauthorized }) {
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const request = useRef(null);
    useEffect(() => () => request.current?.abort(), []);
    async function download() {
        if (request.current) return;
        const controller = new AbortController();
        request.current = controller;
        setBusy(true); setError('');
        try { await exportPromotionContacts(q, controller.signal); }
        catch (error) {
            if (!controller.signal.aborted) {
                if (error.status === 401) onUnauthorized();
                else setError('تعذر تصدير القائمة. تحقق من اتصالك وحاول مجددًا.');
            }
        } finally {
            request.current = null;
            if (!controller.signal.aborted) setBusy(false);
        }
    }
    return <div><button className="secondary" type="button" disabled={busy} onClick={download}>
        {busy ? 'جارٍ التصدير…' : q ? 'تصدير نتائج البحث (CSV)' : 'تصدير القائمة (CSV)'}
    </button>{error && <p className="error" role="alert">{error}</p>}</div>;
}

export default function PromotionContacts({ rows }) {
    return <>
        <thead><tr><th scope="col">البريد الإلكتروني</th><th scope="col">رقم الهاتف</th><th scope="col">تاريخ الموافقة</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
            <td dir="ltr">{row.email}</td><td dir="ltr">{row.phone}</td>
            <td>{new Date(row.createdAt).toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' })}</td>
        </tr>)}</tbody>
    </>;
}
