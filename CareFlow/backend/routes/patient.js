const patientControllers = require("../controllers/patient")
const queueControllers = require('../controllers/in-queue');
const visitControllers = require('../controllers/visits');
const { requireDoctor, allowPatientRegistration } = require('../middleware/roles');

const { body, query, param } = require("express-validator")
const express = require("express")

const router = express.Router()
router.get('/in-queue', queueControllers.getQueue);
router.post('/in-queue', queueControllers.addPatient);
router.delete('/in-queue', requireDoctor, queueControllers.closeClinic);
router.post('/in-queue/:id/open-visit', requireDoctor, queueControllers.openVisit);
router.get('/patients/:id/visits', requireDoctor, [
    param('id').isInt({ min: 1, max: 2147483647 }).withMessage('رقم المريض غير صالح.'),
], visitControllers.getVisits);
router.post('/patients/:id/visits', requireDoctor, [
    param('id').isInt({ min: 1, max: 2147483647 }).withMessage('رقم المريض غير صالح.'),
    ...['symptoms', 'examinationNotes', 'diagnosis', 'treatment', 'medications', 'notes'].map(field =>
        body(field).optional({ values: 'null' }).isString().bail().trim().isLength({ max: 5000 })
            .withMessage('الحد الأقصى لكل حقل 5000 حرف.')),
    body('followUpDate').optional({ values: 'falsy' }).isString().bail()
        .matches(/^\d{4}-\d{2}-\d{2}$/).bail().isDate({ format: 'YYYY-MM-DD', strictMode: true })
        .withMessage('تاريخ المتابعة غير صالح.'),
], visitControllers.createVisit);
const medicalInfoValidation = [
    body('bloodType').optional({ values: 'null' }).isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
        .withMessage('فصيلة الدم غير صالحة.'),
    ...['heightCm', 'weightKg'].map(field => body(field).optional({ values: 'null' })
        .custom(value => typeof value === 'number' && Number.isFinite(value) && value >= 0.01 && value <= 999.99)
        .withMessage('الطول والوزن يجب أن يكونا بين 0.01 و999.99.')),
    ...['allergies', 'chronicConditions', 'notes'].map(field => body(field).optional({ values: 'null' })
        .isString().bail().trim().isLength({ max: 5000 }).withMessage('الحد الأقصى للنص 5000 حرف.')),
];

router.get("/patient", [
    query('first_name').optional().isLength({ min: 2 }).withMessage('no first name '),
    query('last_name').optional().isLength({ min: 2 }).withMessage('no last name ')
], patientControllers.getPatient);
router.get("/patients", [
    query('q').optional().custom(value => typeof value === 'string')
        .withMessage('يجب أن يكون البحث نصاً واحداً.').bail().trim().isLength({ max: 150 })
        .withMessage('الحد الأقصى للبحث 150 حرفاً.'),
], patientControllers.getPatients);
router.get('/patients/:id', requireDoctor, [
    param('id').isInt({ min: 1, max: 2147483647 }).withMessage('Patient ID must be a positive integer.'),
], patientControllers.getPatientById);

router.post("/patients/new", allowPatientRegistration, [
    ...medicalInfoValidation,
    body('name').isString().bail().trim().notEmpty().isLength({ max: 120 }).withMessage('Patient name is required (maximum 120 characters).'),
    body('dateOfBirth').optional({ values: 'falsy' }).isString().bail()
        .matches(/^\d{4}-\d{2}-\d{2}$/).bail().isDate({ format: 'YYYY-MM-DD', strictMode: true }).bail()
        .custom(value => {
            const now = new Date();
            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            return value <= today;
        }).withMessage('Date of birth must be a valid date, not in the future.'),
    body('gender').optional({ values: 'falsy' }).isIn(['male', 'female', 'other', 'prefer-not-to-say']).withMessage('Invalid gender value'),
    ...Object.entries({
        phone: 40, address: 250, city: 100, country: 100,
        emergencyContactName: 120, emergencyContactRelationship: 100, emergencyContactPhone: 40,
    }).map(([field, max]) => body(field).optional({ values: 'null' }).isString().bail().trim().isLength({ max })),
], patientControllers.postPatient);


module.exports = router;
