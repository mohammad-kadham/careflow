const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'roles-test-secret-'.repeat(4);
process.env.NODE_ENV = 'development';
const users = [
    { id: 1, name: 'Doctor One', role: 'doctor', email: 'doctor1@example.com', clinic_name: 'Clinic One', doctor_id: null },
    { id: 2, name: 'Doctor Two', role: 'doctor', email: 'doctor2@example.com', clinic_name: 'Clinic Two', doctor_id: null },
    { id: 3, name: 'Staff Two', role: 'staff', email: 'staff2@example.com', clinic_name: 'Clinic Two', doctor_id: 2 },
    { id: 4, name: 'Legacy Staff', role: 'staff', email: 'legacy@example.com', doctor_id: null },
    { id: 5, name: 'Unsupported', role: 'admin', doctor_id: null },
    { id: 6, name: 'Doctor Three', role: 'doctor', email: 'doctor3@example.com', clinic_name: 'Clinic Three', doctor_id: null },
];
for (const user of users) user.clinic_id = user.doctor_id ? user.doctor_id * 10 : user.id * 10;
const patients = [{ id: 123, clinic_id: 10, name: 'Clinic One Patient' }, { id: 124, clinic_id: 20, name: 'Clinic Two Patient' }];
const queries = [];
let nextId = 10;
async function query(sql, params = []) {
    queries.push({ sql, params });
    if (sql.includes('WHERE u.id')) return [users.filter(user => user.id === params[0]).map(user => ({ ...user, subscription_active: 1 }))];
    if (sql.includes('WHERE u.email')) return [users.filter(user => user.email === params[0])];
    if (sql.includes('WHERE u.doctor_id')) return [users.filter(user => user.doctor_id === params[0] && user.clinic_id === params[1] && user.role === 'staff')];
    if (sql.startsWith('INSERT INTO users')) {
        const [name, email, password, role, clinic_name, phone, doctor_id, clinic_id] = params;
        if (users.some(user => user.email === email || (doctor_id !== null && user.doctor_id === doctor_id))) {
            const error = new Error('duplicate');
            error.code = 'ER_DUP_ENTRY';
            throw error;
        }
        const user = { id: nextId++, name, email, password, role, clinic_name, phone, doctor_id, clinic_id };
        users.push(user);
        return [{ insertId: user.id }];
    }
    if (sql.startsWith('INSERT INTO clinics')) return [{ insertId: 100 }];
    if (sql.includes('INSERT INTO patients')) {
        const patient = { id: 125 + patients.length - 2, clinic_id: params[0], name: params[1] };
        patients.push(patient);
        return [{ insertId: patient.id }];
    }
    if (sql.startsWith('INSERT INTO in_queue')) {
        const owned = patients.some(patient => patient.id === params[0] && patient.clinic_id === params[1]);
        return [{ affectedRows: owned ? 1 : 0 }];
    }
    if (sql.includes('FROM visits v JOIN patients p')) {
        const owned = patients.some(patient => patient.id === params[0] && patient.clinic_id === params[1]);
        return [owned ? [{ id: 1, patientId: params[0] }] : []];
    }
    if (sql.includes('INSERT INTO visits')) return [{ insertId: 456 }];
    if (sql.includes('FROM patient_medical_info')) return [[]];
    if (sql.includes('FROM in_queue q JOIN patients p')) {
        return [patients.filter(patient => !sql.includes('p.clinic_id = ?') || patient.clinic_id === params[0])];
    }
    if (sql.includes('FROM patients')) {
        let rows = patients;
        if (sql.includes("LIKE ? ESCAPE '!'")) {
            rows = rows.filter(patient => patient.clinic_id === params[0]);
            for (const pattern of params.slice(1)) {
                const term = pattern.slice(1, -1).replace(/!([!%_])/g, '$1');
                rows = rows.filter(patient => [patient.name, patient.id, patient.phone || '', patient.city || ''].join(' ').toLowerCase().includes(term));
            }
            return [rows.map(patient => ({ ...patient, inQueue: 0 }))];
        }
        if (/(?:WHERE|AND) (?:p\.)?id = \?/.test(sql)) rows = rows.filter(patient => patient.id === params[0]);
        if (sql.includes('name = ?')) rows = rows.filter(patient => patient.name === params[0]);
        if (sql.includes('clinic_id = ?')) rows = rows.filter(patient => patient.clinic_id === params.at(-1));
        return [rows];
    }
    return [[]];
}
const dbPath = require.resolve('../data/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    query,
    async getConnection() {
        return { query, async beginTransaction() {}, async commit() {}, async rollback() {}, release() {} };
    },
} };
const app = require('../server');
const auth = require('../config/auth');

