# Implementation Roadmap

> **Documentation update rule:** After every completed implementation step, update this file before beginning the next step. Change only information verified against the current code, database, tests, or running UI. Record the date, step completed, resulting behaviour, and any deviation or unresolved issue. Update `CHANGELOG.md` at the same time. Never mark an unimplemented or untested item as complete.

## 1. Guiding strategy

Build one working vertical slice before expanding feature breadth. The priority is a complete and correct path from product/plan setup to subscription, invoice, payment, and dashboard. Avoid disconnected CRUD screens that do not share real data.

The project is designed for a solo participant and a constrained hackathon build. Keep the implementation small, explainable, and testable.

## 2. Definition of Done for every step

A step is complete only when:

1. The feature works through the intended UI/API flow.
2. Backend validation and permission checks are in place.
3. Database constraints or transactions protect important invariants.
4. At least one relevant happy-path test and important failure-path test pass.
5. Loading, error, and empty states are handled where relevant.
6. The relevant Markdown documents are updated.
7. `CHANGELOG.md` records the completed work and any known limitation.
8. A meaningful Git commit exists (when using Git).

Do not mark a checkbox complete merely because code was generated or a screen renders.

## 3. Ordered implementation phases

### Phase 0 — Repository and decisions

- [ ] Create repository and `client`, `server`, and `docs` directories.
- [ ] Add `.gitignore`, `.env.example`, and root README.
- [ ] Confirm installed Node, npm, and MySQL versions.
- [ ] Decide session strategy, currency, tax mode, discount stacking, timezone, and monthly billing behaviour.
- [ ] Record decisions in relevant docs and `CHANGELOG.md`.

**Exit condition:** a clean repository exists and the developer can explain the architecture and scope.

### Phase 1 — Database and API skeleton

- [ ] Create the MySQL database and least-privilege application user.
- [ ] Add a migration runner and `schema_migrations` table.
- [ ] Create initial users, products, plans, subscriptions, invoices, and payments migrations.
- [ ] Create the Express server, config validation, database pool, health endpoint, and central error handler.
- [ ] Verify API-to-MySQL connectivity.

**Exit condition:** migrations run reliably and `/api/v1/health` succeeds only when required dependencies are ready.

### Phase 2 — Authentication and roles

- [ ] Customer registration and unique normalized email.
- [ ] Login/logout and persistent sessions.
- [ ] Argon2id password hashing and password policy.
- [ ] Admin-only staff creation.
- [ ] Backend role middleware and customer ownership checks.
- [ ] Password reset token flow and configured email adapter, or clearly documented development fallback.

**Exit condition:** role and ownership tests pass.

### Phase 3 — Catalogue and plans

- [ ] Product create/read/update.
- [ ] Variant management and price adjustment.
- [ ] Tax rule CRUD.
- [ ] Plan CRUD and interval/date validation.
- [ ] Plan policy fields for pause, early close, auto-close, and renewal.

**Exit condition:** Admin can configure a valid product and plan through the UI and persist it.

### Phase 4 — Quotations and subscriptions

- [ ] Quotation template CRUD and validity days.
- [ ] Subscription creation from a template or direct form.
- [ ] Unique subscription number.
- [ ] Subscription lines with quantity, agreed unit price, and tax snapshots.
- [ ] State transition service and event history.
- [ ] Pause, resume, close, and renewal behaviour.

**Exit condition:** authorized staff can create, quote, confirm, and activate a subscription without editing the database manually.

### Phase 5 — Billing, invoices, and discounts

