# Test Plan and Acceptance Tests

> **Documentation update rule:** After every completed implementation step, update this file before beginning the next step. Change only information verified against the current code, database, tests, or running UI. Record the date, step completed, resulting behaviour, and any deviation or unresolved issue. Update `CHANGELOG.md` at the same time. Never mark an unimplemented or untested item as complete.

## 1. Testing approach

Test business logic at service level, API permissions at integration level, and the principal customer/admin journeys through the UI. Financial calculations and recurring billing deserve more than screenshot/manual testing: they must be tested against deterministic input/output cases.

## 2. Test layers

- **Unit tests:** password validation, billing date calculation, money rounding, discount eligibility, tax calculation, status transitions.
- **Integration tests:** API routes, session/role middleware, SQL repositories, transactions, uniqueness constraints.
- **End-to-end tests:** create product/plan → subscription → invoice → payment → dashboard.
- **Performance checks:** paginated list and dashboard with thousands of records.
- **Manual usability checks:** responsive layout, empty states, validation errors, print/email views.

## 3. Authentication and access tests

- [ ] Valid customer registration succeeds.
- [ ] Duplicate normalized email is rejected.
- [ ] Password of eight characters or fewer is rejected.
- [ ] Password missing uppercase, lowercase, or special character is rejected.
- [ ] Password hash is stored; plaintext is not.
- [ ] Login succeeds with correct credentials and fails with incorrect credentials.
- [ ] Logout invalidates the session.
- [ ] Only Admin can create staff.
- [ ] Staff cannot change their role through request payload.
- [ ] Customer cannot fetch another customer's subscription/invoice/payment.
- [ ] Reset token expires and cannot be used twice.

## 4. Catalogue and plan tests

- [ ] Product requires valid name/type/prices.
- [ ] Negative or malformed prices are rejected.
- [ ] Variant price adjustment produces expected unit price.
- [ ] Inactive product/variant cannot be selected for a new subscription.
- [ ] Daily, weekly, monthly, and yearly plans are accepted.
- [ ] Unsupported interval is rejected.
- [ ] Minimum quantity is enforced.
- [ ] Plan availability start/end is enforced.
- [ ] Pause, early close, auto-close, and renewal are blocked when disabled.

## 5. Subscription lifecycle tests

- [ ] Draft can be submitted as Quotation.
- [ ] Quotation can be Confirmed before expiry.
- [ ] Expired quotation cannot be confirmed.
- [ ] Confirmed subscription activates under the chosen start-date policy.
- [ ] Invalid state transitions are rejected.
- [ ] Pause is possible only when allowed.
- [ ] Paused subscription is excluded from due billing.
- [ ] Resume calculates the next billing date according to the documented policy.
- [ ] Closure prevents future billing.
- [ ] Renewal creates a linked new subscription and preserves the old record.

## 6. Billing and invoice tests

- [ ] Daily billing period is calculated correctly.
- [ ] Weekly billing period is calculated correctly.
- [ ] Monthly recurrence handles month ends (e.g. dates near the 29th–31st).
- [ ] Yearly recurrence handles leap-year dates.
- [x] Due active subscription creates an invoice.
- [ ] Future-due subscription does not create an invoice.
- [ ] Paused/closed subscription does not create an invoice.
- [x] Re-running billing does not create a duplicate invoice.
- [ ] Two concurrent billing runs still create only one invoice per period.
- [ ] Invoice creation failure leaves next billing date unchanged.
- [x] Invoice lines preserve the correct price/tax snapshots.
- [x] Confirm/cancel action respects invoice state for the tested Admin path.

## 7. Tax and discount tests

- [x] Exclusive tax amount and grand total match a known example.
- [ ] Inclusive tax is handled correctly if supported.
- [ ] Tax rate change does not alter older invoice snapshots.
- [ ] Discount before start date is rejected.
- [ ] Discount after end date is rejected.
- [ ] Minimum purchase/quantity rules are enforced.
- [x] Product-scoped discount does not affect unrelated products.
- [ ] Subscription-scoped discount applies under the selected policy.
- [ ] Fixed and percentage discounts are capped at eligible subtotal.
- [ ] Usage limit cannot be exceeded concurrently.
- [ ] Expired/exhausted discount does not apply to a later invoice.

## 8. Payments and finance tests

- [ ] Payment requires positive amount, method, date, and invoice.
- [ ] Payment against cancelled/draft invoice is rejected under the selected policy.
- [x] Payment cannot exceed outstanding balance under the recommended default.
- [x] Partial payment leaves positive outstanding amount.
- [x] Full payment marks invoice Paid.
- [ ] Repeated submission does not duplicate a payment if idempotency is enabled.
- [ ] Overdue condition is derived correctly from due date and outstanding balance.
- [ ] Dashboard separates invoiced amount from cash received.
- [ ] Cancelled invoices are excluded from receivables.

## 9. UI and performance tests

- [ ] All list pages show loading, error, and empty states.
- [ ] Forms show field-level validation errors.
- [ ] Destructive actions require confirmation.
- [ ] Navigation matches the user's role.
- [ ] Tables are paginated on the server.
- [ ] Filters and sorting work and are validated.
- [ ] UI remains usable at mobile width.
- [ ] Keyboard focus and labels are usable.
- [ ] A representative page request with thousands of subscriptions responds in under two seconds in the documented test environment.

## 10. High-value end-to-end demo test

1. Sign in as Admin.
2. Create a product with a variant.
3. Create a tax and a monthly plan.
4. Sign in/register as a customer.
5. Create a subscription from the plan or through Staff.
6. Confirm and activate it.
7. Set/seed its next billing date as due using a supported test fixture, not a production data edit.
8. Run billing twice. Verify one invoice exists for the period.
9. Confirm the invoice and check tax/discount calculations.
10. Record a partial payment, then the remaining payment.
11. Verify invoice becomes Paid and dashboard figures change.
12. Sign in as another customer and verify the first customer's data is inaccessible.

## 11. Test evidence log

For each important test run, record date, branch/commit, command or manual steps, dataset size where relevant, pass/fail, and defects found. Keep test evidence truthful; do not claim performance targets passed without measuring them.

### 2026-10-31 — pre-push review

- `client`: `npm run test:api` and `npm run build` passed. `npm run lint` passed with existing React warnings.
- `server`: `npm run typecheck` and `npm run build` passed.
- The mocked client test checks paginated list data and metadata, a list without metadata, a detail response, and an API error.
- The live API suites, scheduler, browser flow, and concurrent/multi-interval billing were not run in this environment; MySQL and the API were not running.

### 2026-10-31 — Phase 5 billing API

- `server`: `npm run typecheck`, `npm run build`, `npm run test:billing`, `npm run test:auth`, `npm run test:catalogue`, and `npm run test:subscriptions` all passed.
- Billing acceptance exercised two due subscriptions, invoice period retry behavior, product-scoped discount eligibility/usage, exclusive tax and half-up rounding, invoice cancellation, partial payment, overpayment rejection, full payment, payment listing, and customer access to their own invoice.
- Not covered by this run: scheduler, concurrent requests, weekly/monthly/yearly invoice periods, inclusive-tax invoice snapshots, PDF/email, dashboard, or UI.
