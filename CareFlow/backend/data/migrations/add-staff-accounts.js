async function addStaffAccounts(db) {
    const [columns] = await db.query('SHOW COLUMNS FROM users');
    if (!columns.some(column => column.Field === 'doctor_id')) {
        try {
            await db.query('ALTER TABLE users ADD COLUMN doctor_id INT NULL');
        } catch (error) {
            if (error.code !== 'ER_DUP_FIELDNAME') throw error;
        }
    }
    const [indexes] = await db.query('SHOW INDEX FROM users');
    if (!indexes.some(index => index.Key_name === 'uq_users_staff_doctor')) {
        try {
            await db.query('ALTER TABLE users ADD UNIQUE KEY uq_users_staff_doctor (doctor_id)');
        } catch (error) {
            if (error.code !== 'ER_DUP_KEYNAME') throw error;
        }
    }
    const [constraints] = await db.query(
        "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND CONSTRAINT_NAME = 'fk_users_doctor'"
    );
    if (!constraints.length) {
        try {
            await db.query('ALTER TABLE users ADD CONSTRAINT fk_users_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT');
        } catch (error) {
            if (error.code !== 'ER_FK_DUP_NAME') throw error;
        }
    }
    const role = columns.find(column => column.Field === 'role');
    if (role.Type !== "enum('doctor','staff')" || role.Null !== 'NO' || role.Default !== 'doctor') {
        // Preserve older admin accounts as doctors; no accounts are deleted.
        await db.query("UPDATE users SET role = 'doctor' WHERE role = 'admin' OR role IS NULL");
        await db.query("ALTER TABLE users MODIFY COLUMN role ENUM('doctor', 'staff') NOT NULL DEFAULT 'doctor'");
    }
}

if (require.main === module) {
    const db = require('../db');
    addStaffAccounts(db)
        .then(() => console.log('Doctor and staff account schema is ready.'))
        .catch(error => { console.error(error.message); process.exitCode = 1; })
        .finally(() => db.end());
}

module.exports = addStaffAccounts;
