const db = require('../data/db');

exports.reserve = async (userId, hash, expectedVersion) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [[user]] = await connection.query('SELECT auth_version FROM users WHERE id = ? FOR UPDATE', [userId]);
        const [[previous]] = await connection.query('SELECT (sent_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 SECOND)) AS cooling_down FROM password_resets WHERE user_id = ?', [userId]);
        if (!user || Number(user.auth_version) !== expectedVersion || Number(previous?.cooling_down) === 1) {
            await connection.commit(); return false;
        }
        await connection.query(`INSERT INTO password_resets (user_id, token_hash, auth_version, expires_at, sent_at)
            VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE), UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE token_hash = VALUES(token_hash), auth_version = VALUES(auth_version), expires_at = VALUES(expires_at), sent_at = VALUES(sent_at)`,
            [userId, hash, expectedVersion]);
        await connection.commit(); return true;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
};

exports.revoke = (userId, hash) => db.query('UPDATE password_resets SET token_hash = NULL, expires_at = NULL WHERE user_id = ? AND token_hash = ?', [userId, hash]);

exports.consume = async (hash, passwordHash) => {
    // Discover ownership first, then lock user -> token in the same order as reserve.
    const [[owner]] = await db.query('SELECT user_id FROM password_resets WHERE token_hash = ?', [hash]);
    if (!owner) return false;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [[user]] = await connection.query('SELECT auth_version FROM users WHERE id = ? FOR UPDATE', [owner.user_id]);
        const [[token]] = await connection.query('SELECT token_hash, auth_version, (expires_at > UTC_TIMESTAMP()) AS valid FROM password_resets WHERE user_id = ? FOR UPDATE', [owner.user_id]);
        if (!user || !token || token.token_hash !== hash || Number(token.valid) !== 1 || Number(token.auth_version) !== Number(user.auth_version)) {
            await connection.commit(); return false;
        }
        await connection.query('UPDATE users SET password = ?, auth_version = auth_version + 1 WHERE id = ?', [passwordHash, owner.user_id]);
        await connection.query('UPDATE password_resets SET token_hash = NULL, expires_at = NULL WHERE user_id = ?', [owner.user_id]);
        await connection.query('DELETE FROM admin_sessions WHERE user_id = ?', [owner.user_id]);
        await connection.commit(); return true;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
};
