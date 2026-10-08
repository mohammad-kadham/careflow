// Existing doctors receive separate clinics. Staff inherit their linked doctor's
// clinic. Unassigned legacy patients stay inaccessible until explicitly handled.
async function addClinics(db) {
    const connection = await db.getConnection();
    let locked = false;
    try {
        const [[lock]] = await connection.query("SELECT GET_LOCK(CONCAT(DATABASE(), ':clinic-migration'), 30) AS acquired");
        if (!lock.acquired) throw new Error('Could not acquire clinic migration lock.');
        locked = true;
        await connection.query('CREATE TABLE IF NOT EXISTS clinics (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
        for (const table of ['users', 'patients']) {
            const [columns] = await connection.query('SHOW COLUMNS FROM ' + table);
            if (!columns.some(column => column.Field === 'clinic_id')) {
                await connection.query('ALTER TABLE ' + table + ' ADD COLUMN clinic_id INT NULL');
            }
        }

        await connection.beginTransaction();
        try {
            const [users] = await connection.query('SELECT id, role, doctor_id, clinic_id, clinic_name FROM users ORDER BY id FOR UPDATE');
            const clinicsByUser = new Map(users.filter(user => user.clinic_id).map(user => [user.id, user.clinic_id]));
            async function assign(user, clinicId) {
                if (!clinicId) {
                    const name = user.clinic_name?.trim() || ('عيادة الحساب #' + user.id);
                    const [clinic] = await connection.query('INSERT INTO clinics (name) VALUES (?)', [name]);
                    clinicId = clinic.insertId;
                }
                await connection.query('UPDATE users SET clinic_id = ? WHERE id = ? AND clinic_id IS NULL', [clinicId, user.id]);
                clinicsByUser.set(user.id, clinicId);
            }
            for (const user of users.filter(user => user.role === 'doctor' && !user.clinic_id)) await assign(user);
            for (const user of users.filter(user => user.role === 'staff' && !user.clinic_id)) {
                await assign(user, clinicsByUser.get(user.doctor_id));
            }
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        }

        for (const table of ['users', 'patients']) {
            const constraint = 'fk_' + table + '_clinic';
            const [constraints] = await connection.query(
                'SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?',
                [table, constraint]
            );
            if (!constraints.length) {
                await connection.query('ALTER TABLE ' + table + ' ADD CONSTRAINT ' + constraint + ' FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE RESTRICT');
            }
            const [[missing]] = await connection.query('SELECT COUNT(*) AS total FROM ' + table + ' WHERE clinic_id IS NULL');
            const [columns] = await connection.query('SHOW COLUMNS FROM ' + table);
            if (!missing.total && columns.find(column => column.Field === 'clinic_id').Null === 'YES') {
                await connection.query('ALTER TABLE ' + table + ' MODIFY COLUMN clinic_id INT NOT NULL');
            }
        }
        const [[remaining]] = await connection.query('SELECT COUNT(*) AS total FROM patients WHERE clinic_id IS NULL');
        return { unassignedPatients: remaining.total };
    } finally {
        if (locked) await connection.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':clinic-migration'))");
        connection.release();
    }
}

if (require.main === module) {
    const db = require('../db');
    addClinics(db).then(result => console.log(JSON.stringify(result)))
        .catch(error => { console.error(error.message); process.exitCode = 1; })
        .finally(() => db.end());
}

module.exports = addClinics;
