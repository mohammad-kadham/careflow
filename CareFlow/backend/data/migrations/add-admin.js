module.exports = async function addAdmin(db) {
    const [columns] = await db.query("SHOW COLUMNS FROM clinics LIKE 'subscription_revision'");
    if (!columns.length) await db.query('ALTER TABLE clinics ADD COLUMN subscription_revision INT UNSIGNED NOT NULL DEFAULT 0');
    await db.query(`CREATE TABLE IF NOT EXISTS admin_sessions (
        token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
        user_id INT NOT NULL,
        expires_at DATETIME NOT NULL,
        INDEX idx_admin_session_expiry (expires_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS admin_subscription_audit (
        id INT AUTO_INCREMENT PRIMARY KEY,
        actor_id INT NOT NULL,
        clinic_id INT NOT NULL,
        report_id INT NULL,
        action VARCHAR(20) NOT NULL,
        reason VARCHAR(1000) NOT NULL,
        request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
        request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        before_state TEXT NOT NULL,
        after_state TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        INDEX idx_admin_audit_clinic (clinic_id, id),
        FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE RESTRICT,
        FOREIGN KEY (report_id) REFERENCES manual_payment_reports(id) ON DELETE RESTRICT
    )`);
};
