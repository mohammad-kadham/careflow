# Manual Qi Card subscriptions

Payment destination: **Qi Card — 07736250346**. Prices remain **22,500 IQD/month** (`basic`) and **37,500 IQD/month** (`advanced`). These display settings live in `src/billing.js`.

The customer creates an account, logs in, chooses a plan, and transfers the amount outside CareFlow. They then press **لقد دفعت (I've paid)** and submit their sender phone and transaction number. CareFlow stores a pending report linked to their authenticated user and clinic, with the selected plan and server-set amount. Reports survive page reloads and transaction numbers are unique, so retries cannot create duplicate reports. CareFlow does not initiate a transfer, check Qi Card transactions, or treat a report as proof of payment. No card numbers, PINs, or payment credentials are collected.

After checking receipt of the actual payment, activate the matching clinic in the database. There is deliberately no customer-accessible activation API. Selecting a plan only changes payment instructions; the database determines the approved plan and expiry.

## Deploying the backend

The matching backend is included in the `backend/` directory of this project.

Restart it with its usual startup command (`npm start` or `npm run dev`). Its existing initialization runs `data/migrations/add-subscriptions.js`, adding these columns to `clinics`:

- `subscription_required`: defaults to `0`, preserving every existing clinic's access. New registrations explicitly set it to `1`.
- `subscription_plan`: `basic` or `advanced` when approved.
- `subscription_expires_at`: the access expiry stored in **UTC**.

Startup also runs `data/migrations/add-payment-reports.js` to create `manual_payment_reports`. Authenticated doctors can submit and view their own clinic's reports through `/user/payment-reports`, even before activation. Staff cannot submit reports. The customer interface shows the latest 20 reports; the database keeps the full history. Prices are defined in `src/billing.js` for display and `controllers/payment-reports.js` in the backend for saved report amounts; update both when changing prices.

Deploy/restart the backend before using the updated frontend. These migrations have not been run against your live database by this change.

## Finding customers who reported payment

Run this in the database to see pending reports with the customer's name, email, clinic, sender phone, transfer number, plan, and amount. No email or push notification is sent; this query is your review queue.

```sql
SELECT p.id AS report_id, p.submitted_at, u.name AS customer_name,
       u.email, c.id AS clinic_id, c.name AS clinic_name,
       p.sender_phone, p.transaction_reference, p.plan, p.amount_iqd, p.status
FROM manual_payment_reports p
JOIN users u ON u.id = p.user_id
JOIN clinics c ON c.id = p.clinic_id
WHERE p.status = 'pending'
ORDER BY p.submitted_at, p.id;
```

Verify the transaction and amount in your Qi Card account. Then replace `NULL` with the reviewed report ID and run the following single atomic update. It both activates/renews the clinic and marks that report approved. Re-running it for an already approved report does not extend the subscription again.

```sql
SET @verified_report_id = NULL; -- replace with the verified report ID

UPDATE clinics c
JOIN manual_payment_reports p ON p.clinic_id = c.id
SET c.subscription_required = 1,
    c.subscription_plan = p.plan,
    c.subscription_expires_at = DATE_ADD(
        GREATEST(COALESCE(c.subscription_expires_at, UTC_TIMESTAMP()), UTC_TIMESTAMP()),
        INTERVAL 1 MONTH
    ),
    p.status = 'approved',
    p.reviewed_at = UTC_TIMESTAMP()
WHERE p.id = @verified_report_id AND p.status = 'pending'
  AND p.plan IN ('basic', 'advanced');
```

To reject an unverified report without changing subscription access:

```sql
UPDATE manual_payment_reports
SET status = 'rejected', reviewed_at = UTC_TIMESTAMP()
WHERE id = @verified_report_id AND status = 'pending';
```

If you grant access using the report workflow above, do not also run the direct clinic update below for the same payment.

## Granting or renewing one month

Find the customer first. Replace the sample email below with the email shown on their payment page. Verify both the clinic ID and transfer amount before applying the update.

```sql
SELECT u.id AS user_id, u.email, u.clinic_id, c.name,
       c.subscription_required, c.subscription_plan, c.subscription_expires_at
FROM users u JOIN clinics c ON c.id = u.clinic_id
WHERE u.role = 'doctor' AND u.email = 'customer@example.com';
```

The update is intentionally inert until you replace `NULL` with the verified clinic ID. Set the plan to the one you received payment for. Run it only once per confirmed payment; running it twice adds two months.

```sql
SET @paid_clinic_id = NULL; -- replace with the verified numeric clinic ID
SET @paid_plan = 'basic';  -- or 'advanced'

UPDATE clinics
SET subscription_required = 1,
    subscription_plan = @paid_plan,
    subscription_expires_at = DATE_ADD(
        GREATEST(COALESCE(subscription_expires_at, UTC_TIMESTAMP()), UTC_TIMESTAMP()),
        INTERVAL 1 MONTH
    )
WHERE id = @paid_clinic_id AND @paid_plan IN ('basic', 'advanced');

SELECT id, name, subscription_plan, subscription_expires_at
FROM clinics WHERE id = @paid_clinic_id;
```

This starts a month from now for an unpaid/expired clinic, or extends an existing expiry by a month. It applies to the clinic's doctor and staff. For transfers reported through the app, prefer the atomic report approval above to avoid duplicate grants. The app rechecks subscription access on focus and every minute, or the customer can reload the page; the API checks the clinic on every authenticated request.

To revoke paid access (or move an existing clinic to pending activation):

```sql
UPDATE clinics
SET subscription_required = 1, subscription_expires_at = NULL
WHERE id = @paid_clinic_id;
```

Patient records, visit history, and queues remain stored when access expires. Login, logout, and subscription instructions remain available. The demo remains usable without payment. Existing doctor/staff account limits are unchanged by this payment feature.
