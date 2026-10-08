# Email verification with Brevo

New doctor and staff accounts must confirm their email before login. Existing accounts retain
access when the additive migration runs. Verification is independent of paid subscription
activation: confirming email does not activate a subscription.

## Configure before deployment

Authenticate your sending domain and create a sender in Brevo. See the official
[sender setup guide](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email)
and [transactional email API guide](https://developers.brevo.com/docs/send-a-transactional-email).
Use a Brevo **API key**, not an SMTP key. Add these server-only environment settings:

```dotenv
BREVO_API_KEY=your-api-key
BREVO_SENDER_EMAIL=no-reply@your-domain.example
BREVO_SENDER_NAME=CareFlow
APP_URL=https://your-domain.example
```

`APP_URL` must be the frontend origin without a path, query, or fragment. HTTPS is required in
production. Local development permits `http://localhost:5173` or another localhost port.
Never place the API key in a `VITE_` variable, source control, workflow artifact, or client bundle.
Restart the API after changing the environment. New account creation returns 503 before saving
an account if the configuration is missing or invalid; configure Brevo before deploying this feature.

## Flow and recovery

- Signup creates an unverified account and requests a transactional email. The frontend shows
  a confirmation screen with a resend form. If Brevo rejects the initial email, the account
  remains unverified and the response accurately reports `emailSent: false`.
- Links open `/verify-email#token=...`. The token is removed from the address bar and the user
  must click the confirmation button. Loading the page alone does not consume a link.
- Tokens contain 32 random bytes, are stored only as SHA-256 hashes, expire after one hour,
  and are consumed atomically. Resending replaces the old token. Concurrent resends share a
  database-backed 60-second cooldown.
- Login checks the password before returning `403 EMAIL_NOT_VERIFIED`. All authenticated
  routes also reject an unverified account, including a previously issued session cookie.
- Confirmed users log in normally; verification does not create a session automatically.
- A resend request returns the same generic 202 response for unknown, verified, pending, or
  cooling-down accounts. Provider failures are logged without keys, tokens, or provider details.

Endpoints (all POST with JSON bodies):

| Endpoint | Body |
| --- | --- |
| `/user/verification/resend` | `{ "email": "user@example.com" }` |
| `/user/verification/confirm` | `{ "token": "64-lowercase-hex-characters" }` |

Signup is limited to 20 requests per hour per IP, resends to 10, and confirmation attempts to
60. IP limits are process-local; the per-account cooldown persists across restarts. The API
trusts only loopback proxies. If the reverse proxy moves off the host, update that trust setting
deliberately rather than trusting arbitrary forwarded headers.

The migration adds `users.email_verification_required`, `users.email_verified_at`, and the
`email_verifications` table. New inserts always set the required flag server-side. Existing
accounts keep the default flag of zero; no email is sent to existing customers by the migration.

Automated tests mock Brevo and never send real email. Before activation, verify the sender in
Brevo and test delivery to an address you control. A successful API request means Brevo accepted
the message, not that the recipient's mailbox delivered it; check Brevo's transactional logs for
delivery failures and sender/domain issues.
