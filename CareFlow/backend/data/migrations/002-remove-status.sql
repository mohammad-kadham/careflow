-- Run once on databases that already have these status columns.
ALTER TABLE patients DROP COLUMN status;
ALTER TABLE visits DROP COLUMN status;
