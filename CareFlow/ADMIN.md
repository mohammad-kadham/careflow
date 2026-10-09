# CareFlow subscription admin

Open **https://app-careflow.com/admin/**. This is a separate HTML entry point and
React app, with its own sign-in and short-lived session. Use your authorized
CareFlow email and existing password. It works even if the administrator's own
clinic subscription is inactive.

## Review payments

The default screen lists pending customer payment reports. Search by customer,
email, clinic, sender phone, or transfer reference. A submitted report is not proof
of payment: check the matching amount and reference in your Qi Card account.

Open **مراجعة البلاغ**, confirm receipt, write a note, and approve. Approval
atomically marks the report accepted, applies its stored plan, and adds one calendar
month to the later of the current expiry or now. Approval cannot be applied twice.
Reject a report with a reason when receipt cannot be confirmed. Rejection preserves
the clinic's current subscription. Accepted/rejected reports remain in the history.

## Manage subscriptions

In **اشتراكات العيادات**, search for a clinic or doctor's email and select
**إدارة الاشتراك**. You can:

- Grant/renew 1–12 calendar months with a selected plan.
- Set an exact future expiry and plan; the form uses your device's local timezone.
- Stop access immediately while preserving all clinic and patient records.

Each action requires a note and confirmation. Manual grants do not mark a payment
report accepted or contribute to the accepted-payment total. Use report approval
for reported transfers; do not grant the same payment a second time manually.

The audit tab records the administrator, time, clinic, reason and before/after
subscription state. Older changes made directly in SQL are not backfilled.
Concurrent edits using an outdated clinic revision are rejected; refresh before
retrying. Requests use unique IDs so retrying a request after a connection failure
does not add subscription time twice. Account access and list data refresh when
you navigate or press **تحديث البيانات**.

## Server access configuration

`ADMIN_USER_IDS` in `/etc/careflow/backend.env` is a comma-separated allowlist of
existing doctor database IDs. Empty means nobody can enter. Resolve IDs using an
exact account email, then configure only the owner-authorized IDs:

```sql
SELECT id, email, role, email_verification_required, email_verified_at
FROM users WHERE email = 'your-admin-account@example.com';
```

Restart `careflow.service` after changing the allowlist. New accounts must finish
email verification. No public registration field or customer API can grant admin
access. Removing an ID takes effect for existing sessions on their next request.

The admin cookie is HttpOnly, Secure in production, SameSite=Strict, scoped to
`/api/admin`, and expires after 30 minutes. Only its SHA-256 hash is stored. Logout
deletes the session server-side. An ordinary clinic cookie cannot access admin APIs.
Origin checks, JSON-only writes and login rate limiting also apply. No patient
records are exposed through the admin API. Audit and subscription mutations commit
together; audit storage failures roll back the entire change.

The startup migration adds `clinics.subscription_revision`, `admin_sessions` and
`admin_subscription_audit`. It preserves existing subscription values. Back up the
database before deployment (the existing deployment pipeline does this).

## Development and deployment

Use the existing frontend and backend installation commands. `npm run dev` serves
the admin at `/admin/`; `npm run build` creates both `dist/index.html` and
`dist/admin/index.html`. The existing pipeline ships both apps together. Nginx's
directory index handling serves `/admin/`; API requests use `/api/admin/*`.
The development cookie path is `/admin` because the local API has no `/api` prefix.

Run `npm test`, `npm run test:backend`, `npm run lint`, and `npm run build` before
publishing changes. Tests use fake accounts and persistence. Real SQL validation
should use a separate temporary database, never customer payment reports.
