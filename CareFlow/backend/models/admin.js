const db = require('../data/db');
const { createHash } = require('node:crypto');
const fail = (statusCode, message) => { throw Object.assign(new Error(message), { statusCode }); };
const clinicFields = `c.id, c.name, c.subscription_required AS required,
    c.subscription_plan AS plan, c.subscription_revision AS revision,
    DATE_FORMAT(c.subscription_expires_at, '%Y-%m-%dT%H:%i:%sZ') AS expiresAt,
    COALESCE((c.subscription_required = 0 OR (c.subscription_plan IN ('basic', 'advanced') AND c.subscription_expires_at > UTC_TIMESTAMP())), 0) AS active`;

exports.createSession = async (hash, userId, authVersion = 0) => {
    await db.query('DELETE FROM admin_sessions WHERE expires_at <= UTC_TIMESTAMP()');
    await db.query('INSERT INTO admin_sessions (token_hash, user_id, auth_version, expires_at) VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))', [hash, userId, authVersion]);
};
exports.findSession = hash => db.query('SELECT user_id, auth_version FROM admin_sessions WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()', [hash]);
exports.deleteSession = hash => db.query('DELETE FROM admin_sessions WHERE token_hash = ?', [hash]);

exports.summary = async () => {
    const [[clinics]] = await db.query(`SELECT COUNT(*) AS clinics,
        COALESCE(SUM(subscription_required = 0 OR (subscription_plan IN ('basic', 'advanced') AND subscription_expires_at > UTC_TIMESTAMP())), 0) AS active,
        COALESCE(SUM(NOT COALESCE((subscription_required = 0 OR (subscription_plan IN ('basic', 'advanced') AND subscription_expires_at > UTC_TIMESTAMP())), 0)), 0) AS inactive
        FROM clinics`);
    const [[payments]] = await db.query(`SELECT COALESCE(SUM(status = 'pending'), 0) AS pending,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN amount_iqd ELSE 0 END), 0) AS approvedIqd FROM manual_payment_reports`);
    return Object.fromEntries(Object.entries({ ...clinics, ...payments }).map(([key, value]) => [key, Number(value)]));
};

const searchTerm = value => '%' + value.replace(/[!%_]/g, character => '!' + character) + '%';
exports.payments = async ({ status, q, page }) => {
    const where = [], values = [];
    if (status !== 'all') { where.push('p.status = ?'); values.push(status); }
    if (q) {
        where.push("(u.name LIKE ? ESCAPE '!' OR u.email LIKE ? ESCAPE '!' OR c.name LIKE ? ESCAPE '!' OR p.transaction_reference LIKE ? ESCAPE '!' OR p.sender_phone LIKE ? ESCAPE '!')");
        values.push(...Array(5).fill(searchTerm(q)));
    }
    const filter = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [rows] = await db.query(`SELECT p.id, p.clinic_id AS clinicId, p.plan, p.amount_iqd AS amountIqd,
        p.sender_phone AS senderPhone, p.transaction_reference AS reference, p.status,
        DATE_FORMAT(p.submitted_at, '%Y-%m-%dT%H:%i:%sZ') AS submittedAt,
        DATE_FORMAT(p.reviewed_at, '%Y-%m-%dT%H:%i:%sZ') AS reviewedAt,
        u.name AS customerName, u.email, c.name AS clinicName
        FROM manual_payment_reports p JOIN users u ON u.id = p.user_id JOIN clinics c ON c.id = p.clinic_id
        ${filter} ORDER BY p.id DESC LIMIT 26 OFFSET ?`, [...values, (page - 1) * 25]);
    return { rows: rows.slice(0, 25), hasMore: rows.length > 25 };
};
exports.clinics = async ({ q, page }) => {
    const filter = q ? "WHERE (c.name LIKE ? ESCAPE '!' OR EXISTS (SELECT 1 FROM users u WHERE u.clinic_id = c.id AND u.role = 'doctor' AND (u.email LIKE ? ESCAPE '!' OR u.name LIKE ? ESCAPE '!')) OR CAST(c.id AS CHAR) = ?)" : '';
    const values = q ? [searchTerm(q), searchTerm(q), searchTerm(q), q] : [];
    const [rows] = await db.query(`SELECT ${clinicFields},
        (SELECT u.email FROM users u WHERE u.clinic_id = c.id AND u.role = 'doctor' ORDER BY u.id LIMIT 1) AS email,
        (SELECT u.name FROM users u WHERE u.clinic_id = c.id AND u.role = 'doctor' ORDER BY u.id LIMIT 1) AS customerName
        FROM clinics c ${filter} ORDER BY c.id DESC LIMIT 26 OFFSET ?`, [...values, (page - 1) * 25]);
    return { rows: rows.slice(0, 25), hasMore: rows.length > 25 };
};
exports.audit = async ({ page }) => {
    const [rows] = await db.query(`SELECT a.id, a.clinic_id AS clinicId, c.name AS clinicName, a.report_id AS reportId,
        a.action, a.reason, a.before_state AS beforeState, a.after_state AS afterState,
        u.name AS actorName, DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%sZ') AS createdAt
        FROM admin_subscription_audit a JOIN users u ON u.id = a.actor_id JOIN clinics c ON c.id = a.clinic_id
        ORDER BY a.id DESC LIMIT 26 OFFSET ?`, [(page - 1) * 25]);
    return { rows: rows.slice(0, 25), hasMore: rows.length > 25 };
};

