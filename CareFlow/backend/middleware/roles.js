function requireDoctor(req, res, next) {
    if (req.user?.role !== 'doctor') {
        return res.status(403).json({ error: 'هذه العملية متاحة للطبيب فقط.' });
    }
    next();
}

function allowPatientRegistration(req, res, next) {
    const medicalFields = ['bloodType', 'heightCm', 'weightKg', 'allergies', 'chronicConditions', 'notes'];
    if (req.user.role === 'staff' && medicalFields.some(field =>
        req.body?.[field] !== undefined && req.body[field] !== null && req.body[field] !== '')) {
        return res.status(403).json({ error: 'يمكن للموظف تسجيل بيانات المريض الأساسية فقط.' });
    }
    next();
}

module.exports = { requireDoctor, allowPatientRegistration };
