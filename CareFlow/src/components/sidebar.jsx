import styles from "./sidebar.module.css";

export default function SideBar({user,onViewChange,activeView,onLogout,loggingOut,logoutError}) {



    return <aside className={styles.sidebar}>
        <nav className={styles.navigation} aria-label="القائمة الرئيسية">
            <button type="button" className={`${activeView === 'dashboard'?styles.active:''}`} aria-current={activeView === 'dashboard' ? 'page' : undefined} onClick={()=>onViewChange('dashboard')}>
                <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                <span>لوحة التحكم</span>
            </button>
            <button type="button" className={`${activeView === 'add'?styles.active:''}`} onClick={()=>onViewChange('add')}>
                <svg className={styles.icon}  viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <circle cx="9" cy="7" r="4" />
                    <path d="M2 21v-2a7 7 0 0 1 14 0v2M19 7v6m-3-3h6" />
                </svg>
                <span>إضافة مريض</span>
            </button>
            <button type="button" className={`${activeView === 'record'?styles.active:''}`} onClick={()=>onViewChange('record')}>
                <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <rect x="5" y="3" width="16" height="18" rx="1" />
                    <path d="M3 7h4M3 12h4M3 17h4M10 16h6" />
                    <circle cx="13" cy="9" r="2" />
                </svg>
                <span>سجل المرضى</span>
            </button>
            {user?.role === 'doctor' && <button type="button" className={activeView === 'visits' ? styles.active : ''}
                aria-current={activeView === 'visits' ? 'page' : undefined} onClick={() => onViewChange('visits')}>
                <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <rect x="3" y="5" width="18" height="16" rx="1" />
                    <path d="M7 3v4M17 3v4M3 10h18M12 13v5M9.5 15.5h5" />
                </svg>
                <span>الزيارات</span>
            </button>}
            {user?.role === 'doctor' && <button type="button" className={activeView === 'staff' ? styles.active : ''}
                aria-current={activeView === 'staff' ? 'page' : undefined} onClick={() => onViewChange('staff')}>
                <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <circle cx="8" cy="7" r="3" /><path d="M2 21v-3a6 6 0 0 1 12 0v3M18 8v8M14 12h8" />
                </svg>
                <span>إدارة الموظفين</span>
            </button>}
        </nav>
        <div className={styles.account}>
            {user?.role === 'doctor' && user.subscription && <a href="/subscription">الاشتراك والدفع</a>}
            {logoutError && <p className={styles.error} role="alert">{logoutError}</p>}
            <button className={styles.logout} type="button" onClick={onLogout} disabled={loggingOut}>
                <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M10 4H4v16h6M10 12h11M17 8l4 4-4 4" />
                </svg>
                <span>{loggingOut ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}</span>
            </button>
        </div>
        <div className={styles.brand}>
            <img src="/careflow.png" alt="" width="48" height="48" />
            <span>كيرفلو<span className={styles.brandDot}>.</span></span>
        </div>
    </aside>;
}
