import { useReducer } from 'react';
import Main from '../components/main';
import SideBar from '../components/sidebar';
import StaffBuzzer from '../components/staff-buzzer';
import styles from './app-page.module.css';
import { initialWorkspace, workspaceReducer } from './visit-workspace';

export default function AppPage({ user, onLogout, loggingOut, logoutError }) {
    const [workspace, dispatch] = useReducer(workspaceReducer, initialWorkspace);
    return <div className={`${styles.page} ${user?.role === 'staff' ? styles.staffPage : ''}`} dir="rtl">
        <SideBar user={user} activeView={workspace.activeView} onLogout={onLogout}
            loggingOut={loggingOut} logoutError={logoutError}
            onViewChange={view => dispatch({ type: 'navigate', view })} />
        <Main user={user} activeView={workspace.activeView} openVisits={workspace.openVisits} queueRevision={workspace.queueRevision}
            selectedPatientId={workspace.selectedPatientId}
            onOpenVisit={(patientId, name) => dispatch({ type: 'open', patientId, name })}
            onSelectVisit={patientId => dispatch({ type: 'select', patientId })}
            onVisitSaved={patientId => dispatch({ type: 'saved', patientId })} />
        {user?.role === 'staff' && <StaffBuzzer />}
    </div>;
}
