# CareFlow

Arabic clinic workspace built with React and Vite, with an Express/MySQL backend in `backend/`.

Features include doctor/staff accounts, clinic-scoped patient records, queues and visits, staff alerts, a browser-only demo, and manually approved Qi Card subscriptions. Mastercard is displayed as coming soon.

## Local setup

Use Node.js 22.16+ and MySQL. From the repository root, enter `CareFlow/` before running these commands.

```sh
npm ci
npm --prefix backend ci
```

Copy `backend/.env.example` to `backend/.env`. Set the database connection values for your local MySQL database and set `JWT_SECRET` to a random secret (at least 32 bytes). Generate one with:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Create the MySQL database named by `DB_NAME` and grant your database user access before starting the API. Startup creates tables and applies the included migrations. Local environment files and database contents are not included in Git.

Start the backend:

```sh
npm --prefix backend start
```

In another terminal, start the frontend:

```sh
npm run dev
```

The API uses port 8080 and Vite normally uses port 5173. Use the same hostname for both (`localhost` or `127.0.0.1`). To use another API origin, copy `.env.example` to `.env` and set `VITE_API_URL`; update the backend's `CORS_ORIGINS` accordingly.

Open `/demo` to try sample data without a database or account. Demo data resets on reload.

## Traffic analytics

Cloudflare Web Analytics loads in production on `app-careflow.com` and
`www.app-careflow.com` for the homepage, blog, and demo only. Local development,
preview hosts, authentication, clinic, subscription, admin, and unknown routes
do not load the beacon. Moving between public and excluded routes loads a fresh
document because removing the script alone does not remove its SPA listeners.
Public-to-public navigation continues to use React Router and Cloudflare's SPA tracking.

View traffic in Cloudflare **Web Analytics** for `app-careflow.com`. The embedded
site token is public, not an API credential. Use manual snippet installation;
do not also enable automatic Cloudflare injection or install another copy of the
beacon, which would bypass these exclusions or double-count visits. Referrers
are limited to the origin so account links do not pass their query parameters
to subsequent pages. No custom events, form contents, or patient identifiers
are sent by this integration.

After deployment, visit the homepage and blog and check for the Cloudflare
beacon and `/cdn-cgi/rum` requests in the browser network panel. Open `/login`
and confirm the new document has no beacon; also test direct `/app` and `/admin/`
visits. Allow a few minutes for dashboard data to arrive. Script blockers can
prevent reporting, so these counts are not a complete access log.

## Verification

```sh
npm run lint
npm run build
npm test
npm run test:backend
npm --prefix backend run test:unit
```

Backend tests mock persistence and do not access a live database. Unit tests cover payment reporting, subscription checks, and role permissions; the full suite also exercises HTTP authentication, clinic isolation, queues, and alerts.

## Manual subscriptions

See [MANUAL-PAYMENTS.md](MANUAL-PAYMENTS.md) for the payment-report review query and atomic approval SQL. Customers report a transfer using “لقد دفعت”; reports stay pending until you verify receipt and activate the subscription in the database. Existing clinics keep their access when the subscription migration is first applied; new registrations require approval.

See [backend/AUTH.md](backend/AUTH.md) for session and API details. Production requires HTTPS, `NODE_ENV=production`, appropriate allowed origins, and your own environment secrets.

## Email verification

New doctor and staff accounts confirm their email before login. Configure the Brevo API key,
verified sender, and frontend origin before deploying or testing account creation. See
[backend/EMAIL-VERIFICATION.md](backend/EMAIL-VERIFICATION.md) for setup, resend recovery,
and verification behavior. Existing accounts keep their access when the migration runs.

## Blog

The public `/blog` page loads Markdown articles from `content/blog/`. Copy
`post-template.md` to add a post, change its metadata and text, and set `draft: false`
to publish with the next deployment. See [BLOG.md](BLOG.md) for GitHub editing,
images, local previews, and publishing instructions.

## Subscription admin

The separate `/admin/` app lets the authorized owner review payment reports,
approve or reject transfers, manage subscriptions, and inspect an audit history.
See [ADMIN.md](ADMIN.md) for access configuration and operation.
