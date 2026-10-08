import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoFetch, resetDemo } from '../src/demo/api.js';
import { apiFetch } from '../src/api.js';

const post = (path, body, role = 'doctor') => demoFetch(path, { method: 'POST', body: JSON.stringify(body) }, role);
const get = async (path, role = 'doctor') => (await demoFetch(path, {}, role)).json();

test('demo patients, queue, visits, and role restrictions', async () => {
    resetDemo();
    assert.deepEqual((await get('/patients')).patients, []);
    assert.equal((await get('/patients?q=احمد')).patients.length, 1);
    assert.equal((await get('/in-queue')).patients.length, 2);
    assert.equal((await post('/in-queue/1/open-visit', {}, 'staff')).status, 403);
    assert.equal((await post('/in-queue/1/open-visit', {})).status, 200);
    assert.equal((await get('/in-queue', 'staff')).patients[0].visitOpen, true);
    assert.equal((await get('/in-queue', 'staff')).patients[1].visitOpen, false);
    assert.equal((await post('/in-queue/3/open-visit', {})).status, 404);
    assert.equal((await demoFetch('/patients/1', {}, 'staff')).status, 403);
    assert.equal((await get('/patients?q=احمد', 'staff')).patients[0].medicalRecords, undefined);
    const response = await post('/patients/new', { name: 'مريض اختبار', clinic_id: 999, notes: 'private' }, 'staff');
    const { patient } = await response.json();
    assert.equal(response.status, 201);
    assert.equal(patient.clinic_id, 1000);
    assert.deepEqual((await get(`/patients/${patient.id}`)).patient.medicalRecords, []);
    assert.equal((await post('/in-queue', { patientId: patient.id }, 'staff')).status, 201);
    assert.equal((await post('/in-queue', { patientId: patient.id })).status, 409);
    assert.equal((await post(`/patients/${patient.id}/visits`, { notes: 'Sample visit' }, 'staff')).status, 403);
    assert.equal((await post(`/patients/${patient.id}/visits`, { notes: 'Sample visit' })).status, 201);
    assert.equal((await get(`/patients/${patient.id}/visits`)).visits.length, 1);
    const completed = (await get('/in-queue')).patients.find(item => item.id === patient.id);
    assert.equal(completed.visitCompleted, true);
    assert.equal(completed.visitOpen, false);
    assert.equal((await get('/patients?q=مريض اختبار')).patients[0].inQueue, 0);
    assert.equal((await post(`/in-queue/${patient.id}/open-visit`, {})).status, 404);
    assert.equal((await post('/in-queue', { patientId: patient.id }, 'staff')).status, 201);
    assert.equal((await get('/in-queue')).patients.at(-1).visitCompleted, false);
    resetDemo();
    assert.equal((await demoFetch(`/patients/${patient.id}`)).status, 404);
});

test('closing the demo clinic clears the queue and preserves records and saved visits', async () => {
    resetDemo();
    await post('/patients/1/visits', { notes: 'Saved before closing' });
    const records = await get('/patients/1');
    const visits = await get('/patients/1/visits');
    assert.equal((await demoFetch('/in-queue', { method: 'DELETE' }, 'staff')).status, 403);
    assert.equal((await get('/in-queue')).patients.length, 2);
    assert.deepEqual(await (await demoFetch('/in-queue', { method: 'DELETE' })).json(), { cleared: 2 });
    assert.deepEqual((await get('/in-queue', 'staff')).patients, []);
    assert.deepEqual(await get('/patients/1'), records);
    assert.deepEqual(await get('/patients/1/visits'), visits);
    assert.equal((await get('/patients?q=احمد')).patients[0].inQueue, 0);
    assert.deepEqual(await (await demoFetch('/in-queue', { method: 'DELETE' })).json(), { cleared: 0 });
    assert.equal((await post('/in-queue', { patientId: 1 }, 'staff')).status, 201);
    assert.equal((await get('/in-queue')).patients[0].visitCompleted, false);
});

test('demo doctor/staff switch shares pause and acknowledged buzzer state', async () => {
    resetDemo();
    assert.equal((await post('/user/entry-state', { paused: true }, 'staff')).status, 403);
    await post('/user/entry-state', { paused: true });
    const { eventId } = await (await post('/user/buzzer', {})).json();
    const poll = await (await post('/user/buzzer/poll', { soundEnabled: true }, 'staff')).json();
    assert.equal(poll.paused, true);
    assert.equal(poll.event.id, eventId);
    await post('/user/buzzer/ack', { eventId }, 'staff');
    const { staff } = await get('/user/entry-state');
    assert.equal(staff.online, true);
    assert.equal(staff.soundEnabled, true);
    assert.equal(staff.alert.state, 'acknowledged');
    await post('/user/entry-state', { paused: false });
    assert.equal((await get('/user/entry-state', 'staff')).paused, false);
});

test('demo API never falls through to real fetch and real routes still use the backend', async t => {
    const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
    const originalFetch = globalThis.fetch;
    t.after(() => {
        if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation);
        else delete globalThis.location;
        globalThis.fetch = originalFetch;
    });
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { pathname: '/demo', search: '?role=staff' } });
    let networkCalls = 0;
    globalThis.fetch = async () => { networkCalls++; return new Response('{}'); };
    assert.equal((await apiFetch('/in-queue')).status, 200);
    assert.equal((await apiFetch('/patients/1')).status, 403);
    assert.equal((await apiFetch('/unsupported')).status, 404);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(apiFetch('/in-queue', { signal: controller.signal }), { name: 'AbortError' });
    assert.equal(networkCalls, 0);
    globalThis.location.pathname = '/app';
    await apiFetch('/in-queue');
    assert.equal(networkCalls, 1);
});
