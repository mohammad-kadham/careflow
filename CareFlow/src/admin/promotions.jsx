export default function PromotionContacts({ rows }) {
    return <>
        <thead><tr><th scope="col">البريد الإلكتروني</th><th scope="col">رقم الهاتف</th><th scope="col">تاريخ الموافقة</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
            <td dir="ltr">{row.email}</td><td dir="ltr">{row.phone}</td>
            <td>{new Date(row.createdAt).toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' })}</td>
        </tr>)}</tbody>
    </>;
}
