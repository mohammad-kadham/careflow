const db = require('../data/db');

exports.get = async (clinicId, doctorId) => {
    if (!doctorId) return false;
    const [rows] = await db.query(
        'SELECT paused FROM clinic_entry_control WHERE clinic_id = ? AND doctor_id = ?',
        [clinicId, doctorId]
    );
    return Boolean(rows[0]?.paused);
};

exports.set = async (clinicId, doctorId, paused) => {
    await db.query(
        `INSERT INTO clinic_entry_control (clinic_id, doctor_id, paused) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE paused = ?`,
        [clinicId, doctorId, paused, paused]
    );
};
