import { useEffect, useState } from "react";
import styles from "./main.module.css";
import PatientsRow from "./patient-row";


export default function PatientsQueue() {
const [patients , setPatients]=useState([])
useEffect(()=>{
async function fetchData() {
    const data = await fetch('http://localhost:3000/patients');
    const dataJson = await data.json();
    console.log(dataJson);
    setPatients(dataJson)
}
fetchData()
},[])

    return <section className={styles.card} aria-labelledby="records-title">
        <div className={styles.cardHeader}>
            <h2 id="records-title">سجل المرضى</h2>
        </div>
        <ul className={styles.patientList}>
            {patients.map(patient => <PatientsRow key={patient.id} patient={patient} />)}
        </ul>
    </section>
}