- [ ] Billing period calculation for daily/weekly/monthly/yearly plans (helper supports all four; the acceptance suite currently exercises daily).
- [x] Idempotent billing service and unique invoice-period key.
- [x] Transactional invoice and line creation.
- [x] Tax calculation and snapshots (exclusive-tax invoice path verified).
- [x] Discount eligibility, product/subscription scope, usage limit, and redemption.
- [x] Invoice confirm/cancel actions.
- [ ] Invoice send/print actions.
- [x] Admin-only manual `POST /billing/run` API trigger.
- [ ] Admin UI control for manual billing.
- [x] Optional scheduler calls the same billing service when `BILLING_RUN_INTERVAL_MINUTES` is positive (implemented; runtime behavior still needs a live acceptance check).

**Exit condition:** repeated billing runs do not duplicate invoices or advance dates incorrectly. The API retry path is verified; the remaining Phase 5 items above are not complete.

### Phase 6 — Payments and finance dashboard

- [x] Record payment method, amount, date, and note through the API.
- [x] Atomic payment and invoice balance update.
- [x] Partial payment and paid balance states (overdue calculation is implemented but not acceptance-tested).
- [ ] Dashboard summary query for active subscriptions, received payments, outstanding and overdue invoices.
- [ ] Date filters and paginated tables.
- [ ] Staff/Admin finance UI for invoices and payments.

**Exit condition:** a payment updates invoice balance and dashboard values correctly.

### Phase 7 — Quality, performance, and demo

- [ ] Test all critical acceptance cases in `TEST_PLAN.md`.
- [ ] Add indexes for actual filters and due-billing queries.
- [ ] Test thousands of seeded subscriptions or a representative dataset.
- [ ] Verify page response target under two seconds for the selected test setup.
- [ ] Test responsive layout and error states.
- [ ] Prepare fictional demo accounts and records.
- [ ] Rehearse the complete demo flow.
- [ ] Verify submission packaging and event instructions.

**Exit condition:** clean setup, demo, and critical workflows can be repeated without hand-editing data.

## 4. Priority if time becomes critical

**Must work first:** login/role boundaries, products/plans, subscription lifecycle, recurring invoice generation without duplicates, payment recording, and dashboard totals.

**Next:** quotation templates, discounts, tax configuration, invoice printing/email, password reset email, and polish.

**Defer unless already complete:** real payment gateway, advanced charting, complex accounting, multi-currency, complex integrations, microservices, and unnecessary infrastructure. Do not remove a challenge requirement silently; label deferred requirements clearly in the submission and record their status.

## 5. Step log template

Copy this into the relevant document and `CHANGELOG.md` after each completed implementation step:

```markdown
### YYYY-MM-DD — Step N: [step name]
- Status: Complete / Partial / Blocked
- Implemented: [verified behaviour]
- Files/migrations changed: [paths]
- Tests run and result: [commands/results]
- Decisions/deviations: [details or None]
- Remaining issue: [details or None]
```

## 6. Current progress

### 2026-10-31 — pre-push review
- Status: Static checks passed; live integration checks pending.
- Fixed: client list responses and password-reset pages, staff quotation-template controls, catalogue price/variant guards, partial-update date validation, and billing traversal/error isolation.
- Documentation: `docs/` is tracked, and stale scheduler status was corrected.
- Tests: client API helper check, client build/lint, and server typecheck/build passed. Live API acceptance suites were not rerun in this shell.

### 2026-10-31 — Phase 5/6 API slice
- Status: Partial
- Implemented: Admin-triggered recurring billing, period idempotency, transactional invoice lines and tax snapshots, eligible discount application/redemption, invoice confirmation/cancellation and paginated reads, payment recording with partial/full balances.
- Files/routes: `server/src/modules/billing/`, `server/src/modules/discounts/`, `server/src/modules/invoices/`, `/billing/run`, `/discounts`, `/invoices`, `/payments`.
- Tests: server typecheck/build and auth, catalogue, subscriptions, and billing acceptance suites pass.
- Decisions/deviations: one highest-value eligible discount is selected; overpayments are rejected; successful-payment invoices cannot be cancelled.
- Remaining: billing UI, send/print, dashboard queries/UI, a live scheduler check, and wider interval/concurrency acceptance cases.
