# Password reset

Deploy the frontend and backend together and restart the API. Startup adds `users.auth_version`, `admin_sessions.auth_version`, and the `password_resets` table. Existing accounts, subscriptions, and sessions retain access until their ordinary expiry or a password reset; the initial authentication version is zero.

The feature uses the same server-only `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, optional `BREVO_SENDER_NAME`, and `APP_URL` as email verification. No additional provider configuration is needed when verification email already works. `APP_URL` must be the frontend origin and must use HTTPS in production. Frontend hosting must route `/forgot-password` and `/reset-password` to the app, as with `/login`.

The regular and admin login screens link to **نسيت كلمة السر؟**. Users enter their account email on `/forgot-password`, then follow the emailed `/reset-password#token=...` link and enter their new password twice. Doctor and staff accounts can reset passwords. Reset does not verify an unverified account, change roles, grant subscriptions, or automatically log the user in.

## API and behavior

- `POST /user/password-reset/request` with `{ "email": "user@example.com" }` returns a generic 202 response for known, unknown, and cooling-down accounts. The response does not wait for the email provider, avoiding provider timing revealing account existence. Delivery runs in the API process and is best-effort; it is not a durable email queue. If the process restarts or delivery fails, request another link after a minute. Configuration failures return 503 consistently before account lookup.
- `POST /user/password-reset/confirm` with `{ "token": "64-lowercase-hex-characters", "password": "new password" }` requires a valid unexpired token and a password of at least six characters, at most 72 UTF-8 bytes (matching the existing bcrypt policy). Password confirmation is checked by the frontend and is not stored.
- Reset links contain 32 random bytes, expire after 30 minutes, and are stored only as SHA-256 hashes. New requests replace older links after a persistent 60-second per-account cooldown. A provider failure revokes only the token for that delivery attempt.
- Opening a link does not consume it. Tokens are passed in the URL fragment, removed from the address bar, held only in memory, and submitted in a JSON POST body. They are not rendered or stored in browser storage.
- Password update, token consumption, authentication-version increment, and admin-session deletion commit in one transaction. Per-user locks serialize reset/resend races. Tokens also carry the version at issuance, so stale requests cannot issue links after a password change.
- Authenticated API requests compare the JWT's version to the current database value. Admin sessions also store and check that version, preventing a concurrent login using the old password from restoring an old session after reset.
- Requests are limited to five per IP per fifteen minutes; confirmations to twenty. IP limits are process-local. JSON-only writes, existing origin protections, and no-store responses apply.

Tests use mocked persistence and Brevo; no emails are sent. Run `npm test`, `npm run test:backend`, `npm run lint`, and `npm run build` from the frontend root. Live MySQL migration and mailbox delivery still require deployment verification with a controlled test account. Never log reset tokens, passwords, provider API keys, or raw provider errors.
