const db = require('../data/db');

exports.reserve = async (userId, hash) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        // Lock the user so concurrent resends cannot bypass the persistent cooldown.
        const [users] = await connection.query('SELECT email_verification_required, email_verified_at FROM users WHERE id = ? FOR UPDATE', [userId]);
        const [tokens] = await connection.query('SELECT (sent_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 SECOND)) AS cooling_down FROM email_verifications WHERE user_id = ?', [userId]);
        if (!users[0] || Number(users[0].email_verification_required) !== 1 || users[0].email_verified_at || Number(tokens[0]?.cooling_down) === 1) {
            await connection.commit();
            return false;
        }
        await connection.query(`INSERT INTO email_verifications (user_id, token_hash, expires_at, sent_at)
            VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR), UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE token_hash = VALUES(token_hash), expires_at = VALUES(expires_at), sent_at = VALUES(sent_at)`, [userId, hash]);
        await connection.commit();
        return true;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally { connection.release(); }
};

exports.revoke = (userId, hash) => db.query('UPDATE email_verifications SET token_hash = NULL, expires_at = NULL WHERE user_id = ? AND token_hash = ?', [userId, hash]);

exports.consume = async hash => {
    // Verification and token consumption happen together, including concurrent clicks.
    const [result] = await db.query(`UPDATE users u JOIN email_verifications v ON v.user_id = u.id
        SET u.email_verified_at = UTC_TIMESTAMP(), v.token_hash = NULL, v.expires_at = NULL
        WHERE v.token_hash = ? AND v.expires_at > UTC_TIMESTAMP()
          AND u.email_verification_required = 1 AND u.email_verified_at IS NULL`, [hash]);
    return result.affectedRows > 0;
};
