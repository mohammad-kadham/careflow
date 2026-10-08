module.exports = async function addEntryControl(db) {
    await db.query(`CREATE TABLE IF NOT EXISTS clinic_entry_control (
        clinic_id INT NOT NULL,
        doctor_id INT NOT NULL,
        paused BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (clinic_id, doctor_id),
        CONSTRAINT fk_entry_clinic FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE,
        CONSTRAINT fk_entry_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
};
