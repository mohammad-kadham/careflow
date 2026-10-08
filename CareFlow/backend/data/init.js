const pool = require("./db")
const addUserSignupFields = require("./migrations/add-user-signup-fields");
const addStaffAccounts = require("./migrations/add-staff-accounts");
const addClinics = require("./migrations/add-clinics");


async function initDB() {
  await pool.query(`CREATE TABLE IF NOT EXISTS clinics (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS patients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      clinic_id INT NOT NULL,
      CONSTRAINT fk_patients_clinic FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE RESTRICT,
      name VARCHAR(120) NOT NULL,
      date_of_birth DATE,
      gender ENUM('male', 'female', 'other', 'prefer-not-to-say'),
      phone VARCHAR(40),
      address VARCHAR(250),
      city VARCHAR(100),
      country VARCHAR(100),
      emergency_contact_name VARCHAR(120),
      emergency_contact_relationship VARCHAR(100),
      emergency_contact_phone VARCHAR(40),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS patient_medical_info (
      id INT AUTO_INCREMENT PRIMARY KEY,
      patient_id INT NOT NULL,
      blood_type VARCHAR(5),
      height_cm DECIMAL(5,2),
      weight_kg DECIMAL(5,2),
      allergies TEXT,
      chronic_conditions TEXT,
      notes TEXT,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clinic_id INT NOT NULL,
  CONSTRAINT fk_users_clinic FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE RESTRICT,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('doctor', 'staff') NOT NULL DEFAULT 'doctor',
  doctor_id INT,
  UNIQUE KEY uq_users_staff_doctor (doctor_id),
  CONSTRAINT fk_users_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,
  clinic_name VARCHAR(150),
  phone VARCHAR(40),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
    `)
  await addUserSignupFields(pool);
  await addStaffAccounts(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      patient_id INT NOT NULL,
      doctor_id INT,
      visit_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      symptoms TEXT,
      examination_notes TEXT,
      diagnosis TEXT,
      treatment TEXT,
      medications TEXT,
      follow_up_date DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_visits_patient_date (patient_id, visit_date),
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
      FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  // Current clinic attendance only; completed visit history stays in visits.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS in_queue (
      patient_id INT PRIMARY KEY,
      checked_in_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      visit_opened_at DATETIME NULL,
      visit_completed_at DATETIME NULL,
      INDEX idx_in_queue_check_in (checked_in_at, patient_id),
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT
    )
  `);
  await addClinics(pool);
  await require('./migrations/add-entry-control')(pool);
  await require('./migrations/add-queue-visit-opened')(pool);
  await require('./migrations/add-queue-visit-completed')(pool);
  await require('./migrations/add-subscriptions')(pool);
  await require('./migrations/add-payment-reports')(pool);
  await require('./migrations/add-email-verification')(pool);
  console.log('Tables ready');

}

module.exports = initDB;
