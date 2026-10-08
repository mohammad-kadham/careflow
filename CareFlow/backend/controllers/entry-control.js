const EntryControl = require('../models/entry-control');

exports.get = async (req, res, next) => {
    try {
        const doctorId = req.user.role === 'doctor' ? req.user.id : req.user.doctor_id;
        const paused = await EntryControl.get(req.user.clinic_id, doctorId);
        const staff = req.user.role === 'doctor' ? await require('./buzzer').getStatus(req.user) : undefined;
        res.json({ paused, ...(staff ? { staff } : {}) });
    } catch (error) { next(error); }
};

exports.set = async (req, res, next) => {
    if (typeof req.body?.paused !== 'boolean') {
        return res.status(400).json({ error: 'يجب تحديد إيقاف الدخول أو استئنافه.' });
    }
    try {
        await EntryControl.set(req.user.clinic_id, req.user.id, req.body.paused);
        res.json({ paused: req.body.paused });
    } catch (error) { next(error); }
};
