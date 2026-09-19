import { useState } from "react";
import Main from "../components/main";
import SideBar from "../components/sidebar";
import styles from "./app-page.module.css";

export default function AppPage(){
    


   
    return <div className={styles.page} dir="rtl">
        <SideBar />
        <Main/>
    </div>
}
