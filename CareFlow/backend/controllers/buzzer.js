const { randomUUID } = require('node:crypto');
const User = require('../models/users');
const EntryControl = require('../models/entry-control');

// Transient presence/receipts for the single API process.
const signals = new Map();
const clients = new Map();
const deliveryLifetime = 30000;
const receiptLifetime = 10 * 60 * 1000;
const onlineLifetime = 15000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keyFor = user => user.clinic_id + ':' + user.id;
function prune() {
    const now = Date.now();
    for (const [key, event] of signals) {
        if (now - event.createdAt >= receiptLifetime) signals.delete(key);
    }
    for (const [key, client] of clients) {
        if (now - client.lastSeen >= onlineLifetime) clients.delete(key);
    }
}
function ownedEvent(user) {
    const event = signals.get(keyFor(user));
    return event?.doctorId === user.doctor_id ? event : null;
}
function publicEvent(event) {
    if (!event || (!event.receivedAt && Date.now() - event.createdAt >= deliveryLifetime)) return null;
    return { id: event.id, createdAt: event.createdAt, acknowledged: Boolean(event.acknowledgedAt) };
}

exports.getStatus = async (doctor) => {
    prune();
    const [staff] = await User.findStaffByDoctorId(doctor.id, doctor.clinic_id);
    if (!staff[0]) return { linked: false, online: false, soundEnabled: false, alert: null };
    const key = keyFor(staff[0]);
    const live = [...clients.values()].filter(client => client.staffKey === key && client.doctorId === doctor.id);
    const event = signals.get(key);
    const own = event?.doctorId === doctor.id ? event : null;
    return {
        linked: true,
        online: live.length > 0,
        soundEnabled: live.some(client => client.soundEnabled),
        alert: own ? {
            id: own.id, createdAt: own.createdAt,
            state: own.acknowledgedAt ? 'acknowledged' : own.receivedAt ? 'received'
                : Date.now() - own.createdAt >= deliveryLifetime ? 'expired' : 'pending',
        } : null,
    };
};

exports.send = async (req, res, next) => {
    try {
        const [staff] = await User.findStaffByDoctorId(req.user.id, req.user.clinic_id);
        if (!staff[0]) return res.status(404).json({ error: 'أنشئ حساب الموظف من إدارة الموظفين أولاً.' });
        prune();
        const key = keyFor(staff[0]);
        const previous = signals.get(key);
        if (previous && Date.now() - previous.createdAt < 3000) {
            res.set('Retry-After', '3');
            return res.status(429).json({ error: 'انتظر بضع ثوانٍ قبل إرسال نداء آخر.' });
        }
        const event = { id: randomUUID(), createdAt: Date.now(), doctorId: req.user.id };
        signals.set(key, event);
        res.status(202).json({ message: 'تم إرسال النداء.', eventId: event.id, createdAt: event.createdAt });
    } catch (error) { next(error); }
};

// Legacy read remains available but does not claim browser presence or receipt.
exports.receive = async (req, res, next) => {
    if (req.user.role !== 'staff') return res.status(403).json({ error: 'استقبال النداء متاح للموظف فقط.' });
    try {
        const paused = await EntryControl.get(req.user.clinic_id, req.user.doctor_id);
        prune();
        res.json({ paused, event: publicEvent(ownedEvent(req.user)) });
    } catch (error) { next(error); }
};

exports.poll = async (req, res, next) => {
    if (req.user.role !== 'staff') return res.status(403).json({ error: 'استقبال النداء متاح للموظف فقط.' });
    const { clientId, soundEnabled, receivedEventId } = req.body || {};
    if (!uuid.test(clientId || '') || typeof soundEnabled !== 'boolean' ||
        (receivedEventId != null && !uuid.test(receivedEventId))) {
        return res.status(400).json({ error: 'بيانات حالة الاتصال غير صالحة.' });
    }
    try {
        const paused = await EntryControl.get(req.user.clinic_id, req.user.doctor_id);
        prune();
        clients.set(keyFor(req.user) + ':' + clientId, {
            staffKey: keyFor(req.user), doctorId: req.user.doctor_id, soundEnabled, lastSeen: Date.now(),
        });
        const event = ownedEvent(req.user);
        // A subsequent poll confirms the browser actually received this event.
        if (event && event.id === receivedEventId && !event.receivedAt) event.receivedAt = Date.now();
        res.json({ paused, event: publicEvent(event) });
    } catch (error) { next(error); }
};

exports.acknowledge = (req, res) => {
    if (req.user.role !== 'staff') return res.status(403).json({ error: 'تأكيد النداء متاح للموظف فقط.' });
    if (!uuid.test(req.body?.eventId || '')) return res.status(400).json({ error: 'رقم النداء غير صالح.' });
    prune();
    const event = ownedEvent(req.user);
    if (!event || event.id !== req.body.eventId) {
        return res.status(404).json({ error: 'انتهت صلاحية النداء أو تم إرسال نداء أحدث.' });
    }
    event.receivedAt ||= Date.now();
    event.acknowledgedAt ||= Date.now();
    res.json({ acknowledged: true, eventId: event.id });
};
