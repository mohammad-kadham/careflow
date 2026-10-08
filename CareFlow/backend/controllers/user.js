const { subscriptionFor } = require('../middleware/subscription');
const User = require('../models/users');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult, matchedData } = require('express-validator');
const auth = require('../config/auth');

function validateRequest(req, res) {
    const errors = validationResult(req);
    if (errors.isEmpty()) return true;
    res.status(400).json({
        error: errors.array()[0].msg,
        errors: errors.array().map(({ path, msg }) => ({ field: path, message: msg })),
    });
    return false;
}

function publicUser(user) {
    return {
        id: user.id, name: user.name, email: user.email, role: user.role,
        clinic_name: user.clinic_name ?? null, phone: user.phone ?? null,
        doctor_id: user.doctor_id ?? null, clinic_id: user.clinic_id, subscription: subscriptionFor(user),
    };
}

exports.signup = async (req, res, next) => {
    if (!validateRequest(req, res)) return;
    try {
        const { name, email, password, clinic_name, phone } = matchedData(req, { locations: ['body'] });
        const [rows] = await User.findUserByEmail(email);
        if (rows[0]) return res.status(409).json({ error: 'Email already exists.' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.createDoctor({ name, email, password: hashedPassword, clinic_name, phone });
        res.status(201).json({ message: 'User created. Please log in.', user: publicUser(user) });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Email already exists.' });
        }
        next(error);
    }
};

exports.getStaff = async (req, res, next) => {
    try {
        const [rows] = await User.findStaffByDoctorId(req.user.id, req.user.clinic_id);
        res.json({ staff: rows.map(publicUser) });
    } catch (error) { next(error); }
};

exports.createStaff = async (req, res, next) => {
    if (!validateRequest(req, res)) return;
    try {
        const [existing] = await User.findStaffByDoctorId(req.user.id, req.user.clinic_id);
        if (existing.length) {
            return res.status(409).json({ code: 'STAFF_LIMIT', error: 'لديك حساب موظف بالفعل.' });
        }
        const { name, email, password, phone } = matchedData(req, { locations: ['body'] });
        const [duplicates] = await User.findUserByEmail(email);
        if (duplicates.length) {
            return res.status(409).json({ code: 'EMAIL_EXISTS', error: 'البريد الإلكتروني مسجل بالفعل.' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        // Role, doctor and clinic always come from the authenticated doctor.
        const staff = new User(name, email, hashedPassword, 'staff', req.user.clinic_name, phone, req.user.id, req.user.clinic_id);
        const [result] = await staff.save();
        staff.id = result.insertId;
        res.status(201).json({ message: 'تم إنشاء حساب الموظف.', user: publicUser(staff) });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ code: 'ACCOUNT_CONFLICT', error: 'البريد مسجل أو تم إنشاء حساب موظف لهذا الطبيب. حدّث القائمة.' });
        }
        next(error);
    }
};

exports.login = async (req, res, next) => {
    if (!validateRequest(req, res)) return;
    try {
        const { email, password } = matchedData(req, { locations: ['body'] });
        const [rows] = await User.findUserByEmail(email);
        const user = rows[0];
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Email or password is incorrect.' });
        }

        const token = jwt.sign({ userId: user.id }, auth.secret, {
            algorithm: 'HS256',
            expiresIn: auth.lifetimeSeconds,
            issuer: auth.issuer,
            audience: auth.audience,
        });
        res.cookie(auth.cookieName, token, {
            ...auth.cookieOptions,
            maxAge: auth.lifetimeSeconds * 1000,
        });
        res.status(200).json({ message: 'Login successful.', user: publicUser(user) });
    } catch (error) {
        next(error);
    }
};

exports.me = (req, res) => {
    res.status(200).json({ user: publicUser(req.user) });
};

exports.logout = (req, res) => {
    // Clear even an expired cookie. JWTs are otherwise valid until their expiry.
    res.clearCookie(auth.cookieName, auth.cookieOptions);
    res.status(200).json({ message: 'Logged out.' });
};
