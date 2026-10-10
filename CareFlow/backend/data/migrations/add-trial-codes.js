module.exports = async function addTrialCodes(db) {
    await db.query(`CREATE TABLE IF NOT EXISTS trial_codes (
        id INT PRIMARY KEY,
        CONSTRAINT chk_single_trial_code CHECK (id = 1),
        code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        plan ENUM('basic', 'advanced') NOT NULL,
        request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        created_by INT NOT NULL,
        created_at DATETIME NOT NULL,
        disabled_at DATETIME NULL,
        UNIQUE KEY uq_trial_code (code),
        UNIQUE KEY uq_trial_request (request_id),
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB`);
    await db.query(`CREATE TABLE IF NOT EXISTS trial_redemptions (
        clinic_id INT PRIMARY KEY,
        code_id INT NOT NULL,
        redeemed_by INT NOT NULL,
        redeemed_at DATETIME NOT NULL,
        trial_expires_at DATETIME NOT NULL,
        FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE RESTRICT,
        FOREIGN KEY (code_id) REFERENCES trial_codes(id) ON DELETE RESTRICT,
        FOREIGN KEY (redeemed_by) REFERENCES users(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB`);
};
