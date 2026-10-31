# Deployment, Submission, and Demo Guide

> **Documentation update rule:** After every completed implementation step, update this file before beginning the next step. Change only information verified against the current code, database, tests, or running UI. Record the date, step completed, resulting behaviour, and any deviation or unresolved issue. Update `CHANGELOG.md` at the same time. Never mark an unimplemented or untested item as complete.

## 1. Deployment objective

The application must be easy to start and demonstrate in a clean environment. A local demo is acceptable when permitted by the event instructions. Do not claim the system is production-ready merely because it runs locally.

## 2. Before deployment or submission

- [ ] Run all database migrations from a clean database.
- [ ] Verify seed script creates only fictional demo data.
- [ ] Verify frontend production build.
- [ ] Verify backend build and start command.
- [ ] Configure environment variables through the platform's secret manager.
- [ ] Configure HTTPS and secure cookie settings.
- [ ] Configure persistent MySQL storage.
- [ ] Configure SMTP if password reset/invoice email is demonstrated.
- [ ] Configure billing scheduler or document the Admin manual billing trigger.
- [ ] Test a fresh setup using only README instructions.
- [ ] Confirm event submission requirements and package the requested deliverables.

## 3. Environment configuration

Separate development, demo, and production-like environments. Do not reuse local secrets in deployment. Configure frontend origin, API URL, database credentials, session secret, SMTP credentials, timezone, and allowed CORS origin explicitly.

Use HTTPS for any public deployment. Set session cookie flags according to the hosting topology. The database should not be publicly exposed unless the hosting design requires it and appropriate network controls are in place.

## 4. Database and scheduler

- Use a managed or persistent MySQL instance.
- Back up the database before risky schema changes.
- Run migrations as a controlled deployment step.
- Ensure only one scheduler leader runs billing, or rely on the billing service's transaction/unique-key protections so overlapping runs remain safe.
- Keep a manual Admin billing trigger available for demo and operational recovery, with audit logging.

## 5. Demo data

Prepare clearly fictional data that exercises the main features:

- One Admin account.
- One Staff account.
- At least two Customer accounts to demonstrate data isolation.
- Products with at least one price-adjusting variant.
- A monthly plan and one other supported interval.
- A quotation template.
- An active subscription due for billing.
- One invoice with no payment, one partially paid, and one fully paid if time permits.
- An eligible discount with a limited usage count.

Never use real customer data or real personal credentials in a public demo.

## 6. Suggested demo flow

1. Explain the business problem: spreadsheets, missed renewals, manual invoices, and manual payment matching.
2. Sign in as Admin and create/show a product, variant, tax, and plan.
3. Show a quotation template and create/confirm a subscription.
4. Show the subscription lifecycle and next billing date.
5. Run billing twice and demonstrate that the same period produces only one invoice.
6. Open the invoice and explain its product lines, tax, discount, and total.
7. Record a payment and show the outstanding balance updating.
8. Complete the payment and show Paid state.
9. Open the dashboard and distinguish cash received from invoiced and overdue amounts.
10. Sign in as another customer and demonstrate that the first customer's records are not accessible.

Keep the demo focused on a connected workflow rather than spending time opening every settings screen.

## 7. Reliability fallback

If scheduled billing is not fully configured, show the Admin “Run billing” control calling the same billing service. Be transparent that the scheduler is a future/unfinished deployment feature. Do not simulate an invoice by hard-coding it or creating it directly from the frontend.

If outbound email cannot be configured in the judging environment, demonstrate the local development fallback only if allowed, and identify it as such. Do not describe it as a successfully delivered email.

## 8. Final handoff checklist

- [ ] README includes exact setup and run commands that have been tested.
- [ ] `.env.example` contains all required variable names and no secrets.
- [ ] Database migrations and seed script are committed.
- [ ] Demo accounts and reset instructions are documented safely.
- [ ] Known limitations are listed.
- [ ] Git repository is accessible to the intended reviewers.
- [ ] Build/test results are recorded.
- [ ] Event rules, deadline, submission format, and any required links are rechecked on the official event portal.
