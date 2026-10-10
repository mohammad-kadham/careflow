const db = require('../data/db');
const { randomBytes } = require('node:crypto');
const fail = (statusCode, message) => { throw Object.assign(new Error(message), { statusCode }); };

exports.availableCode = async () => {
    const [[row]] = await db.query('SELECT code FROM trial_codes WHERE id = 1 AND disabled_at IS NULL');
    return row?.code || null;
};

exports.list = async ({ page }) => {
    const [[code]] = await db.query(`SELECT t.id, t.code, t.plan,
        CASE WHEN t.disabled_at IS NOT NULL THEN 'disabled' ELSE 'available' END AS status,
        DATE_FORMAT(t.created_at, '%Y-%m-%dT%H:%i:%sZ') AS createdAt,
        u.name AS createdBy, (SELECT COUNT(*) FROM trial_redemptions) AS usageCount
        FROM trial_codes t JOIN users u ON u.id = t.created_by WHERE t.id = 1`);
    const [rows] = await db.query(`SELECT r.clinic_id AS id, c.name AS clinicName, u.name AS redeemedBy,
        DATE_FORMAT(r.redeemed_at, '%Y-%m-%dT%H:%i:%sZ') AS redeemedAt,
        DATE_FORMAT(r.trial_expires_at, '%Y-%m-%dT%H:%i:%sZ') AS expiresAt
        FROM trial_redemptions r JOIN clinics c ON c.id = r.clinic_id JOIN users u ON u.id = r.redeemed_by
        ORDER BY r.redeemed_at DESC, r.clinic_id DESC LIMIT 26 OFFSET ?`, [(page - 1) * 25]);
    return { code: code || null, rows: rows.slice(0, 25), hasMore: rows.length > 25 };
};

exports.create = async ({ plan, requestId }, actorId) => {
    const code = 'CF-' + randomBytes(12).toString('hex').toUpperCase().match(/.{6}/g).join('-');
    try {
        await db.query('INSERT INTO trial_codes (id, code, plan, request_id, created_by, created_at) VALUES (1, ?, ?, ?, ?, UTC_TIMESTAMP())',
            [code, plan, requestId, actorId]);
    } catch (error) { if (error.code !== 'ER_DUP_ENTRY') throw error; }
    const [[row]] = await db.query('SELECT id, code, plan, request_id, created_by FROM trial_codes WHERE id = 1');
    if (!row) throw new Error('Trial code could not be created');
    if (row.request_id !== requestId || row.created_by !== actorId || row.plan !== plan) fail(409, 'رمز التجربة المشترك موجود بالفعل. حدّث الصفحة لعرضه.');
    return { id: row.id, code: row.code, plan: row.plan };
};

exports.setEnabled = async enabled => {
    const [result] = await db.query('UPDATE trial_codes SET disabled_at = IF(?, NULL, UTC_TIMESTAMP()) WHERE id = 1', [enabled]);
    if (!result.affectedRows) fail(404, 'رمز التجربة غير موجود.');
};

// Each clinic has its own redemption. Locking its row and using its ID as the
// redemption primary key prevents duplicate grants without consuming the shared code.
exports.redeem = async (code, clinicId, userId) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [[clinic]] = await connection.query(`SELECT id, subscription_required,
            COALESCE(subscription_plan IN ('basic', 'advanced') AND subscription_expires_at > UTC_TIMESTAMP(), 0) AS active
            FROM clinics WHERE id = ? FOR UPDATE`, [clinicId]);
        if (!clinic) fail(404, 'العيادة غير موجودة.');
        const [[trial]] = await connection.query('SELECT id, plan, disabled_at FROM trial_codes WHERE code = ? AND id = 1 LOCK IN SHARE MODE', [code]);
        if (!trial) fail(400, 'رمز التجربة غير صالح أو غير متاح.');
        const [[previous]] = await connection.query('SELECT clinic_id FROM trial_redemptions WHERE clinic_id = ?', [clinicId]);
        if (previous) {
            await connection.commit();
            return { replayed: true };
        }
        if (trial.disabled_at) fail(400, 'رمز التجربة غير صالح أو غير متاح.');
        if (Number(clinic.subscription_required) !== 1 || Number(clinic.active) === 1) fail(409, 'لديك وصول نشط بالفعل. لا يمكن استخدام رمز التجربة الآن.');
        await connection.query(`UPDATE clinics SET subscription_required = 1, subscription_plan = ?,
            subscription_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 DAY),
            subscription_revision = subscription_revision + 1 WHERE id = ?`, [trial.plan, clinicId]);
        await connection.query(`INSERT INTO trial_redemptions (clinic_id, code_id, redeemed_by, redeemed_at, trial_expires_at)
            SELECT id, ?, ?, UTC_TIMESTAMP(), subscription_expires_at FROM clinics WHERE id = ?`, [trial.id, userId, clinicId]);
        await connection.commit();
        return { replayed: false };
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') fail(409, 'سبق لهذه العيادة استخدام التجربة المجانية.');
        throw error;
    } finally { connection.release(); }
};
