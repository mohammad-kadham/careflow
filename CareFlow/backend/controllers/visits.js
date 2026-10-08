const { validationResult, matchedData } = require('express-validator');
const Visits = require('../models/visits');

exports.getVisits = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    try {
        const patientId = Number(req.params.id);
        if (!await Visits.patientExists(patientId, req.user.clinic_id)) return res.status(404).json({ error: 'المريض غير موجود.' });
        const [visits] = await Visits.getForPatient(patientId, req.user.clinic_id);
        res.json({ visits });
    } catch (error) { next(error); }
};

exports.createVisit = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    const data = matchedData(req, { locations: ['body'] });
    if (!['symptoms', 'examinationNotes', 'diagnosis', 'treatment', 'medications', 'notes'].some(field => data[field])) {
        return res.status(400).json({ error: 'أدخل تفاصيل الزيارة في حقل واحد على الأقل.' });
    }
    try {
        const [result] = await Visits.create(Number(req.params.id), data, req.user.id, req.user.clinic_id);
        res.status(201).json({ message: 'تم حفظ الزيارة.', visitId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(404).json({ error: 'المريض غير موجود.' });
        next(error);
    }
};
