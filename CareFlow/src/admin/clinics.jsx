import { subscriptionStatus } from './api';

const plans = { basic: 'الأساسية', advanced: 'المتقدمة' };
const dateText = value => value ? new Date(value).toLocaleDateString('ar-IQ', { dateStyle: 'medium' }) : '—';
const countText = value => Number(value ?? 0).toLocaleString('ar-IQ');

export default function ClinicDirectory({ rows, onManage }) {
    return <>
        <thead><tr>
            <th scope="col">العيادة</th><th scope="col">أول حساب طبيب</th><th scope="col">الحسابات</th>
            <th scope="col">تاريخ التسجيل</th><th scope="col">الاشتراك</th><th scope="col">الإدارة</th>
        </tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
            <td><strong>{row.name}</strong><small>عيادة #{row.id}</small></td>
            <td><strong>{row.customerName || 'لا يوجد حساب طبيب'}</strong>
                <small dir="ltr">{row.email || '—'}</small><small dir="ltr">{row.phone || '—'}</small></td>
            <td><span>الأطباء: {countText(row.doctorCount)}</span><small>الموظفون: {countText(row.staffCount)}</small></td>
            <td>{dateText(row.createdAt)}</td>
            <td><span className={`badge ${Number(row.active) ? 'approved' : 'rejected'}`}>{subscriptionStatus(row)}</span>
                <small>{plans[row.plan] || 'بدون باقة'}</small>{row.expiresAt && <small>ينتهي في {dateText(row.expiresAt)}</small>}</td>
            <td><button type="button" className="small secondary" aria-label={`إدارة اشتراك ${row.name} — عيادة ${row.id}`}
                onClick={() => onManage(row)}>إدارة الاشتراك</button></td>
        </tr>)}</tbody>
    </>;
}
