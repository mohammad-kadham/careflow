import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiFetch, onUnauthorized } from '../src/api.js';
import { getSession, signIn, signOut, signUp } from '../src/auth/session.js';

test('frontend cookie authentication', async t => {
    const signupData = {
        name: ' Test User ', email: ' test@example.com ', clinic_name: ' Test Clinic ',
        phone: ' +96407701234567 ', password: ' password ', confirm_password: ' password ', role: 'admin',
    };
    await t.test('signup sends the five database fields, without confirmation or client role', async t => {
        t.mock.method(globalThis, 'fetch', async (url, options) => {
            assert.equal(url, 'http://localhost:8080/user/new');
            assert.equal(options.method, 'POST');
            assert.equal(options.credentials, 'include');
            assert.equal(options.headers['Content-Type'], 'application/json');
            assert.deepEqual(JSON.parse(options.body), {
                name: 'Test User', email: 'test@example.com', clinic_name: 'Test Clinic',
                phone: '+96407701234567', password: ' password ',
            });
            return Response.json({ user: { id: 9 } }, { status: 201 });
        });
        await signUp(signupData);
    });

    await t.test('signup translates duplicate email and validation errors', async t => {
        const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 409 }));
        await assert.rejects(signUp(signupData), /البريد الإلكتروني مسجل بالفعل/);
        fetchMock.mock.mockImplementation(async () => Response.json({ errors: [{ field: 'clinic_name' }] }, { status: 400 }));
        await assert.rejects(signUp(signupData), /يرجى التحقق من اسم العيادة/);
        fetchMock.mock.mockImplementation(async () => new Response('unreadable response', { status: 400 }));
        await assert.rejects(signUp(signupData), /يرجى التحقق من بيانات التسجيل/);
    });

    await t.test('signup does not claim success or retry after server and network failures', async t => {
        const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 500 }));
        await assert.rejects(signUp(signupData), /تعذر إنشاء الحساب/);
        const offline = new TypeError('Failed to fetch');
        fetchMock.mock.mockImplementation(async () => { throw offline; });
        await assert.rejects(signUp(signupData), error => error === offline);
        assert.equal(fetchMock.mock.callCount(), 2);
    });

    await t.test('API requests include cookies without changing POST data or cancellation', async t => {
        const controller = new AbortController();
        const body = JSON.stringify({ patientId: 12 });
        t.mock.method(globalThis, 'fetch', async (url, options) => {
            assert.equal(url, 'http://localhost:8080/in-queue');
            assert.equal(options.credentials, 'include');
            assert.equal(options.cache, 'no-store');
            assert.equal(options.method, 'POST');
            assert.equal(options.body, body);
            assert.equal(options.signal, controller.signal);
            return new Response('{}', { status: 201 });
        });
        assert.equal((await apiFetch('/in-queue', {
            method: 'POST', body, signal: controller.signal,
            credentials: 'omit', headers: { 'Content-Type': 'application/json' },
        })).status, 201);
    });

    await t.test('requests cannot accidentally send credentials to another absolute URL', async t => {
        const fetchMock = t.mock.method(globalThis, 'fetch');
        await assert.rejects(apiFetch('https://other.example/patients'), /relative path/);
        await assert.rejects(apiFetch('//other.example/patients'), /relative path/);
        assert.equal(fetchMock.mock.callCount(), 0);
    });

    await t.test('protected 401 responses notify the workspace and subscriptions clean up', async t => {
        let expired = 0;
        const unsubscribe = onUnauthorized(() => { expired++; });
        t.after(unsubscribe);
        t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 401 }));
        const response = await apiFetch('/patients');
        assert.equal(response.status, 401);
        assert.equal(expired, 1);
        unsubscribe();
        await apiFetch('/patients');
        assert.equal(expired, 1);
    });

    await t.test('cancelled requests and server errors do not report session expiry', async t => {
        let expired = 0;
        const unsubscribe = onUnauthorized(() => { expired++; });
        t.after(unsubscribe);
        const controller = new AbortController();
        controller.abort();
        const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 401 }));
        await apiFetch('/patients', { signal: controller.signal });
        fetchMock.mock.mockImplementation(async () => new Response('{}', { status: 500 }));
        await apiFetch('/patients');
        assert.equal(expired, 0);
    });

    await t.test('session check returns only a verified user and treats 401 as logged out', async t => {
        const user = { id: 7, name: 'Test User', email: 'test@example.com', role: 'doctor' };
        let expired = 0;
        const unsubscribe = onUnauthorized(() => { expired++; });
        t.after(unsubscribe);
        const fetchMock = t.mock.method(globalThis, 'fetch', async url => {
            assert.equal(url, 'http://localhost:8080/user/me');
            return Response.json({ user });
        });
        assert.deepEqual(await getSession(), user);
        fetchMock.mock.mockImplementation(async () => new Response('{}', { status: 401 }));
        assert.equal(await getSession(), null);
        assert.equal(expired, 0);
    });

    await t.test('session check fails closed on server errors and malformed user data', async t => {
        const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 500 }));
        await assert.rejects(getSession());
        for (const body of [{}, { user: { id: '7' } }, { user: { id: -1 } }]) {
            fetchMock.mock.mockImplementation(async () => Response.json(body));
            await assert.rejects(getSession());
        }
    });

    await t.test('login trims email, preserves the password, and sends cookies', async t => {
        t.mock.method(globalThis, 'fetch', async (url, options) => {
            assert.equal(url, 'http://localhost:8080/user/login');
            assert.equal(options.method, 'POST');
            assert.equal(options.credentials, 'include');
            assert.equal(options.headers['Content-Type'], 'application/json');
            assert.deepEqual(JSON.parse(options.body), { email: 'test@example.com', password: ' secret ' });
            return Response.json({ message: 'Login successful.' });
        });
        await signIn(' test@example.com ', ' secret ');
    });

    await t.test('wrong credentials stay on login with an Arabic error', async t => {
        let expired = 0;
        const unsubscribe = onUnauthorized(() => { expired++; });
        t.after(unsubscribe);
        t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 401 }));
        await assert.rejects(signIn('test@example.com', 'incorrect'), /البريد الإلكتروني أو كلمة السر غير صحيحة/);
        assert.equal(expired, 0);
    });

    await t.test('logout sends an empty JSON body with the session cookie', async t => {
        t.mock.method(globalThis, 'fetch', async (url, options) => {
            assert.equal(url, 'http://localhost:8080/user/logout');
            assert.equal(options.method, 'POST');
            assert.equal(options.credentials, 'include');
            assert.equal(options.headers['Content-Type'], 'application/json');
            assert.equal(options.body, '{}');
            return Response.json({ message: 'Logged out.' });
        });
        await signOut();
    });

    await t.test('failed logout and network failures propagate without claiming success or retrying writes', async t => {
        const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 500 }));
        await assert.rejects(signOut(), /تعذر تسجيل الخروج/);
        const offline = new TypeError('Failed to fetch');
        fetchMock.mock.mockImplementation(async () => { throw offline; });
        await assert.rejects(signOut(), error => error === offline);
        await assert.rejects(signIn('test@example.com', 'password'), error => error === offline);
        await assert.rejects(getSession(), error => error === offline);
        assert.equal(fetchMock.mock.callCount(), 4);
    });
});
