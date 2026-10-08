const db = require('../data/db');

exports.getForPatient = (patientId, clinicId) => db.query(
    "SELECT v.id, v.patient_id AS patientId, v.doctor_id AS doctorId, DATE_FORMAT(v.visit_date, '%Y-%m-%d %H:%i:%s') AS visitDate, v.symptoms, v.examination_notes AS examinationNotes, v.diagnosis, v.treatment, v.medications, DATE_FORMAT(v.follow_up_date, '%Y-%m-%d') AS followUpDate, v.notes FROM visits v JOIN patients p ON p.id = v.patient_id WHERE p.id = ? AND p.clinic_id = ? ORDER BY v.visit_date DESC, v.id DESC",
    [patientId, clinicId]
);

exports.patientExists = async (patientId, clinicId) => {
    const [rows] = await db.query('SELECT id FROM patients WHERE id = ? AND clinic_id = ?', [patientId, clinicId]);
    return rows.length > 0;
};

exports.create = async (patientId, data, doctorId, clinicId) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [patients] = await connection.query(
            'SELECT id FROM patients WHERE id = ? AND clinic_id = ? FOR UPDATE', [patientId, clinicId]
        );
        if (!patients.length) {
            const error = new Error('المريض غير موجود.');
            error.statusCode = 404;
            throw error;
        }
        const result = await connection.query(
            'INSERT INTO visits (patient_id, doctor_id, symptoms, examination_notes, diagnosis, treatment, medications, follow_up_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [patientId, doctorId, ...['symptoms', 'examinationNotes', 'diagnosis', 'treatment', 'medications', 'followUpDate', 'notes'].map(field => data[field] || null)]
        );
        await connection.query('UPDATE in_queue SET visit_completed_at = CURRENT_TIMESTAMP WHERE patient_id = ?', [patientId]);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally { connection.release(); }
};
