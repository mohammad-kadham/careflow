function cell(value, forceText = false) {
    let text = String(value ?? '');
    // Keep phone numbers as text and prevent spreadsheet formula execution.
    if (forceText || /^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
}

module.exports = function promotionCsv(rows) {
    const lines = [['البريد الإلكتروني', 'رقم الهاتف', 'تاريخ الموافقة (UTC)'].map(value => cell(value)).join(',')];
    for (const row of rows) lines.push([cell(row.email), cell(row.phone, true), cell(row.createdAt)].join(','));
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
};
