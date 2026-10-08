-- Run once on existing databases before starting the updated backend.
RENAME TABLE clinic_patients TO in_queue;
