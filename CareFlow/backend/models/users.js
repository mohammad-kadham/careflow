const db = require('../data/db');

class User {
    constructor(name, email, password, role = 'doctor', clinicName = null, phone = null, doctorId = null, clinicId = null) {
        Object.assign(this, { name, email, password, role, clinic_name: clinicName, phone, doctor_id: doctorId, clinic_id: clinicId });
        this.email_verification_required = 1;
    }

    save(connection = db) {
        if (!Number.isSafeInteger(this.clinic_id) || this.clinic_id < 1) throw new Error('A clinic is required.');
        return connection.query(
            'INSERT INTO users (name, email, password, role, clinic_name, phone, doctor_id, clinic_id, email_verification_required) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
            [this.name, this.email, this.password, this.role, this.clinic_name, this.phone, this.doctor_id, this.clinic_id]
        );
    }

    static async createDoctor({ name, email, password, clinic_name, phone }) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const [clinic] = await connection.query('INSERT INTO clinics (name, subscription_required) VALUES (?, 1)', [clinic_name]);
            const user = new User(name, email, password, 'doctor', clinic_name, phone, null, clinic.insertId);
            const [result] = await user.save(connection);
            user.id = result.insertId;
            user.subscription_required = 1;
            await connection.commit();
            return user;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally { connection.release(); }
    }

    static findUserByEmail(email) {
        return db.query("SELECT u.*, c.subscription_required, c.subscription_plan, DATE_FORMAT(c.subscription_expires_at, '%Y-%m-%dT%H:%i:%sZ') AS subscription_expires_at, (c.subscription_required = 0 OR (c.subscription_plan IN ('basic', 'advanced') AND c.subscription_expires_at > UTC_TIMESTAMP())) AS subscription_active, c.name AS clinic_name FROM users u JOIN clinics c ON c.id = u.clinic_id WHERE u.email = ?", [email]);
    }

    static findStaffByDoctorId(doctorId, clinicId) {
        return db.query(
            "SELECT u.id, u.name, u.email, u.role, c.name AS clinic_name, u.phone, u.doctor_id, u.clinic_id FROM users u JOIN clinics c ON c.id = u.clinic_id WHERE u.doctor_id = ? AND u.clinic_id = ? AND u.role = 'staff'",
            [doctorId, clinicId]
        );
    }

    static findUserById(id) {
        return db.query(
            "SELECT u.id, u.name, u.email, u.role, u.email_verification_required, u.email_verified_at, c.subscription_required, c.subscription_plan, DATE_FORMAT(c.subscription_expires_at, '%Y-%m-%dT%H:%i:%sZ') AS subscription_expires_at, (c.subscription_required = 0 OR (c.subscription_plan IN ('basic', 'advanced') AND c.subscription_expires_at > UTC_TIMESTAMP())) AS subscription_active, c.name AS clinic_name, u.phone, u.doctor_id, u.clinic_id FROM users u JOIN clinics c ON c.id = u.clinic_id WHERE u.id = ?", [id]
        );
    }
}

module.exports = User;
