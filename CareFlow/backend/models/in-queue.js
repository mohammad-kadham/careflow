const db = require('../data/db');

exports.getAll = clinicId => db.query(
    'SELECT p.id, p.name, p.phone, p.city, q.checked_in_at AS checkedInAt, (q.visit_opened_at IS NOT NULL AND q.visit_completed_at IS NULL) AS visitOpen, (q.visit_completed_at IS NOT NULL) AS visitCompleted FROM in_queue q JOIN patients p ON p.id = q.patient_id WHERE p.clinic_id = ? ORDER BY q.checked_in_at, q.patient_id',
    [clinicId]
);

exports.add = async (patientId, clinicId) => {
    const result = await db.query(
        'UPDATE in_queue q JOIN patients p ON p.id = q.patient_id SET q.visit_completed_at = NULL, q.visit_opened_at = NULL, q.checked_in_at = CURRENT_TIMESTAMP WHERE q.patient_id = ? AND p.clinic_id = ? AND q.visit_completed_at IS NOT NULL',
        [patientId, clinicId]
    );
    if (result[0].affectedRows) return result;
    return db.query(
        'INSERT INTO in_queue (patient_id) SELECT id FROM patients WHERE id = ? AND clinic_id = ?',
        [patientId, clinicId]
    );
};

exports.openVisit = async (patientId, clinicId) => {
    const [result] = await db.query(
        'UPDATE in_queue q JOIN patients p ON p.id = q.patient_id SET q.visit_opened_at = COALESCE(q.visit_opened_at, CURRENT_TIMESTAMP) WHERE q.patient_id = ? AND p.clinic_id = ? AND q.visit_completed_at IS NULL',
        [patientId, clinicId]
    );
    if (result.affectedRows) return true;
    // Some MySQL configurations report zero changes when a visit is already open.
    const [rows] = await db.query(
        'SELECT q.patient_id FROM in_queue q JOIN patients p ON p.id = q.patient_id WHERE q.patient_id = ? AND p.clinic_id = ? AND q.visit_completed_at IS NULL',
        [patientId, clinicId]
    );
    return rows.length > 0;
};

// Delete queue entries only; patient records and saved visits remain intact.
exports.clear = clinicId => db.query(
    'DELETE q FROM in_queue q JOIN patients p ON p.id = q.patient_id WHERE p.clinic_id = ?',
    [clinicId]
);
