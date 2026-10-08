-- Run once against an existing database created with the original schema.
-- Existing first/last names and medical-info records are preserved.
ALTER TABLE patients
  ADD COLUMN name VARCHAR(201) NULL,
  MODIFY COLUMN first_name VARCHAR(100) NULL,
  MODIFY COLUMN last_name VARCHAR(100) NULL,
  MODIFY COLUMN date_of_birth DATE NULL,
  MODIFY COLUMN gender ENUM('male', 'female', 'other', 'prefer-not-to-say') NULL,
  MODIFY COLUMN phone VARCHAR(40) NULL,
  ADD COLUMN emergency_contact_name VARCHAR(120) NULL,
  ADD COLUMN emergency_contact_relationship VARCHAR(100) NULL,
  ADD COLUMN emergency_contact_phone VARCHAR(40) NULL,
  ADD COLUMN symptoms TEXT NULL,
  ADD COLUMN medications TEXT NULL,
  ADD COLUMN allergies TEXT NULL,
  ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'wait';

UPDATE patients SET name = TRIM(CONCAT_WS(' ', first_name, last_name)) WHERE name IS NULL;
ALTER TABLE patients MODIFY COLUMN name VARCHAR(201) NOT NULL;
