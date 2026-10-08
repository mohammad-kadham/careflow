const db = require('../data/db');
const { normalizeSearch, searchExpression, searchPattern } = require('./patient-search');

const columns = {
    name: 'name',
    dateOfBirth: 'date_of_birth',
    gender: 'gender',
    phone: 'phone',
    address: 'address',
    city: 'city',
    country: 'country',
    emergencyContactName: 'emergency_contact_name',
    emergencyContactRelationship: 'emergency_contact_relationship',
    emergencyContactPhone: 'emergency_contact_phone',
};
const selectColumns = ['id', 'clinic_id', ...Object.entries(columns).map(([field, column]) => `${column} AS ${field}`), 'created_at', 'updated_at'].join(', ');

class Patients {
    constructor(data = {}, clinicId) {
        this.clinic_id = clinicId;
        for (const field of Object.keys(columns)) {
            this[field] = typeof data[field] === 'string' ? data[field].trim() : null;
        }
        this.dateOfBirth = this.dateOfBirth || null;
        this.gender = this.gender || null;
    }

    save(connection = db) {
        if (!Number.isSafeInteger(this.clinic_id) || this.clinic_id < 1) throw new Error('A clinic is required.');
        const fields = Object.keys(columns);
        return connection.query(
            `INSERT INTO patients (clinic_id, ${Object.values(columns).join(', ')}) VALUES (?, ${fields.map(() => '?').join(', ')})`,
            [this.clinic_id, ...fields.map(field => this[field])]
        );
    }

    async saveWithMedicalInfo(data) {
        const medicalValues = ['bloodType', 'heightCm', 'weightKg', 'allergies', 'chronicConditions', 'notes']
            .map(field => data[field] === '' || data[field] === undefined ? null : data[field]);
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const result = await this.save(connection);
            if (medicalValues.some(value => value !== null)) {
                await connection.query(`INSERT INTO patient_medical_info
                    (patient_id, blood_type, height_cm, weight_kg, allergies, chronic_conditions, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`, [result[0].insertId, ...medicalValues]);
            }
            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static getPatientByName(firstName = '', lastName = '', clinicId) {
        return db.query(`SELECT ${selectColumns} FROM patients WHERE name = ? AND clinic_id = ?`,
            [[firstName, lastName].filter(Boolean).join(' ').trim(), clinicId]);
    }

    static searchPatients(clinicId, search = '') {
        const terms = normalizeSearch(search).split(/\s+/).filter(Boolean);
        if (!terms.length) return Promise.resolve([[]]);
        const conditions = terms.map(() => searchExpression + " LIKE ? ESCAPE '!'").join(' AND ');
        return db.query(
            `SELECT ${selectColumns},
                EXISTS (SELECT 1 FROM in_queue q WHERE q.patient_id = patients.id AND q.visit_completed_at IS NULL) AS inQueue
             FROM patients WHERE clinic_id = ? AND ${conditions} ORDER BY name, id`,
            [clinicId, ...terms.map(searchPattern)]
        );
    }

    static async getPatientById(patientId, clinicId) {
        const [patients] = await db.query(
            `SELECT ${selectColumns} FROM patients WHERE id = ? AND clinic_id = ?`, [patientId, clinicId]
        );
        if (patients.length === 0) return null;

        const [medicalRecords] = await db.query(`
            SELECT id, patient_id AS patientId, blood_type AS bloodType,
                   height_cm AS heightCm, weight_kg AS weightKg, allergies,
                   chronic_conditions AS chronicConditions, notes
            FROM patient_medical_info
            WHERE patient_id = ? AND EXISTS (SELECT 1 FROM patients WHERE patients.id = patient_medical_info.patient_id AND patients.clinic_id = ?)
            ORDER BY id
        `, [patientId, clinicId]);

        return { ...patients[0], medicalRecords };
    }

    static getFullNames(clinicId) {
        return db.query('SELECT name FROM patients WHERE clinic_id = ?', [clinicId]);
    }
}

module.exports = Patients;