// One transaction commits the subscription, report decision and audit record together.
exports.mutate = async (input, actorId) => {
    const connection = await db.getConnection();
    const requestHash = createHash('sha256').update(JSON.stringify({ ...input, actorId })).digest('hex');
    try {
        await connection.beginTransaction();
        let report, clinicId = input.clinicId;
        if (input.reportId) {
            const [[row]] = await connection.query('SELECT id, clinic_id, plan, status FROM manual_payment_reports WHERE id = ? FOR UPDATE', [input.reportId]);
            if (!row) fail(404, 'بلاغ الدفع غير موجود.');
            report = row; clinicId = row.clinic_id;
        }
        const [[before]] = await connection.query(`SELECT ${clinicFields} FROM clinics c WHERE c.id = ? FOR UPDATE`, [clinicId]);
        if (!before) fail(404, 'العيادة غير موجودة.');
        const [[previous]] = await connection.query('SELECT request_hash FROM admin_subscription_audit WHERE request_id = ?', [input.requestId]);
        if (previous) {
            if (previous.request_hash !== requestHash) fail(409, 'تم استخدام رقم الطلب لعملية أخرى. حدّث الصفحة.');
            await connection.commit();
            return { clinic: before, replayed: true };
        }
        if (report && report.status !== 'pending') fail(409, 'تمت مراجعة هذا البلاغ مسبقًا. حدّث القائمة.');
        if (!report && before.revision !== input.expectedRevision) fail(409, 'تغير الاشتراك منذ فتح النافذة. حدّث القائمة وحاول مجددًا.');
        if (input.action === 'approve' || input.action === 'grant') {
            const plan = report ? report.plan : input.plan;
            if (!['basic', 'advanced'].includes(plan)) fail(400, 'الباقة غير صالحة.');
            await connection.query(`UPDATE clinics SET subscription_required = 1, subscription_plan = ?,
                subscription_expires_at = DATE_ADD(GREATEST(COALESCE(subscription_expires_at, UTC_TIMESTAMP()), UTC_TIMESTAMP()), INTERVAL ? MONTH),
                subscription_revision = subscription_revision + 1 WHERE id = ?`, [plan, report ? 1 : input.months, clinicId]);
        } else if (input.action === 'set') {
            await connection.query('UPDATE clinics SET subscription_required = 1, subscription_plan = ?, subscription_expires_at = ?, subscription_revision = subscription_revision + 1 WHERE id = ?',
                [input.plan, input.expiresAt.slice(0, 19).replace('T', ' '), clinicId]);
        } else if (input.action === 'revoke') {
            await connection.query('UPDATE clinics SET subscription_required = 1, subscription_expires_at = NULL, subscription_revision = subscription_revision + 1 WHERE id = ?', [clinicId]);
        } else if (input.action !== 'reject') fail(400, 'عملية غير صالحة.');
        if (report) await connection.query('UPDATE manual_payment_reports SET status = ?, reviewed_at = UTC_TIMESTAMP() WHERE id = ?',
            [input.action === 'approve' ? 'approved' : 'rejected', report.id]);
        const [[after]] = await connection.query(`SELECT ${clinicFields} FROM clinics c WHERE c.id = ?`, [clinicId]);
        await connection.query(`INSERT INTO admin_subscription_audit
            (actor_id, clinic_id, report_id, action, reason, request_id, request_hash, before_state, after_state, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
            [actorId, clinicId, report?.id || null, input.action, input.reason, input.requestId, requestHash,
                JSON.stringify(before), JSON.stringify(after)]);
        await connection.commit();
        return { clinic: after, replayed: false };
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') fail(409, 'طلب مكرر. حدّث القائمة للتحقق من النتيجة.');
        throw error;
    } finally { connection.release(); }
};
