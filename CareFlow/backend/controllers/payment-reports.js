const reports = require('../models/payment-reports');
// The customer cannot choose the amount, recipient, ownership, or review status.
const prices = Object.freeze({ basic: 22500, advanced: 37500 });
const normalize = value => value.normalize('NFKC').replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).trim();

exports.list = async (req, res, next) => {
    try {
        const [rows] = await reports.list(req.user.clinic_id);
        res.json({ reports: rows });
    } catch (error) { next(error); }
};

exports.create = async (req, res, next) => {
    const { plan, senderPhone, transactionReference } = req.body || {};
    if (typeof plan !== 'string' || !Object.hasOwn(prices, plan) ||
        typeof senderPhone !== 'string' || senderPhone.length > 40 ||
        typeof transactionReference !== 'string' || transactionReference.length > 100) {
        return res.status(400).json({ error: 'اختر الباقة وأدخل رقم هاتف المرسل ورقم عملية التحويل.' });
    }
    const phone = normalize(senderPhone).replace(/[\s()-]/g, '');
    const reference = normalize(transactionReference).toUpperCase();
    if (!/^\+?\d{7,15}$/.test(phone) || !reference || reference.length > 100 || /[\u0000-\u001F\u007F]/.test(reference)) {
        return res.status(400).json({ error: 'تحقق من رقم هاتف المرسل ورقم العملية الموجود في الإيصال.' });
    }
    const values = { clinicId: req.user.clinic_id, userId: req.user.id, plan,
        amountIqd: prices[plan], senderPhone: phone, transactionReference: reference };
    try {
        let created = true;
        try { await reports.create(values); }
        catch (error) {
            if (error.code !== 'ER_DUP_ENTRY') throw error;
            created = false;
        }
        const [rows] = await reports.findByReference(reference);
        const report = rows[0];
        if (!report) throw new Error('Payment report could not be read after insert');
        if (report.clinicId !== values.clinicId || report.plan !== plan || report.senderPhone !== phone) {
            return res.status(409).json({ error: 'رقم العملية مسجل مسبقاً ببيانات أخرى. تحقق من الإيصال أو تواصل مع الإدارة.' });
        }
        res.status(created ? 201 : 200).json({ report });
    } catch (error) { next(error); }
};
