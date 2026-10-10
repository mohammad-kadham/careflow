# Shared ten-day trial code

Deploy the frontend and backend together and restart the backend. Startup creates `trial_codes` for the single shared code and `trial_redemptions` for per-clinic history. These trial migrations are new, unreleased migrations; existing subscriptions are unchanged.

In `/admin/`, open **رمز التجربة المجانية**, select the basic or advanced plan, and click **إنشاء الرمز المشترك** once. Copy that code and share it with all intended clinics. Once created, the admin page displays the same code, its plan, availability, and usage count instead of a generator. It also lists the clinics that redeemed it and their original trial dates. The database singleton key prevents a second code from being generated, including concurrent creation requests.

A verified doctor with inactive access can redeem the shared code on `/subscription` for exactly ten days from the database UTC clock. Each clinic has one redemption record keyed by its clinic ID. The same code works for other clinics, but retries by a clinic never extend or restart its trial, including after expiry or revocation. Active subscriptions and legacy unlimited access are not replaced.

The owner can disable or re-enable the same code. Disabling it prevents new redemptions without revoking existing trials. Re-enabling it preserves every clinic's redemption history and cannot grant a second trial. Activation and redemption history commit atomically. Clinic row locks and the redemption primary key protect concurrent attempts; the shared code is read under a shared lock so different clinics can redeem it concurrently while status updates remain coordinated.

The duration and granted plan come from the server. The client cannot choose either or submit another clinic's ID. Redemption requires a verified doctor session and is limited to ten requests per IP per fifteen minutes. Owner-only administration uses the existing separate admin session.

Validation: `npm test`, `npm run test:backend`, `npm run lint`, and `npm run build`. Backend tests use mocked persistence and do not replace a live MySQL migration/concurrency check.

The active shared code is displayed directly above the redemption input for signed-in, verified doctors. GET /user/trial-code returns only the enabled code (or null when it is missing or disabled); it does not expose admin details or clinic redemption history.
