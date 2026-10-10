module.exports = async function addPasswordReset(db) {
    for (const table of ['users', 'admin_sessions']) {
        const [rows] = await db.query('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, 'auth_version']);
        if (!rows.length) {
            try { await db.query(`ALTER TABLE ${table} ADD COLUMN auth_version INT UNSIGNED NOT NULL DEFAULT 0`); }
            catch (error) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
        }
    }
    await db.query(`CREATE TABLE IF NOT EXISTS password_resets (
        user_id INT PRIMARY KEY,
        token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
        auth_version INT UNSIGNED NOT NULL,
        expires_at DATETIME NULL,
        sent_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
};
