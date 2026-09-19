import { useState } from "react";
import styles from "./sidebar.module.css";

export default function SideBar() {
    const [btnState,setBtnState]=useState({dashboard:true})
function HandleClick(identifier){
    setBtnState(prev=>({[identifier]:true}))
}

    return <aside className={styles.sidebar}>
        <nav className={styles.navigation} aria-label="القائمة الرئيسية">
            <button type="button" className={`${btnState.dashboard?styles.active:''}`} aria-current="page" onClick={()=>HandleClick('dashboard')}>
                <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                <span>لوحة التحكم</span>
            </button>
            <button type="button" className={`${btnState.add?styles.active:''}`} onClick={()=>HandleClick('add')}>
                <svg className={styles.icon}  viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <circle cx="9" cy="7" r="4" />
                    <path d="M2 21v-2a7 7 0 0 1 14 0v2M19 7v6m-3-3h6" />
                </svg>
                <span>إضافة مريض</span>
            </button>
            <button type="button" className={`${btnState.record?styles.active:''}`} onClick={()=>HandleClick('record')}>
                <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <rect x="5" y="3" width="16" height="18" rx="1" />
                    <path d="M3 7h4M3 12h4M3 17h4M10 16h6" />
                    <circle cx="13" cy="9" r="2" />
                </svg>
                <span>سجل المرضى</span>
            </button>
        </nav>
    </aside>;
}
