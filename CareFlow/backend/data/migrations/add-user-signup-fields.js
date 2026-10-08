// Nullable fields preserve existing accounts; the signup API requires both.
async function addUserSignupFields(db) {
    const [columns] = await db.query('SHOW COLUMNS FROM users');
    const existing = new Set(columns.map(column => column.Field));
    const additions = [
        ['clinic_name', 'ALTER TABLE users ADD COLUMN clinic_name VARCHAR(150) NULL'],
        ['phone', 'ALTER TABLE users ADD COLUMN phone VARCHAR(40) NULL'],
    ];
    for (const [name, sql] of additions) {
        if (existing.has(name)) continue;
        try {
            await db.query(sql);
        } catch (error) {
            // Another server process may have applied the same change.
            if (error.code !== 'ER_DUP_FIELDNAME') throw error;
        }
    }
}

if (require.main === module) {
    const db = require('../db');
    addUserSignupFields(db)
        .then(() => console.log('User signup fields are ready.'))
        .catch(error => {
            console.error('User migration failed:', error.message);
            process.exitCode = 1;
        })
        .finally(() => db.end());
}

module.exports = addUserSignupFields;
