const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-only-secret-'.repeat(4);
process.env.NODE_ENV = 'development';
process.env.CORS_ORIGINS = 'http://localhost:5173';

const users = [{
    id: 7, name: 'Test Doctor', email: 'doctor@example.com',
    password: bcrypt.hashSync('example-password', 10), role: 'doctor', clinic_id: 101, subscription_active: 1,
}];
let queries = 0;
let failDatabase = false;
const dbPath = require.resolve('../data/db');
require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: {
        async getConnection() {
            return { query: (...args) => require.cache[dbPath].exports.query(...args), async beginTransaction() {}, async commit() {}, async rollback() {}, release() {} };
        },
        async query(sql, params) {
            queries++;
            if (failDatabase) throw new Error('private database details');
            if (sql.includes('WHERE u.email')) {
                return [users.filter(user => user.email === params[0])];
            }
            if (sql.includes('WHERE u.id')) {
                return [users.filter(user => user.id === params[0])
                    .map(({ id, name, email, role, clinic_name, phone, doctor_id, clinic_id, subscription_active, subscription_required, email_verification_required, email_verified_at }) => ({ id, name, email, role, clinic_name, phone, doctor_id, clinic_id, subscription_active, subscription_required, email_verification_required, email_verified_at }))];
            }
            if (sql.startsWith('INSERT INTO users')) {
                const [name, email, password, role, clinic_name, phone, doctor_id, clinic_id] = params;
                assert.match(sql, /role, clinic_name, phone/);
                const user = { id: 8, name, email, password, role, clinic_name, phone, doctor_id, clinic_id, subscription_required: 1, subscription_active: 0, email_verification_required: 1 };
                users.push(user);
                return [{ insertId: user.id }];
            }
            if (sql.startsWith('INSERT INTO clinics')) return [{ insertId: 201 }];
            return [[]];
        },
    },
};

const verification = require('../services/email-verification');
verification.assertConfigured = () => {};
verification.sendFor = async () => true;
const app = require('../server');
const auth = require('../config/auth');

