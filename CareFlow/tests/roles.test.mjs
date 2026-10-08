import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('doctor and staff screens', async t => {
    const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'silent' });
    t.after(() => server.close());
    const { default: Main } = await server.ssrLoadModule('/src/components/main.jsx');
    const { default: SideBar } = await server.ssrLoadModule('/src/components/sidebar.jsx');
    const { default: PatientRow } = await server.ssrLoadModule('/src/components/patient-row.jsx');
    const renderMain = (role, activeView) => renderToStaticMarkup(createElement(Main, {
        user: { name: 'Test User', role }, activeView, openVisits: [], queueRevision: 0,
    }));

    await t.test('only doctors have staff management and visit navigation', () => {
        const doctor = renderToStaticMarkup(createElement(SideBar, { user: { role: 'doctor' } }));
        const staff = renderToStaticMarkup(createElement(SideBar, { user: { role: 'staff' } }));
        assert.match(doctor, /إدارة الموظفين/);
        assert.match(doctor, /الزيارات/);
        assert.doesNotMatch(staff, /إدارة الموظفين|الزيارات/);
        assert.match(staff, /إضافة مريض/);
        assert.match(staff, /سجل المرضى/);
    });

    await t.test('staff registration renders demographic fields but no clinical fields', () => {
        const staff = renderMain('staff', 'add');
        const doctor = renderMain('doctor', 'add');
        assert.match(staff, /name="name"/);
        assert.match(staff, /name="emergencyContactPhone"/);
        assert.doesNotMatch(staff, /name="(bloodType|heightCm|weightKg|allergies|chronicConditions|notes)"/);
        assert.match(doctor, /name="allergies"/);
        assert.match(doctor, /name="bloodType"/);
    });

    await t.test('forcing a doctor-only view cannot render it for staff', () => {
        assert.doesNotMatch(renderMain('staff', 'staff'), /إدارة الموظفين/);
        assert.doesNotMatch(renderMain('staff', 'visits'), /الزيارة الحالية|الزيارات المفتوحة/);
        assert.match(renderMain('doctor', 'staff'), /إدارة الموظفين/);
    });

    await t.test('staff queue rows do not offer opening a visit', () => {
        const patient = { id: 1, name: 'Test Patient', queue: 1, recordNumber: 1 };
        assert.doesNotMatch(renderToStaticMarkup(createElement(PatientRow, { patient })), /فتح الزيارة/);
        assert.match(renderToStaticMarkup(createElement(PatientRow, { patient, onOpenVisit() {} })), /فتح الزيارة/);
    });

    await t.test('open visits have an accessible queue label in the staff view', () => {
        const patient = { id: 1, name: 'Sample', queue: 1, recordNumber: 1 };
        assert.doesNotMatch(renderToStaticMarkup(createElement(PatientRow, { patient })), /الزيارة مفتوحة/);
        const open = renderToStaticMarkup(createElement(PatientRow, { patient: { ...patient, visitOpen: 1 } }));
        assert.match(open, /الزيارة مفتوحة/);
        assert.doesNotMatch(open, /فتح الزيارة/);
        const completed = renderToStaticMarkup(createElement(PatientRow, {
            patient: { ...patient, visitOpen: 1, visitCompleted: 1 }, onOpenVisit() {},
        }));
        assert.match(completed, /اكتملت الزيارة/);
        assert.match(completed, /visitCompleted/);
        assert.doesNotMatch(completed, /الزيارة مفتوحة|فتح الزيارة/);
    });

    await t.test('dashboard replaces open visits with a doctor-only buzzer', () => {
        const doctor = renderMain('doctor', 'dashboard');
        const staff = renderMain('staff', 'dashboard');
        assert.match(doctor, /نداء الموظف/);
        assert.match(doctor, /إيقاف الدخول/);
        assert.match(doctor, /إغلاق العيادة/);
        assert.doesNotMatch(doctor, /الزيارات المفتوحة|متابعة الزيارات|جاهز لبدء زيارة/);
        assert.doesNotMatch(staff, /نداء الموظف/);
        assert.doesNotMatch(staff, /إيقاف الدخول/);
        assert.doesNotMatch(staff, /إغلاق العيادة/);
    });

    await t.test('staff buzzer is available outside the dashboard', async () => {
        const { default: AppPage } = await server.ssrLoadModule('/src/pages/app-page.jsx');
        const staff = renderToStaticMarkup(createElement(AppPage, { user: { role: 'staff' } }));
        const doctor = renderToStaticMarkup(createElement(AppPage, { user: { role: 'doctor' } }));
        assert.match(staff, /تفعيل الصوت/);
        assert.match(staff, /aria-label="جرس الطبيب"/);
        assert.doesNotMatch(doctor, /تفعيل الصوت/);
    });
});
