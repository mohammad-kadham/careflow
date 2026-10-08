module.exports = async function addPaymentReports(db) {
    await db.query(`CREATE TABLE IF NOT EXISTS manual_payment_reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        clinic_id INT NOT NULL,
        user_id INT NOT NULL,
        plan VARCHAR(20) NOT NULL,
        amount_iqd INT NOT NULL,
        sender_phone VARCHAR(20) NOT NULL,
        transaction_reference VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
        submitted_at DATETIME NOT NULL,
        reviewed_at DATETIME NULL,
        UNIQUE KEY uq_manual_payment_transaction (transaction_reference),
        INDEX idx_manual_payment_clinic (clinic_id, id),
        INDEX idx_manual_payment_status (status, submitted_at),
        FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE RESTRICT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
    )`);
};