test('JWT authentication over HTTP (no real database access)', async t => {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    t.after(() => new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
    }));

    const post = (url, body, headers = {}) => fetch(base + url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
    const cookieFor = (payload, options = {}) => auth.cookieName + '=' + jwt.sign(payload, auth.secret, {
        algorithm: 'HS256', issuer: auth.issuer, audience: auth.audience,
        expiresIn: 3600, ...options,
    });
    let session;

    await t.test('all patient, queue and visit routes require login', async () => {
        const before = queries;
        for (const url of ['/patients', '/patient', '/patients/1', '/in-queue', '/patients/1/visits']) {
            assert.equal((await fetch(base + url)).status, 401, url);
        }
        for (const url of ['/patients/new', '/in-queue', '/patients/1/visits']) {
            assert.equal((await post(url, {})).status, 401, url);
        }
        assert.equal(queries, before);
    });

    await t.test('invalid input is rejected without echoing passwords', async () => {
        const response = await post('/user/login', { email: [], password: { secret: 'private-value' } });
        assert.equal(response.status, 400);
        assert.ok(!(await response.text()).includes('private-value'));
    });

    await t.test('unknown email and wrong password return the same 401 message', async () => {
        const missing = await post('/user/login', { email: 'missing@example.com', password: 'wrong' });
        const wrong = await post('/user/login', { email: 'doctor@example.com', password: 'wrong' });
        assert.equal(missing.status, 401);
        assert.equal(wrong.status, 401);
        assert.deepEqual(await missing.json(), await wrong.json());
        assert.equal(wrong.headers.get('set-cookie'), null);
    });

    await t.test('login sets an HttpOnly cookie containing the database ID', async () => {
        const response = await post('/user/login', {
            email: 'doctor@example.com', password: 'example-password',
        }, { Origin: 'http://localhost:5173' });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
        assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const setCookie = response.headers.get('set-cookie');
        assert.match(setCookie, /HttpOnly/);
        assert.match(setCookie, /SameSite=Lax/);
        assert.match(setCookie, /Path=\//);
        assert.match(setCookie, /Max-Age=3600/);
        session = setCookie.split(';')[0];
        const payload = jwt.verify(session.slice(session.indexOf('=') + 1), auth.secret);
        assert.equal(payload.userId, 7);
        assert.equal(payload.exp - payload.iat, 3600);
        const body = await response.json();
        assert.deepEqual(body.user, { id: 7, name: 'Test Doctor', email: 'doctor@example.com', role: 'doctor', clinic_name: null, phone: null, doctor_id: null, clinic_id: 101, subscription: { active: true, required: false, plan: null, expiresAt: null } });
        assert.equal(body.token, undefined);
        assert.equal(body.user.password, undefined);
    });

    await t.test('the session permits current-user and patient reads', async () => {
        const me = await fetch(base + '/user/me', { headers: { Cookie: session } });
        assert.equal(me.status, 200);
        assert.equal((await me.json()).user.id, 7);
        const patients = await fetch(base + '/patients', { headers: { Cookie: session } });
        assert.equal(patients.status, 200);
        assert.equal(patients.headers.get('cache-control'), 'no-store');
    });

    await t.test('missing, malformed, expired, forged and incompatible JWTs return 401', async () => {
        const cases = [
            '', auth.cookieName + '=not-a-jwt', auth.cookieName + '=%invalid',
            session + '; ' + session,
            cookieFor({ userId: 7 }, { expiresIn: -1 }),
            auth.cookieName + '=' + jwt.sign({ userId: 7 }, 'wrong-secret'),
            cookieFor({ userId: 7 }, { algorithm: 'HS384' }),
            cookieFor({ userId: 7 }, { issuer: 'another-api' }),
            cookieFor({ userId: 7 }, { audience: 'another-app' }),
            cookieFor({ userId: 'Test Doctor' }),
            cookieFor({ userId: -1 }),
            auth.cookieName + '=' + jwt.sign({ userId: 7 }, auth.secret, {
                issuer: auth.issuer, audience: auth.audience,
            }),
        ];
        for (const cookie of cases) {
            const response = await fetch(base + '/user/me', { headers: { Cookie: cookie } });
            assert.equal(response.status, 401);
        }
    });

    await t.test('a deleted user is rejected and current roles come from the database', async () => {
        assert.equal((await fetch(base + '/user/me', {
            headers: { Cookie: cookieFor({ userId: 999 }) },
        })).status, 401);
        users[0].role = 'staff';
        const response = await fetch(base + '/user/me', { headers: { Cookie: session } });
        assert.equal((await response.json()).user.role, 'staff');
        users[0].role = 'doctor';
    });

    await t.test('logout clears the session cookie and works after expiration', async () => {
        for (const cookie of [session, cookieFor({ userId: 7 }, { expiresIn: -1 }), '']) {
            const response = await post('/user/logout', {}, { Cookie: cookie });
            assert.equal(response.status, 200);
            assert.match(response.headers.get('set-cookie'), /careflow_session=;/);
            assert.match(response.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
        }
        assert.equal((await fetch(base + '/user/me')).status, 401);
    });

    await t.test('cross-origin writes and form content types are blocked before the database', async () => {
        const before = queries;
        for (const origin of ['https://untrusted.example', 'null', 'http://localhost:5174']) {
            assert.equal((await post('/user/logout', {}, { Origin: origin, Cookie: session })).status, 403);
        }
        assert.equal((await post('/user/logout', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
        const form = await fetch(base + '/user/login', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'email=doctor@example.com&password=example-password',
        });
        assert.equal(form.status, 415);
        assert.equal(queries, before);
    });

    await t.test('allowed preflight works without authentication', async () => {
        const response = await fetch(base + '/patients/new', {
            method: 'OPTIONS',
            headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'Content-Type' },
        });
        assert.equal(response.status, 204);
        assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
        assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    });

    await t.test('signup hashes passwords and cannot accept an admin role', async () => {
        const response = await post('/user/new', {
            name: 'New User', email: 'new@example.com', password: 'new-password', role: 'admin',
            clinic_name: '  عيادة الاختبار  ', phone: '  +964 07701234567  ',
        });
        assert.equal(response.status, 201);
        const body = await response.json();
        assert.equal(body.user.id, 8);
        assert.equal(body.user.role, 'doctor');
        assert.equal(body.user.clinic_name, 'عيادة الاختبار');
        assert.equal(body.user.phone, '+964 07701234567');
        assert.equal(users[1].clinic_name, body.user.clinic_name);
        assert.equal(users[1].phone, body.user.phone);
        assert.equal(body.verificationRequired, true);
        assert.equal((await fetch(base + '/user/me', { headers: { Cookie: cookieFor({ userId: 8 }) } })).status, 403);
        users[1].email_verified_at = new Date();
        const profile = await fetch(base + '/user/me', { headers: { Cookie: cookieFor({ userId: 8 }) } });
        assert.equal(profile.status, 200);
        assert.deepEqual((await profile.json()).user, body.user);
        assert.equal(body.user.password, undefined);
        assert.notEqual(users[1].password, 'new-password');
        assert.ok(await bcrypt.compare('new-password', users[1].password));
        const duplicate = await post('/user/new', {
            name: 'New User', email: 'new@example.com', password: 'new-password',
            clinic_name: 'Test Clinic', phone: '07701234567',
        });
        assert.equal(duplicate.status, 409);
    });

    await t.test('signup rejects invalid and oversized passwords before saving', async () => {
        const before = queries;
        for (const password of ['short', 'a'.repeat(73), 'ع'.repeat(37)]) {
            assert.equal((await post('/user/new', { name: 'Test', email: 'test@example.com', password, clinic_name: 'Clinic', phone: '07701234567' })).status, 400);
        }
        assert.equal(queries, before);
    });

    await t.test('signup requires clinic name and phone and enforces storage limits', async () => {
        const before = queries;
        const valid = {
            name: 'Test', email: 'test@example.com', password: 'test-password',
            clinic_name: 'Clinic', phone: '07701234567',
        };
        for (const changes of [
            { clinic_name: undefined }, { phone: undefined },
            { clinic_name: '   ' }, { phone: '   ' },
            { clinic_name: 'x'.repeat(151) }, { phone: '0'.repeat(41) },
            { clinic_name: {} }, { phone: 7701234567 },
        ]) {
            const response = await post('/user/new', { ...valid, ...changes });
            assert.equal(response.status, 400);
        }
        assert.equal(queries, before);
    });

    await t.test('database failures return 500 without exposing internal details', async () => {
        failDatabase = true;
        try {
            const response = await fetch(base + '/user/me', { headers: { Cookie: session } });
            assert.equal(response.status, 500);
            assert.ok(!(await response.text()).includes('private database details'));
            assert.equal(response.headers.get('set-cookie'), null);
        } finally {
            failDatabase = false;
        }
    });

    await t.test('the debug endpoint no longer exists', async () => {
        assert.equal((await fetch(base + '/test', { headers: { Cookie: session } })).status, 404);
    });

    await t.test('configuration rejects a missing or short signing secret', () => {
        for (const secret of ['', 'secret']) {
            const result = spawnSync(process.execPath, ['-e', "require('./config/auth')"], {
                cwd: path.join(__dirname, '..'), encoding: 'utf8',
                env: { ...process.env, JWT_SECRET: secret },
            });
            assert.notEqual(result.status, 0);
            assert.match(result.stderr, /Set JWT_SECRET/);
        }
    });

    await t.test('production cookies require HTTPS', () => {
        const result = spawnSync(process.execPath, ['-e',
            "process.stdout.write(JSON.stringify(require('./config/auth').cookieOptions))"], {
            cwd: path.join(__dirname, '..'), encoding: 'utf8',
            env: { ...process.env, NODE_ENV: 'production' },
        });
        assert.equal(result.status, 0);
        const options = JSON.parse(result.stdout);
        assert.equal(options.secure, true);
        assert.equal(options.httpOnly, true);
    });
});
