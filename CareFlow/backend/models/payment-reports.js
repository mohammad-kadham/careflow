const db = require('../data/db');
const fields = "id, clinic_id AS clinicId, user_id AS userId, plan, amount_iqd AS amountIqd, sender_phone AS senderPhone, transaction_reference AS transactionReference, status, DATE_FORMAT(submitted_at, '%Y-%m-%dT%H:%i:%sZ') AS submittedAt";
exports.list = clinicId => db.query(`SELECT ${fields} FROM manual_payment_reports WHERE clinic_id = ? ORDER BY id DESC LIMIT 20`, [clinicId]);
exports.findByReference = reference => db.query(`SELECT ${fields} FROM manual_payment_reports WHERE transaction_reference = ?`, [reference]);
exports.create = ({ clinicId, userId, plan, amountIqd, senderPhone, transactionReference }) => db.query(
    'INSERT INTO manual_payment_reports (clinic_id, user_id, plan, amount_iqd, sender_phone, transaction_reference, submitted_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
    [clinicId, userId, plan, amountIqd, senderPhone, transactionReference]
);
