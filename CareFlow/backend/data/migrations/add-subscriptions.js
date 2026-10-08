module.exports = async function addSubscriptions(db) {
    // Existing clinics keep access. New registrations explicitly opt into paid access.
    const columns = {
        subscription_required: 'TINYINT(1) NOT NULL DEFAULT 0',
        subscription_plan: 'VARCHAR(20) NULL',
        subscription_expires_at: 'DATETIME NULL',
    };
    for (const [name, definition] of Object.entries(columns)) {
        const [rows] = await db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clinics' AND COLUMN_NAME = ?", [name]);
        if (!rows.length) {
            try { await db.query(`ALTER TABLE clinics ADD COLUMN ${name} ${definition}`); }
            catch (error) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
        }
    }
};
