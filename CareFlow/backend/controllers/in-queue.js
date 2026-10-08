const queue = require('../models/in-queue');

exports.getQueue = async (req, res, next) => {
    try {
        const [patients] = await queue.getAll(req.user.clinic_id);
        res.json({ patients });
    } catch (error) { next(error); }
};

exports.addPatient = async (req, res, next) => {
    const { patientId } = req.body;
    if (!Number.isSafeInteger(patientId) || patientId < 1) {
        return res.status(400).json({ error: 'رقم المريض غير صالح.' });
    }
    try {
        const [result] = await queue.add(patientId, req.user.clinic_id);
        if (!result.affectedRows) return res.status(404).json({ error: 'يجب تسجيل المريض في عيادتك أولاً.' });
        res.status(201).json({ message: 'تمت إضافة المريض إلى قائمة الانتظار.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'المريض موجود في قائمة الانتظار بالفعل.' });
        }
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'يجب تسجيل المريض أولاً.' });
        }
        next(error);
    }
};

exports.openVisit = async (req, res, next) => {
    const patientId = Number(req.params.id);
    if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(patientId) || patientId > 2147483647) {
        return res.status(400).json({ error: 'رقم المريض غير صالح.' });
    }
    try {
        if (!await queue.openVisit(patientId, req.user.clinic_id)) {
            return res.status(404).json({ error: 'المريض لم يعد في قائمة انتظار عيادتك. حدّث القائمة.' });
        }
        res.json({ patientId, visitOpen: true });
    } catch (error) { next(error); }
};

exports.closeClinic = async (req, res, next) => {
    try {
        const [result] = await queue.clear(req.user.clinic_id);
        res.json({ cleared: result.affectedRows });
    } catch (error) { next(error); }
};
