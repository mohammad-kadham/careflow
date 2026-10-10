# Backend authentication

Requires Node.js 22.16+ (this project currently runs on Node.js 24).
The server loads .env automatically; environment variables already set by the host take precedence.
Keep local .env files out of Git. Configure database access with DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME.
For another environment, copy .env.example to .env and generate a fresh secret using the command in that file.
Production must set NODE_ENV=production and use HTTPS, which enables Secure cookies.

## Endpoints

- POST /user/new: name, email, password, clinic_name, phone (all required). Creates a doctor and a new clinic in one transaction; ignores a client-supplied role or clinic_id. Signup does not log in automatically.
- POST /user/login: email, password. Sets the HttpOnly careflow_session cookie for one hour and returns public user details. No token is returned in JSON.
- GET /user/me: returns public user details for the current session, or 401.
- POST /user/logout: clears the browser cookie, even if already expired. Send an empty JSON object.
- POST /user/password-reset/request: email. Returns the same generic 202 response for existing and unknown accounts.
- POST /user/password-reset/confirm: token, password. Consumes a single-use 30-minute link, changes the password, and invalidates existing user and admin sessions. See PASSWORD-RESET.md.
- All patient, queue and visit routes now require the session cookie. /test has been removed.

For POST requests, send Content-Type: application/json.
Postman stores the login cookie and sends it with subsequent requests to the same host.
Use one hostname consistently (localhost and 127.0.0.1 have separate cookie storage).

Frontend fetch calls must use credentials: 'include', including login and logout.
Frontend signup, login, logout, route protection and patient requests are connected. Signup sends name, email, clinic_name, phone and password, then redirects to login after account creation.
CORS_ORIGINS lists exact allowed frontend origins; browser writes from other origins are rejected.
Writes require JSON to prevent ordinary cross-origin HTML forms from submitting them.
Auth responses and protected API responses use Cache-Control: no-store.

## Scope and limitations

Roles are doctor and staff. Staff can register patient demographics, search patient records, and manage the queue. Medical information and visits are doctor-only, enforced by the API.
Doctors can GET /user/staff and POST /user/staff with name, email, phone and password.
Each doctor can create one linked staff account. The backend assigns the staff role, doctor_id and clinic name; these cannot be chosen by the client.
Existing staff accounts without a known doctor remain unassigned; the migration does not guess ownership.
Existing admin accounts, if any, migrate to doctor. No accounts are deleted.
Each user and patient has a clinic_id foreign key to clinics.id. The clinic is resolved from the authenticated database user, never from request data.
Patient lists, searches, medical records, queue operations, and visits are restricted to that clinic. Cross-clinic patient IDs return 404.
GET /patients?q=search returns only matching patients and their inQueue flag. Missing or blank q returns an empty list. Search covers name, record ID, phone and city, with a 150-character query limit; all words must match.
Staff inherit their doctor's clinic_id. New public doctor signups receive a new clinic; identical clinic names do not merge accounts.
Existing doctors receive separate clinics during migration, and linked staff inherit the matching clinic. Legacy patients without an explicit assignment are not exposed to any clinic.
Clinic name (up to 150 characters) and phone (up to 40 characters) are stored on users and returned with public user details. Phone is text to preserve leading zeros and international prefixes.
Existing accounts keep NULL for these fields until updated. Startup adds missing columns without deleting data; it can also be run with: node data/migrations/add-user-signup-fields.js.
Password confirmation is a frontend check and is never stored.
Logout clears the browser cookie; a previously copied JWT remains valid until its one-hour expiration.
There is no refresh token or per-JWT revocation list. Password reset increments a persistent per-user authentication version checked on every request, invalidating that user's existing JWTs and admin sessions. Deleted users are rejected immediately.
The JWT verifies HS256, issuer, audience, expiry, and numeric database user ID.
Changing JWT_SECRET invalidates existing cookies.

## Verification

Run: node --test tests/auth.test.js tests/user-migration.test.js

Tests use an in-memory database substitute and an ephemeral HTTP server, without changing clinic data.

Clinic buzzer: POST /user/buzzer (doctor) signals only their linked staff account in the same clinic. GET /user/buzzer (staff) polls the latest signal. Signals expire after 30 seconds, with a 3-second send cooldown. Signals are transient in the single API process, cleared on restart; multiple API workers would require a shared store. Staff should keep the app open and click Enable sound once per page load.

Entry pause: GET /user/entry-state returns the current doctor or linked staff entry state. POST /user/entry-state is doctor-only and accepts a boolean paused. The server supplies doctor and clinic IDs. State is stored in clinic_entry_control and persists until explicitly resumed, including across refreshes/restarts. GET /user/buzzer includes paused for the staff banner.

Staff status: the staff client POSTs /user/buzzer/poll every two seconds with a per-tab UUID, browser audio readiness, and the last received event ID. Presence expires after 15 seconds without a heartbeat. Doctor GET /user/entry-state includes linked staff presence, sound readiness (any live tab), and the last alert receipt state. POST /user/buzzer/ack records explicit staff acknowledgment of the exact alert ID. Receipt summaries are kept in memory for 10 minutes; undelivered alerts expire after 30 seconds. These indicators do not prove that device speakers are audible. Acknowledging a buzzer does not resume paused entry.

Queued visit highlight: POST /in-queue/:id/open-visit is doctor-only, clinic-scoped and idempotent. It marks in_queue.visit_opened_at without creating a medical visit. GET /in-queue includes visitOpen; staff queues refresh every three seconds. Saving the visit marks visit_completed_at and keeps its number crossed out in the queue. Completed rows are excluded from the waiting count and from patient search inQueue flags. Re-adding a completed patient clears both visit timestamps and places them at the end of the queue.

Close clinic: DELETE /in-queue requires a doctor session and clears all queue rows belonging to the authenticated clinic, including completed rows. Client clinic IDs are ignored. Returns { cleared: number }; an empty queue succeeds with zero. Patient records and saved visits are preserved. This clears the queue without blocking new check-ins.
