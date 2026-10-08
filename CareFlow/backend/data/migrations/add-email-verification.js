module.exports = async function addEmailVerification(db) {
    // Existing accounts keep access; all new users explicitly require verification.
    const columns = {
        email_verification_required: 'TINYINT(1) NOT NULL DEFAULT 0',
        email_verified_at: 'DATETIME NULL',
    };
    for (const [name, definition] of Object.entries(columns)) {
        const [rows] = await db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?", [name]);
        if (!rows.length) {
            try { await db.query(`ALTER TABLE users ADD COLUMN ${name} ${definition}`); }
            catch (error) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
        }
    }
    await db.query(`CREATE TABLE IF NOT EXISTS email_verifications (
        user_id INT PRIMARY KEY,
        token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
        expires_at DATETIME NULL,
        sent_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
};
