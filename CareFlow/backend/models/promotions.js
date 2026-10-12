const db = require('../data/db');
const consent = require('../config/promotion-consent.json');

exports.subscribe = async ({ email, phone }) => {
    // Retries preserve the original contact and consent. Never replace another
    // phone number just because someone submitted the same email address.
    await db.query(`INSERT INTO promotion_contacts
        (email, phone, consent_version, consent_text, source, created_at)
        VALUES (?, ?, ?, ?, 'homepage', UTC_TIMESTAMP())
        ON DUPLICATE KEY UPDATE id = id`, [email, phone, consent.version, consent.text]);
};

exports.list = async ({ q, page }) => {
    const term = '%' + q.replace(/[!%_]/g, character => '!' + character) + '%';
    const filter = q ? "WHERE email LIKE ? ESCAPE '!' OR phone LIKE ? ESCAPE '!'" : '';
    const [rows] = await db.query(`SELECT id, email, phone, consent_version AS consentVersion,
        DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS createdAt
        FROM promotion_contacts ${filter} ORDER BY id DESC LIMIT 26 OFFSET ?`,
    [...(q ? [term, term] : []), (page - 1) * 25]);
    return { rows: rows.slice(0, 25), hasMore: rows.length > 25 };
};

exports.exportContacts = async ({ q }) => {
    const term = '%' + q.replace(/[!%_]/g, character => '!' + character) + '%';
    const filter = q ? "WHERE email LIKE ? ESCAPE '!' OR phone LIKE ? ESCAPE '!'" : '';
    const [rows] = await db.query(`SELECT email, phone,
        DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS createdAt
        FROM promotion_contacts ${filter} ORDER BY id DESC`, q ? [term, term] : []);
    return rows;
};
