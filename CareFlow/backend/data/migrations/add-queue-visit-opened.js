module.exports = async function addQueueVisitOpened(db) {
    const [columns] = await db.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'in_queue' AND COLUMN_NAME = 'visit_opened_at'"
    );
    if (!columns.length) {
        try {
            await db.query('ALTER TABLE in_queue ADD COLUMN visit_opened_at DATETIME NULL');
        } catch (error) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
    }
};
