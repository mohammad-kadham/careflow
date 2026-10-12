module.exports = async function addPromotionContacts(db) {
    await db.query(`CREATE TABLE IF NOT EXISTS promotion_contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(254) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        consent_version VARCHAR(20) NOT NULL,
        consent_text VARCHAR(500) NOT NULL,
        source VARCHAR(30) NOT NULL,
        created_at DATETIME NOT NULL,
        UNIQUE KEY uq_promotion_contact (email, phone)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
};
