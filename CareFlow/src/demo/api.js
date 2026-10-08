// Browser-only sample workspace. Never calls fetch or writes to the clinic API.
export const demoUsers = {
    doctor: { id: 1001, name: 'طبيب تجريبي', role: 'doctor', clinic_id: 1000, clinic_name: 'العيادة التجريبية', email: 'doctor@example.com' },
    staff: { id: 1002, name: 'موظف تجريبي', role: 'staff', doctor_id: 1001, clinic_id: 1000, clinic_name: 'العيادة التجريبية', email: 'staff@example.com' },
};
let data;
export function resetDemo() {
    const now = new Date().toISOString();
    data = {
        patients: [
            { id: 1, name: 'أحمد — مريض تجريبي', gender: 'male', dateOfBirth: '1990-05-12', city: 'بغداد' },
            { id: 2, name: 'سارة — مريضة تجريبية', gender: 'female', dateOfBirth: '1985-08-21', city: 'البصرة' },
            { id: 3, name: 'علي — مريض تجريبي', gender: 'male', dateOfBirth: '2000-03-07', city: 'أربيل' },
        ].map(patient => ({ ...patient, clinic_id: 1000, country: 'العراق', phone: '', medicalRecords: [{ id: patient.id, notes: 'سجل وهمي لتجربة الواجهة.' }] })),
        queue: [{ id: 1, checkedInAt: now }, { id: 2, checkedInAt: now }],
        visits: [{ id: 1, patientId: 1, visitDate: now, notes: 'زيارة تجريبية سابقة.' }],
        paused: false, event: null, staffSeen: 0, soundEnabled: false,
    };
}
resetDemo();
const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).trim();
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function demoFetch(path, options = {}, role = 'doctor') {
    options.signal?.throwIfAborted();
    const url = new URL(path, 'https://demo.invalid');
    const route = url.pathname;
    const method = options.method || 'GET';
    let body = {};
    try { body = options.body ? JSON.parse(options.body) : {}; }
    catch { return reply({ error: 'بيانات غير صالحة.' }, 400); }
    const doctor = role === 'doctor';
    const denied = () => reply({ error: 'هذه الميزة متاحة للطبيب فقط.' }, 403);
    const summary = patient => {
        const details = { ...patient };
        delete details.medicalRecords;
        return { ...details, inQueue: Number(data.queue.some(item => item.id === patient.id && !item.visitCompleted)) };
    };
    if (route === '/user/me') return reply({ user: demoUsers[role] || demoUsers.doctor });
    if (route === '/user/logout') return reply({ message: 'تم الخروج من التجربة.' });
    if (route === '/user/staff') {
        if (!doctor) return denied();
        return method === 'GET' ? reply({ staff: [demoUsers.staff] })
            : reply({ code: 'STAFF_LIMIT', error: 'حساب الموظف التجريبي جاهز. استخدم زر «الموظف» أعلى الشاشة.' }, 409);
    }
    if (route === '/patients' && method === 'GET') {
        const terms = normalize(url.searchParams.get('q')).split(/\s+/).filter(Boolean);
        return reply({ patients: terms.length ? data.patients.filter(patient => {
            const text = normalize([patient.name, patient.id, patient.phone, patient.city].join(' '));
            return terms.every(term => text.includes(term));
        }).map(summary) : [] });
    }
    if (route === '/patients/new' && method === 'POST') {
        if (!body.name?.trim()) return reply({ error: 'أدخل اسم المريض.' }, 400);
        const fields = ['name', 'dateOfBirth', 'gender', 'phone', 'address', 'city', 'country', 'emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone'];
        const patient = { ...Object.fromEntries(fields.map(field => [field, body[field] || null])), id: Math.max(0, ...data.patients.map(item => item.id)) + 1, clinic_id: 1000, medicalRecords: [] };
        const medicalFields = ['bloodType', 'heightCm', 'weightKg', 'allergies', 'chronicConditions', 'notes'];
        if (doctor && medicalFields.some(field => body[field])) patient.medicalRecords.push({ id: patient.id, ...Object.fromEntries(medicalFields.map(field => [field, body[field] || null])) });
        data.patients.push(patient);
        return reply({ patient: summary(patient) }, 201);
    }
    if (route === '/in-queue') {
        if (method === 'DELETE') {
            if (!doctor) return denied();
            const cleared = data.queue.length;
            data.queue = [];
            return reply({ cleared });
        }
        if (method === 'GET') return reply({ patients: data.queue.map(item => ({ ...summary(data.patients.find(patient => patient.id === item.id)), checkedInAt: item.checkedInAt, visitOpen: Boolean(item.visitOpen && !item.visitCompleted), visitCompleted: Boolean(item.visitCompleted) })) });
        if (method === 'POST') {
            const id = Number(body.patientId);
            if (!data.patients.some(patient => patient.id === id)) return reply({ error: 'المريض غير موجود.' }, 404);
            if (data.queue.some(item => item.id === id && !item.visitCompleted)) return reply({ error: 'المريض في الانتظار بالفعل.' }, 409);
            data.queue = data.queue.filter(item => item.id !== id);
            data.queue.push({ id, checkedInAt: new Date().toISOString() });
            return reply({ patientId: id }, 201);
        }
    }
    const openVisitRoute = route.match(/^\/in-queue\/(\d+)\/open-visit$/);
    if (openVisitRoute && method === 'POST') {
        if (!doctor) return denied();
        const patient = data.queue.find(item => item.id === Number(openVisitRoute[1]) && !item.visitCompleted);
        if (!patient) return reply({ error: 'المريض ليس في قائمة الانتظار.' }, 404);
        patient.visitOpen = true;
        return reply({ patientId: patient.id, visitOpen: true });
    }
    const patientRoute = route.match(/^\/patients\/(\d+)(\/visits)?$/);
    if (patientRoute) {
        if (!doctor) return denied();
        const patient = data.patients.find(item => item.id === Number(patientRoute[1]));
        if (!patient) return reply({ error: 'المريض غير موجود.' }, 404);
        if (!patientRoute[2] && method === 'GET') return reply({ patient });
        if (patientRoute[2] && method === 'GET') return reply({ visits: data.visits.filter(visit => visit.patientId === patient.id).slice().reverse() });
        if (patientRoute[2] && method === 'POST') {
            const visit = { ...body, id: data.visits.length + 1, patientId: patient.id, visitDate: new Date().toISOString() };
            data.visits.push(visit);
            const queued = data.queue.find(item => item.id === patient.id);
            if (queued) queued.visitCompleted = true;
            return reply({ visit }, 201);
        }
    }
    if (route === '/user/entry-state') {
        if (method === 'POST') {
            if (!doctor) return denied();
            if (typeof body.paused !== 'boolean') return reply({ error: 'حالة غير صالحة.' }, 400);
            data.paused = body.paused;
        }
        const online = Date.now() - data.staffSeen < 15000;
        return reply({ paused: data.paused, staff: { linked: true, online, soundEnabled: online && data.soundEnabled, alert: data.event ? {
            id: data.event.id, state: data.event.acknowledged ? 'acknowledged' : data.event.received ? 'received' : Date.now() - data.event.createdAt > 30000 ? 'expired' : 'pending',
        } : null } });
    }
    if (route === '/user/buzzer' && method === 'POST') {
        if (!doctor) return denied();
        data.event = { id: crypto.randomUUID(), createdAt: Date.now(), acknowledged: false, received: false };
        return reply({ eventId: data.event.id, createdAt: data.event.createdAt }, 202);
    }
    if (route === '/user/buzzer/poll' && method === 'POST') {
        if (doctor) return denied();
        data.staffSeen = Date.now();
        data.soundEnabled = Boolean(body.soundEnabled);
        if (data.event && data.event.id === body.receivedEventId) data.event.received = true;
        return reply({ paused: data.paused, event: data.event && (data.event.received || Date.now() - data.event.createdAt < 30000) ? data.event : null });
    }
    if (route === '/user/buzzer/ack' && method === 'POST') {
        if (doctor) return denied();
        if (!data.event || data.event.id !== body.eventId) return reply({ error: 'النداء غير موجود.' }, 404);
        data.event.received = true;
        data.event.acknowledged = true;
        return reply({ acknowledged: true, eventId: data.event.id });
    }
    return reply({ error: 'هذه العملية غير متاحة في العرض التجريبي.' }, 404);
}
