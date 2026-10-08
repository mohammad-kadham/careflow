import styles from "./main.module.css";
import Dashboard from "./dashboard";
import AddPatient from "./add-patient";
import PatientRecords from "./patient-records";
import Visits from "./visits";
import StaffManagement from './staff-management';
import visitStyles from './visits.module.css';

export default function Main({ user, activeView, openVisits, selectedPatientId, onOpenVisit, onSelectVisit, onVisitSaved, queueRevision }) {
    const isDoctor = user?.role === 'doctor';
    let content = <Dashboard user={user} onOpenVisit={onOpenVisit} queueRevision={queueRevision} />;
    if (activeView === 'add') {
        content =<main className={`${styles.main} ${styles.addMain}`}>
      <AddPatient canEditMedical={isDoctor} />
    </main>
    }
    if (activeView === 'record') {
        content = <main className={`${styles.main} ${styles.addMain}`}>
      <PatientRecords canViewMedical={isDoctor} />
    </main>
    }

    if (activeView === 'visits' && isDoctor) content = null;
    if (activeView === 'staff' && isDoctor) {
        content = <main className={`${styles.main} ${styles.addMain}`}><StaffManagement /></main>;
    }

    return <>

        {content}
        {isDoctor && <main hidden={activeView !== 'visits'} className={`${styles.main} ${styles.addMain}`}>
            {openVisits.length > 0 && <>
                <nav className={visitStyles.tabs} aria-label="الزيارات المفتوحة">
                    {openVisits.map(visit => <button key={visit.patientId} type="button"
                        className={`${visitStyles.button} ${selectedPatientId === visit.patientId ? visitStyles.selectedTab : ''}`}
                        aria-pressed={selectedPatientId === visit.patientId}
                        aria-controls={`open-visit-${visit.patientId}`} onClick={() => onSelectVisit(visit.patientId)}>
                        {visit.name || `مريض #${visit.patientId}`} <span>#{visit.patientId}</span>
                    </button>)}
                </nav>
                <p className={visitStyles.tabHint}>يمكنك فتح مريض آخر من قائمة الانتظار. تبقى الملاحظات محفوظة أثناء التنقل حتى إغلاق الصفحة.</p>
            </>}
            {openVisits.length === 0 && <Visits patientId={null} />}
            {openVisits.map(visit => <div key={visit.patientId} id={`open-visit-${visit.patientId}`}
                hidden={selectedPatientId !== visit.patientId}>
                <Visits patientId={visit.patientId} onVisitSaved={() => onVisitSaved(visit.patientId)} />
            </div>)}
        </main>}
    </>


}
