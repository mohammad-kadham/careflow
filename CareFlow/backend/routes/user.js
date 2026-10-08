const { requireSubscription } = require('../middleware/subscription');
const express = require('express');
const { body } = require('express-validator');
const userControllers = require('../controllers/user');
const { requireAuth } = require('../middleware/auth');
const { requireDoctor } = require('../middleware/roles');

const router = express.Router();

const emailValidation = () => body('email')
    .isString().bail().trim().isLength({ max: 255 }).bail().isEmail()
    .withMessage('Enter a valid email address.');

const passwordValidation = () => body('password')
    .isString().bail().notEmpty().withMessage('Password is required.').bail()
    .custom(value => Buffer.byteLength(value, 'utf8') <= 72)
    .withMessage('Password must not exceed 72 bytes.');

router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

router.post('/user/new', [
    body('name').isString().bail().trim().isLength({ min: 1, max: 100 })
        .withMessage('Name is required (maximum 100 characters).'),
    body('clinic_name').isString().bail().trim().isLength({ min: 1, max: 150 })
        .withMessage('Clinic name is required (maximum 150 characters).'),
    body('phone').isString().bail().trim().isLength({ min: 1, max: 40 })
        .withMessage('Phone number is required (maximum 40 characters).'),
    emailValidation(),
    passwordValidation().bail().isLength({ min: 6 })
        .withMessage('Password must contain at least 6 characters.'),
], userControllers.signup);

router.post('/user/login', [
    emailValidation(),
    passwordValidation(),
], userControllers.login);

router.get('/user/staff', requireAuth, requireSubscription, requireDoctor, userControllers.getStaff);
router.post('/user/staff', requireAuth, requireSubscription, requireDoctor, [
    body('name').isString().bail().trim().isLength({ min: 1, max: 100 })
        .withMessage('أدخل اسم الموظف (100 حرف كحد أقصى).'),
    body('phone').isString().bail().trim().isLength({ min: 1, max: 40 })
        .withMessage('أدخل رقم الهاتف (40 حرفاً كحد أقصى).'),
    emailValidation(),
    passwordValidation().bail().isLength({ min: 6 })
        .withMessage('كلمة السر يجب أن تتكون من 6 أحرف على الأقل.'),
], userControllers.createStaff);

const entryControl = require('../controllers/entry-control');
router.get('/user/entry-state', requireAuth, requireSubscription, entryControl.get);
router.post('/user/entry-state', requireAuth, requireSubscription, requireDoctor, entryControl.set);

const buzzer = require('../controllers/buzzer');
router.post('/user/buzzer', requireAuth, requireSubscription, requireDoctor, buzzer.send);
router.get('/user/buzzer', requireAuth, requireSubscription, buzzer.receive);
router.post('/user/buzzer/poll', requireAuth, requireSubscription, buzzer.poll);
router.post('/user/buzzer/ack', requireAuth, requireSubscription, buzzer.acknowledge);

router.get('/user/me', requireAuth, userControllers.me);
router.post('/user/logout', userControllers.logout);

// Reporting a transfer must be available before subscription approval.
const paymentReports = require('../controllers/payment-reports');
router.get('/user/payment-reports', requireAuth, requireDoctor, paymentReports.list);
router.post('/user/payment-reports', requireAuth, requireDoctor, paymentReports.create);
module.exports = router;