test('doctor/staff permissions and account creation', async t => {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const cookie = id => auth.cookieName + '=' + jwt.sign({ userId: id }, auth.secret, {
        algorithm: 'HS256', issuer: auth.issuer, audience: auth.audience, expiresIn: 3600,
    });
    const request = (url, id, body) => fetch(base + url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { ...(id ? { Cookie: cookie(id) } : {}), 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const staffData = { name: 'Assistant', email: 'assistant@example.com', phone: '07701234567', password: 'test-password' };

    await t.test('staff management rejects anonymous and staff callers', async () => {
        for (const id of [null, 3, 4]) {
            assert.equal((await request('/user/staff', id)).status, id ? 403 : 401);
            assert.equal((await request('/user/staff', id, staffData)).status, id ? 403 : 401);
        }
        assert.equal((await request('/user/staff', 5)).status, 403);
    });

    await t.test('staff cannot read medical records or read/write visits', async () => {
        queries.length = 0;
        assert.equal((await request('/patients/123', 3)).status, 403);
        assert.equal((await request('/patients/123/visits', 3)).status, 403);
        assert.equal((await request('/patients/123/visits', 3, { diagnosis: 'forbidden', doctor_id: 1 })).status, 403);
        assert.ok(queries.every(({ sql }) => sql.includes('WHERE u.id')));
    });

    await t.test('staff can register demographics and use records and queue', async () => {
        assert.equal((await request('/patients', 3)).status, 200);
        assert.equal((await request('/in-queue', 3)).status, 200);
        const patient = await request('/patients/new', 3, { name: 'New Patient', phone: '07701234567' });
        assert.equal(patient.status, 201);
        assert.equal((await patient.json()).patient.id, 125);
        assert.equal((await request('/in-queue', 3, { patientId: 124 })).status, 201);
    });

    await t.test('staff cannot inject clinical fields when registering a patient', async () => {
        queries.length = 0;
        for (const field of ['bloodType', 'heightCm', 'weightKg', 'allergies', 'chronicConditions', 'notes']) {
            assert.equal((await request('/patients/new', 3, { name: 'Patient', [field]: 'forbidden' })).status, 403);
        }
        assert.ok(queries.every(({ sql }) => sql.includes('WHERE u.id')));
    });

    await t.test('doctor creates a hashed staff account with server-assigned ownership and role', async () => {
        const response = await request('/user/staff', 1, {
            ...staffData, role: 'doctor', doctor_id: 2, clinic_name: 'Forged Clinic', clinic_id: 20,
        });
        assert.equal(response.status, 201);
        assert.equal(response.headers.get('set-cookie'), null, 'Creating staff must preserve the doctor session');
        const result = await response.json();
        assert.equal(result.user.role, 'staff');
        assert.equal(result.user.doctor_id, 1);
        assert.equal(result.user.clinic_id, 10);
        assert.equal(result.user.clinic_name, 'Clinic One');
        assert.equal(result.user.password, undefined);
        const stored = users.find(user => user.id === result.user.id);
        assert.ok(await bcrypt.compare(staffData.password, stored.password));
        const login = await request('/user/login', null, { email: staffData.email, password: staffData.password });
        assert.equal(login.status, 200);
        assert.equal((await login.json()).user.role, 'staff');
        const doctor = await request('/user/me', 1);
        assert.equal((await doctor.json()).user.role, 'doctor');
    });

    await t.test('doctors see only their own staff and cannot add a second account', async () => {
        const one = await (await request('/user/staff', 1)).json();
        const two = await (await request('/user/staff', 2)).json();
        assert.equal(one.staff.length, 1);
        assert.equal(two.staff.length, 1);
        assert.equal(one.staff[0].doctor_id, 1);
        assert.equal(two.staff[0].doctor_id, 2);
        const response = await request('/user/staff', 1, { ...staffData, email: 'second@example.com' });
        assert.equal(response.status, 409);
        assert.equal((await response.json()).code, 'STAFF_LIMIT');
    });

    await t.test('invalid input and duplicate email do not create accounts', async () => {
        const before = users.length;
        assert.equal((await request('/user/staff', 6, { ...staffData, password: 'x' })).status, 400);
        assert.equal((await request('/user/staff', 6, { ...staffData, phone: '' })).status, 400);
        assert.equal((await request('/user/staff', 6, { ...staffData, email: 'doctor1@example.com' })).status, 409);
        assert.equal(users.length, before);
    });

    await t.test('concurrent staff creation yields one account and a conflict', async () => {
        const responses = await Promise.all([
            request('/user/staff', 6, { ...staffData, email: 'race1@example.com' }),
            request('/user/staff', 6, { ...staffData, email: 'race2@example.com' }),
        ]);
        assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
        assert.equal(users.filter(user => user.doctor_id === 6).length, 1);
    });

    await t.test('clinic lists, queue, and name search never return another clinic', async () => {
        const listed = await (await request('/patients?q=Clinic&clinic_id=20', 1)).json();
        assert.ok(listed.patients.length > 0);
        assert.ok(listed.patients.every(patient => patient.clinic_id === 10));
        const queued = await (await request('/in-queue?clinic_id=20', 1)).json();
        assert.ok(queued.patients.every(patient => patient.clinic_id === 10));
        const search = await (await request('/patient?first_name=Clinic%20Two%20Patient', 1)).json();
        assert.deepEqual(search.patients, []);
    });

    await t.test('patient search returns no records for empty queries and only requested matches', async () => {
        for (const url of ['/patients', '/patients?q=', '/patients?q=%20%20']) {
            const response = await request(url, 1);
            assert.equal(response.status, 200);
            assert.deepEqual((await response.json()).patients, []);
        }
        const match = await (await request('/patients?q=One', 1)).json();
        assert.deepEqual(match.patients.map(patient => patient.id), [123]);
        const none = await (await request('/patients?q=Two', 1)).json();
        assert.deepEqual(none.patients, []);
        for (const url of ['/patients?q=One&q=Two', '/patients?q=' + 'x'.repeat(151)]) {
            assert.equal((await request(url, 1)).status, 400);
        }
    });

    await t.test('foreign patient IDs cannot expose medical records, visits, or queue operations', async () => {
        assert.equal((await request('/patients/124', 1)).status, 404);
        assert.equal((await request('/patients/124/visits', 1)).status, 404);
        assert.equal((await request('/in-queue', 1, { patientId: 124, clinic_id: 20 })).status, 404);
        assert.equal((await request('/in-queue', 3, { patientId: 123, clinic_id: 10 })).status, 404);
        queries.length = 0;
        assert.equal((await request('/patients/124/visits', 1, { diagnosis: 'forbidden', clinic_id: 20 })).status, 404);
        assert.ok(!queries.some(({ sql }) => sql.includes('INSERT INTO visits') || sql.includes('UPDATE in_queue SET visit_completed_at')));
    });

    await t.test('patient creation and doctor signup ignore forged clinic ownership', async () => {
        const response = await request('/patients/new', 1, { name: 'Owned Patient', clinic_id: 20 });
        assert.equal(response.status, 201);
        const patient = (await response.json()).patient;
        assert.equal(patient.clinic_id, 10);
        assert.equal(patients.find(row => row.id === patient.id).clinic_id, 10);
        const signup = await request('/user/new', null, {
            name: 'New Doctor', email: 'new-doctor@example.com', password: 'test-password',
            clinic_name: 'Clinic One', phone: '07701234567', clinic_id: 10,
        });
        assert.equal(signup.status, 201);
        assert.equal((await signup.json()).user.clinic_id, 100);
    });

    await t.test('doctor can access clinical data and visit author comes from the session', async () => {
        assert.equal((await request('/patients/123', 1)).status, 200);
        assert.equal((await request('/patients/123/visits', 1)).status, 200);
        queries.length = 0;
        const response = await request('/patients/123/visits', 1, { diagnosis: 'Example', doctor_id: 2 });
        assert.equal(response.status, 201);
        const insert = queries.find(({ sql }) => sql.includes('INSERT INTO visits'));
        assert.deepEqual(insert.params.slice(0, 2), [123, 1]);
        assert.ok(queries.some(({ sql }) => sql.includes('UPDATE in_queue SET visit_completed_at')));
    });
});
