export const initialWorkspace = { activeView: 'dashboard', openVisits: [], selectedPatientId: null, queueRevision: 0 };

export function workspaceReducer(state, action) {
    switch (action.type) {
        case 'navigate':
            return { ...state, activeView: action.view };
        case 'open':
            return {
                ...state, activeView: 'visits', selectedPatientId: action.patientId,
                openVisits: state.openVisits.some(visit => visit.patientId === action.patientId)
                    ? state.openVisits : [...state.openVisits, { patientId: action.patientId, name: action.name }],
            };
        case 'select':
            return state.openVisits.some(visit => visit.patientId === action.patientId)
                ? { ...state, selectedPatientId: action.patientId } : state;
        case 'saved': {
            const openVisits = state.openVisits.filter(visit => visit.patientId !== action.patientId);
            const selectedPatientId = state.selectedPatientId === action.patientId
                ? openVisits[0]?.patientId ?? null : state.selectedPatientId;
            return {
                ...state, openVisits, selectedPatientId, queueRevision: state.queueRevision + 1,
                activeView: state.activeView === 'visits' && openVisits.length === 0 ? 'dashboard' : state.activeView,
            };
        }
        default: return state;
    }
}
