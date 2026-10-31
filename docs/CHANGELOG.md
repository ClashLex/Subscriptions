# Changelog

> **Documentation update rule:** After every completed implementation step, update this file before beginning the next step. Change only information verified against the current code, database, tests, or running UI. Record the date, step completed, resulting behaviour, and any deviation or unresolved issue. Update `CHANGELOG.md` at the same time. Never mark an unimplemented or untested item as complete.

All notable project, documentation, and implementation changes should be recorded here. Keep entries newest first. This changelog tracks verified work; planned or unimplemented features belong in `IMPLEMENTATION_PLAN.md`, not as completed entries here.

## [Unreleased]

### Dither workspace background — 2026-10-31

- Extended the supplied React Bits Dither component from the sign-in visual to a soft, fixed background behind Admin, Staff, and Customer pages. The canvas ignores pointer input and uses a low-resolution palette so forms, tables, and cards remain readable. A CSS gradient is visible when WebGL2 is unavailable.
- The client build and local production-like HTTPS billing check passed. Browser inspection confirmed the canvas appears on Admin and customer pages with no horizontal overflow at 390 px; the headless test browser used the CSS fallback because its WebGL2 context was unavailable.

### Redesigned browser interface — 2026-10-31

- Rebuilt the sign-in, registration, and password-reset pages around a responsive split layout with a React Bits Dither visual and CSS fallback when WebGL2 cannot render it.
- Added shared Admin, Staff, and Customer navigation using the real React Bits PillNav component, with active routes and responsive menu behavior. Redesigned the finance overview, customer subscription cards, empty states, buttons, fields, status badges, tables, dialogs, and overall color and typography system. Included the upstream React Bits source license notice.
- Fixed a mobile horizontal overflow caused by PillNav's hidden measurement row. The local production-like HTTPS browser check passed across billing, payment, session, and SMTP capture. The seeded demo rehearsal passed across Admin and two Customer accounts, payment error states, and 390 px and 320 px layouts. Client build passed; lint completed with warnings in existing page patterns and upstream React Bits source.
- A hosted deployment and external SMTP provider are still unverified because neither is configured.

### Improved against the supplied problem statement — 2026-10-31

- Added migration 009 to classify core and optional product lines, track whether each subscription add-on is enabled, and preserve existing line prices and enabled state. Newly created subscriptions price their first core line from the plan plus a variant adjustment; other lines use catalogue or template prices.
- Added customer and Staff/Admin add-on controls. Customer portal users can manage only their own active or paused add-ons and use pause, resume, close, and renewal actions allowed by the plan. Core lines cannot be switched off. Invoice generation skips disabled add-ons, and already issued invoices remain unchanged.
- The live subscription and billing acceptance suites passed, including ownership, customer lifecycle policy, plan pricing, add-on switching across consecutive billing periods, and invoice history. The local production-like HTTPS browser check passed with customer add-on and pause/resume interactions, invoice PDF, Secure cookie, and SMTP invoice capture.
- Expanded the local benchmark to 3,000 temporary subscriptions and invoices. Across 20 requests per endpoint, p95 was 15.5 ms for finance summary, 13.6 ms for subscriptions, 17.7 ms for invoices, and 17.5 ms for payments. This verifies the two-second target for those local paths only; hosted load remains untested.
- Fixed the deployment check's proxy shutdown error and made it verify migration 009. External SMTP delivery and a hosted deployment remain unverified because neither is configured.
- Renewal now rejects a second request for the same contract; the subscription acceptance suite verified the guard. Local SMTP capture verified both invoice and password reset delivery, and the scheduler check passed with the plan-priced core line.

### Fixed and verified — 2026-10-31 (concurrency, scheduler, local deployment, demo)

- Added a live concurrency script. Four overlapping billing runs produced one invoice and one creation report. Two competing full payments accepted exactly one; two simultaneous partial payments settled a second invoice exactly. MySQL invoice and payment rows were checked.
- Added a scheduler integration script that launched a separate API with a one-minute interval. Its first tick created the fixture invoice, stored a system actor on the `INVOICED` event, and used the expected product-line amount.
- Added a local production-like HTTPS check. The compiled API, migration 008, Vite production bundle, reverse proxy, health and CORS responses, Secure session cookie, Admin/Customer/Staff browser workflow, invoice PDF, and invoice email through the API to a local SMTP capture server passed. No hosted deployment or external SMTP provider was available; their behaviour remains unverified.
- Fixed production password-reset fallback so an unset SMTP transport does not log a reset token. A unit check confirms production neither logs nor returns the link. Development fallback remains available.
- Added an automated seeded demo rehearsal. It exercised catalogue and subscription views, two billing runs without a duplicate, invoice confirmation, partial and full payments, overpayment feedback, finance overview, role redirects, and two-customer isolation. The run exposed horizontal overflow at 390 px; responsive Admin and portal headers were fixed, and the rehearsal passed at 390 px and 320 px. `rehearse:demo` leaves a fresh due dataset for the live demo.

### Fixed and verified — 2026-10-31 (billing cadence and live workflow)

- Added migration 008 and stored each subscription's billing anniversary day. Monthly billing now returns to the original day after a short month, yearly February 29 billing returns on leap years, and resume sets a new anchor from the shifted due date. The migration applied successfully to the local MySQL database.
- Added repeated-period monthly and yearly billing acceptance assertions. The live auth, catalogue, subscriptions, and billing API suites passed against the local database and compiled API.
- Added a Playwright Edge browser check for Admin invoice and finance views, Customer invoice deep links and payments, Staff controls, and printable invoice PDF output. The check passed with the local Vite and API servers. Vite now proxies to IPv4 loopback, and sign-in preserves the requested destination after a session update.
- Added a local SMTP capture check for actual Nodemailer invoice delivery, recipient, invoice amount, and portal link; it passed without sending mail outside the machine. External SMTP delivery remains unverified. A PDF attachment is not part of the current invoice email.
- Added a temporary 1,000-record finance benchmark. Summary, invoice list, and payment list p95 values were 9.1 ms, 7.8 ms, and 12.4 ms respectively across 20 local requests each; finance deltas and an overdue-query EXPLAIN were checked, and the fixture was removed. These timings describe this local Docker setup only.
- Added `seed:demo` and ran it against the local database, creating two fictional customers, a Staff account, product variant, monthly and weekly plans, a quotation template, discount, partial and full payments, and a due subscription. The seed run verifies repeat billing creates no duplicate invoice and each customer is denied the other's invoice. Generated credentials and record IDs are saved to Git-ignored `demo-credentials.txt`. An npm override now keeps transitive `mysql2` on the declared patched version; server `npm audit --audit-level=moderate` reported zero vulnerabilities after install.

### Added — 2026-10-31 (invoice delivery and print)

- Added a role-checked printable invoice page with a browser Print / Save as PDF action. Unauthenticated users return to the requested page after signing in.
- Added Staff/Admin `POST /api/v1/invoices/:id/send` for confirmed or paid invoices. It sends a plain-text portal link by configured SMTP, returns an explicit error when SMTP is absent, and records a best-effort delivery audit after a successful send. No email or PDF attachment was sent during this implementation.
- Extended the billing acceptance script with customer draft-invoice visibility, finance-role, and finance-total assertions. Added a database-free test of currency aggregation. The client build, server build, unit check, and acceptance-script syntax check pass; live SMTP/browser/database paths remain unverified here.
- Added deterministic daily, weekly, month-end, and leap-year interval unit checks. Repeated multi-period billing still needs live acceptance coverage.

### Added — 2026-10-31 (customer billing portal)

- Added paginated customer subscription, invoice, and payment views. Invoice detail shows line snapshots, tax, discount, balance, and payment history; invoice links can open a specific detail view.
- Customer invoice reads now hide invoices that were never confirmed, including drafts cancelled before confirmation. Existing customer ownership checks still apply.
- Client build and server typecheck pass. Live portal role and database checks remain pending in this shell.

### Added — 2026-10-31 (finance summary)

- Added Staff/Admin `GET /api/v1/finance/summary` and a dated finance overview. SQL aggregates report active subscriptions, confirmed or paid invoice totals in the period, successful payments in the period, and current outstanding and overdue balances, grouped by currency.
- Client build and server typecheck pass. Live database totals have not yet been checked in this shell.

### Added — 2026-10-31 (billing and finance browser workflow)

- Added Admin and Staff invoice screens with filters, invoice line/ledger detail, confirmation, eligible cancellation, and payment recording. The Admin-only billing control reports created, skipped, auto-closed, and failed work.
- Added a paginated payment history screen with filters and invoice links. Added discount rule management: Admins can create, edit, activate, and deactivate rules; Staff see active rules read-only. Product-scoped rules support paginated product selection.
- Clarified in the plan and subscription screens that plan price is a catalogue reference amount. Recurring invoices continue to bill snapshotted subscription line prices with applicable discounts and taxes. This is the agreed pricing rule.
- Updated the README with the browser billing workflow and current feature status.

### Verification — 2026-10-31 (billing and finance browser workflow)

- Client production build, lint, and API response helper checks pass; server typecheck/build and staged whitespace checks pass. Lint retains existing React warnings and reports the same effect-pattern warning in the new pages.
- Live invoice, payment, discount, and billing flows need a running MySQL server and API for browser acceptance verification in this shell.

### Documentation — 2026-10-31 (Git tracking convention)

- Git now tracks only the root README and `docs/CHANGELOG.md` among Markdown files. Other `docs/*.md` files remain on disk locally but are removed from Git's index and ignored for future commits.
- Updated the README to explain which documentation is available in a fresh clone and removed links to local-only files.

### Documentation — 2026-10-31 (README rewrite)

- Replaced the root README with a verified project overview, feature-status table, local setup commands, roles, checks, repository map, and links into the tracked documentation pack.
- Clarified in the billing guide that the current invoice calculation uses subscription line prices rather than `plans.price`.
- Corrected the server `start` script and development guide to use the actual TypeScript build output at `dist/src/server.js`.
- No live database or browser acceptance run was performed for this documentation update.

### Fixed — 2026-10-31 (pre-push review)

- The client list helper now preserves API pagination metadata and array data; a focused mocked-fetch test covers paginated lists, the unpaginated customer directory, a detail response, and API errors.
- Direct subscription lines reject inactive variants. Product price changes reject values that would make an existing variant's effective price negative.
- Plan and subscription partial updates validate the resulting complete date window.
- Billing uses keyset batches across all due subscriptions and auto-close candidates. A failed row is reported in the run result and logged without stopping later rows.
- Added the missing forgot/reset-password client pages for the reset link generated by the API. Staff can now create/edit quotation templates in the UI, matching API permissions.
- The `docs/` pack is now tracked, so a fresh clone includes the project documentation.

### Verification — 2026-10-31 (pre-push review)

- Client build and lint, server typecheck/build, and the client API helper regression check passed locally. Lint reported existing React warnings.
- Live API acceptance suites and scheduler execution were not rerun in this shell because MySQL and the API were not running. Month-end/year-end and concurrency billing cases remain unverified.
- Billing/invoice UI, invoice email/PDF, finance dashboard, and the plan-price-to-invoice pricing rule remain open.

### Added — 2026-10-31 (Phase 5 — billing, invoices, and discounts API)

- Added and mounted `POST /billing/run`, `/discounts`, `/invoices`, and `/payments` routes. Billing is Admin-only; invoice/payment reads are customer-scoped or available to Staff/Admin; financial actions are Staff/Admin.
- Recurring billing locks and re-checks due subscriptions, writes invoice headers/lines and tax/discount snapshots in one transaction, advances `next_billing_at` only on commit, and relies on the unique subscription-period constraint for retry safety.
- Added fixed/percentage discounts, subscription/product scopes, eligibility checks, single highest-value selection, conditional usage consumption, and redemption records.
- Added invoice detail/list, confirm/cancel, payment list/recording, derived outstanding/partial/overdue values, and atomic overpayment checks. Confirm/cancel actions write audit records.
- Added `server/scripts/test-billing.mjs` and the `test:billing` script for billing, discount, tax-rounding, invoice, and payment acceptance flows.

### Fixed — 2026-10-31 (Phase 5)

- Corrected half-up percentage rounding: the prior threshold could round sub-half-cent values up to a cent. Billing and shared money calculations now round only at the half-cent boundary.
- Corrected billing event inserts to use the migrated `actor_user_id` column and ensured discount eligibility reads use the active billing transaction.
- Replaced random invoice-number staging with a UUID-derived temporary key, and only treat duplicate-period constraint errors as already-billed results.
- Fixed query boolean parsing so `overdueOnly=false` remains false, and deduplicated product IDs when updating a product-scoped discount.
- Kept discount rule IDs only on invoice lines receiving a discount allocation.

### Tests — 2026-10-31 (Phase 5)

- `npm run typecheck`, `npm run build`, and `npm run test:billing` pass.
- Regression suites `npm run test:auth`, `npm run test:catalogue`, and `npm run test:subscriptions` pass.
- Known gaps: billing/invoice UI, scheduler, invoice email/PDF, dashboard endpoints/UI, and concurrency/month-end/year-end acceptance coverage remain open.

### Added

- Initial documentation pack for the **Subscriptions** project.
- Requirements, workflows, architecture, data model, API contract, security/access, billing/finance, UI/UX, implementation roadmap, test plan, development guide, and deployment/demo guide.
- Earlier detailed development blueprint included as `DEVELOPMENT_BLUEPRINT.md`, with a documentation-maintenance note added before the original content.

### Notes

- This entry records documentation creation only. It does not claim that application code, database migrations, API endpoints, or UI features are implemented.
- Functional requirements are based on the supplied `Subscription_Management_System.pdf`. Project decisions and recommended defaults are labelled in the relevant documents.

### Changed — 2026-10-31

- Repository layout aligned with the documented convention: `README.md` moved to the repository root and the documentation pack moved from `Subscriptions_Project_Documentation/` to `docs/`. `DOCS_MANIFEST.md` and the README convention section updated to match.
- Git now tracks only the root `README.md`; the `.gitignore` ignores every other Markdown file, so the documentation pack in `docs/` is maintained outside the repository instead of being committed.
- `README.md` became a standalone overview: references to the other Markdown documents were removed and the documentation convention updated accordingly. The changelog itself sits in the untracked pack, so Git-based documentation traceability is intentionally waived.

### Fixed — 2026-10-31

- `DEVELOPMENT_GUIDE.md`: corrected a code fence that closed with four backticks while the opening fence used three.
- `API_CONTRACT.md`: clarified that Admin-only access for `POST /billing/run` is the recommended base policy and that Staff billing access may only be added by a recorded decision.

### Changed — 2026-10-31 (environment and Phase 0–1)

- Local development environment verified: Node v26.13.0 LTS via nvm (`.nvmrc` pinned), npm 11.20.0, Docker Desktop engine reachable via `docker.exe`.
- MySQL 8.4 runs in Docker via `compose.yaml` (container `subscriptions-mysql`, persistent volume `mysql_data`, health-checked). WSL reaches it on `127.0.0.1:3306`.
- Shared root `.env` created from `.env.example` with generated secrets; read by both Compose and the API (dotenv walks up from the process cwd).
- Server scaffold (`server/`): Zod-validated config, mysql2 pool returning DECIMAL as strings, transaction helper, Helmet/CORS/rate-limit, MySQL-backed sessions, central error handler (no stack leaks), `/api/v1/health`.
- Client scaffold (`client/`): Vite + React 19 + TypeScript, react-router-dom and Tailwind CSS v4 wired in, dev proxy `/api → localhost:4000`.
- Migration runner added (`server/scripts/migrate.ts`, `schema_migrations` table) and all 7 migrations applied — 20 business tables + `schema_migrations` verified in the `subscriptions` database.
- Verified: `GET /api/v1/health → HTTP 200 {"status":"ready","checks":{"database":true}}`; `npm run typecheck` passes.

### Fixed — 2026-10-31 (environment and Phase 0–1)

- npm 12 install-script allow-list initially blocked native builds; argon2 and esbuild approved and rebuilt (argon2 hash verified).
- dotenv empty-string `SMTP_*` values no longer fail validation; a first `SHOW TABLES` check without a default database was corrected.

### Changed — 2026-10-31 (Phase 2 — authentication and roles)

- Auth module (`server/src/modules/auth/`): registration with normalized email + unique constraint enforcement (409 on duplicate), login/logout with session regeneration, `/auth/me`, password policy (Argon2id; >8 chars, upper/lower/special), server-side sessions in MySQL (`subscriptions.sid`, HttpOnly, SameSite=Lax).
- `requireAuth` / `requireRole` / `requireAdmin` middleware implemented; admin-only staff creation and user status management (`POST /users/staff`, `PATCH /users/:id/status`) with audit logging; self-status changes blocked.
- Password reset: single-use 64-hex tokens stored as sha256 hashes with 60-minute expiry in UTC, token invalidation, generic forgot-password response (no account enumeration), session revocation on reset via transaction. Email adapter with real SMTP support plus a development fallback that logs the link (only in development).
- Rate limits: login 200/10 min, password-reset 60/15 min (generous for development; production deployment must tighten via a recorded decision).
- Seed script (`npm run seed`) creates/refreshes the demo Admin from `SEED_ADMIN_*` env vars.
- Client: Tailwind v4 wired into `vite.config.ts` and `src/index.css`; `/api` dev proxy to port 4000.
- Verified: `npm run typecheck` clean; `npm run test:auth` — 27/27 checks pass, covering duplicate/case/space email rejection, password-policy failures, role boundaries (401 anonymous / 403 customer+staff), staff lifecycle (created, deactivated → loses access, reactivated), single-use reset token and old→new password switch.

### Fixed — 2026-10-31 (Phase 2)

- dotenv empty-string `SMTP_*` values no longer fail validation; a first `SHOW TABLES` check without a default database was corrected.
- Known environment limitation: `tsx watch` on this /mnt/c (Windows drvfs) WSL mount does not reliably restart on file changes — the dev server must be restarted manually after code changes until the repository lives inside the WSL filesystem.

### Fixed — 2026-10-31 (Phase 2 hardening)

- Account deactivation now revokes the deactivated user's sessions inside the same transaction: a deactivated account loses access immediately instead of waiting for cookie expiry. The suite reuses a previously valid staff session cookie right after deactivation and proves it receives 401.
- `GET /users` returns the full pagination metadata from the API contract (`page`, `pageSize`, `total`, `totalPages`).
- Validation schemas are parsed once at the route boundary; the duplicate re-parse inside auth services was removed.
- Verified: `npm run typecheck` clean; `npm run test:auth` 27/27 checks pass including the new immediate-revocation step.

### Changed — 2026-10-31 (Phase 3 — catalogue backend)

- Money foundation (`server/src/lib/money.ts`): exact BigInt minor-unit arithmetic over DECIMAL strings (≤2 fraction digits), half-up percentage rounding — financial code never touches floating point.
- Products (`/products`, writes Admin-only, reads Admin/Staff): CRUD with name/type/`salesPrice`/`costPrice`, list with search + `includeInactive` + pagination metadata, and variants carrying a signed `priceAdjustment` with computed `effectivePrice` (product price + adjustment). Effective price below zero → 400 `EFFECTIVE_PRICE_NOT_ALLOWED`; duplicate variant name on a product → 409 `VARIANT_NAME_TAKEN`; unknown product/variant → 404.
- Taxes (`/taxes`, same role split): CRUD with `rate` "0"–"99.99", `taxMode` EXCLUSIVE (default) / INCLUSIVE; duplicate name → 409 `TAX_NAME_TAKEN`.
- Plans (`/plans`, writes Admin-only): CRUD with `billingIntervalUnit` DAY/WEEK/MONTH/YEAR, `billingIntervalCount`, `minimumQuantity`, availability window `availableFrom`/`availableUntil` (reversed window → 400 `INVALID_AVAILABILITY_WINDOW`, duplicate name → 409 `PLAN_NAME_TAKEN`) and lifecycle flags `allowPause`/`allowEarlyClose`/`allowRenewal`/`autoClose`.
- Role matrix: customers cannot read products/taxes (403) and only see plans that are active and inside their availability window; `GET /plans/:id` answers 404 for a not-currently-available plan instead of leaking it, and `includeInactive` is ignored for customer requests.
- Verified: `npm run typecheck` clean; new `npm run test:catalogue` — 21/21 checks pass on first run (variant effective price 120.00 + 560.00 → "680.00", negative-effective → 400, duplicate variant → 409, tax rate >99.99 → 400, unsupported interval → 400, reversed window → 400, plan name taken → 409, list metadata, staff read/cannot-write boundary, customer cannot read catalogue but sees available plans, inactive-product filtering); `npm run test:auth` still 27/27 pass.

### Fixed — 2026-10-31 (Phase 3 security)

- The plans router never enforced authentication: an anonymous `GET /plans` fell through the role check (undefined role, not CUSTOMER) into the Admin/Staff branch and could list every plan including inactive ones. The router now applies `requireAuth` before any handler; the suite gained a regression step — anonymous `GET /plans` and `GET /plans/:id` answer 401. Re-verified: catalogue suite (now 24 assertions incl. the anonymous checks) and auth suite fully pass.

### Added — 2026-10-31 (Phase 3 — catalogue UI)

- Client foundation: typed fetch wrapper with the enveloped `{data}`/`{error}` contract (`ApiError` carries status, code, and per-field validation details), session context bootstrapped from `/auth/me`, and role-based routing (Admin/Staff → back office, Customer → portal placeholder; anonymous → login).
- Screens: sign-in and customer self-registration (display name optional; server password policy surfaced per field), admin back-office layout with role badge and sign-out, Overview with catalogue counts, Products & variants (search, pagination, `includeInactive` toggle, product editor, variant panel with `effectivePrice` display and add/edit against the effective-price guard), Taxes (rate as decimal string, mode select), and Plans (interval unit/count, minimum quantity, availability window as nullable dates, and the pause/early-close/renewal/auto-close policy checks) — customers-only write actions hidden for Staff (the backend remains the authorization authority).
- Money values are sent and rendered as exact decimal strings; UI never converts them to floats.
- Verified: `npm run build` (tsc + vite) and `npm run lint` pass; the UI's API calls were smoke-tested through the Vite dev proxy on the app's own origin (login 200, `/auth/me` 200, products/plans/taxes reads 200, `POST /auth/logout` 204, `/auth/me` 401 afterwards); the auth and catalogue acceptance suites still fully pass. Browser-only visual flows remain to be exercised in the demo run.

### Added — 2026-10-31 (Phase 4 — staff quotation/subscription screens and customer directory)

- Staff subscription tooling screens: `/admin/subscriptions` (filterable list by status and customer), a create modal (customer + plan + start date + payment terms; line items from a quotation template or the shared line-item editor), and a detail modal with line/tax/total breakdowns, the event timeline, and the full lifecycle action bar (submit quotation with validity, confirm, activate, pause/resume per plan policy, close — labelled "Admin override" where early closure is banned — and renew). Frozen-after-confirmation editing is limited to Draft/Quotation as the server enforces.
- Quotation templates screen `/admin/templates`: Admin-only CRUD backed by the template endpoints; staff see it read-only. Items are built in the shared editor which takes no price input — unit prices are resolved server-side from the catalogue or the template's stored snapshot.
- Customer portal placeholder replaced by a real "My subscriptions" view (server-scoped list with status badges and key dates); invoices/payments remain Phases 5–6.
- Contract extension `GET /users/customers` (Staff/Admin): minimal customer directory (id, email, display/company name, active flag) so staff can create and filter subscriptions per the documented Customer navigation duty; customers requesting it get 403. Regression step added to the subscriptions suite.
- Subscription detail responses now carry the plan's policy flags (`allowPause`, `allowEarlyClose`, `allowRenewal`) so UI action bars render policy-aware buttons driven by server truth.
- `GET /subscriptions` list rows are mapped to the camelCase client DTO (see the Fixed note below).

### Fixed — 2026-10-31 (Phase 4 screens)

- `GET /subscriptions` returned raw snake_case rows (e.g. `subscription_number`) while the documented client contract is camelCase; list rows are now mapped to the camelCase DTO. Earlier suites masked this because they only asserted row ids; the new smoke verifies `customerId` filtering and the display fields the screens render.
- Subscription detail SQL extended to select the plan's policy columns; no route signatures changed.

### Tests — 2026-10-31 (Phase 4 screens)

- Client: `npm run build` (tsc + vite) and `npm run lint` pass (warnings only, consistent with existing pages).
- Server: `npm run typecheck` clean; `npm run test:subscriptions` green (30 checks, including the new customer-directory access step); `test:auth` and `test:catalogue` still fully pass.
- API smoke: a 14-step script replayed every fetch the new screens make (directory, plan/product/variant/tax reads, template create/rename/list, template-driven subscription creation with snapshot totals, detail policy flags, PATCH, quotation→confirm→activate, status and customer filters) — all pass.

### Added — 2026-10-31 (Phase 4 — quotations and subscriptions backend)

- Quotation templates (`/quotation-templates`, Staff/Admin per contract): CRUD with `validityDays`, optional `defaultPlanId`, and item lines whose unit price is snapshotted at save from the catalogue (variant effective price when referenced) together with an optional active tax. Template writes are staff-permitted (documented contract); responses include product/variant/tax names for display only.
- Subscriptions (`/subscriptions`): staff/admin create drafts from a template or a direct line form; customers get read access to their own rows only (listing and detail are scoped server-side; unknown-but-foreign detail answers 404). Draft creation validates the plan's availability window against the subscription's start date, the plan's minimum quantity (sum of line quantities), active product/variant/tax existence, and that the customer is an active CUSTOMER.
- Unique subscription numbers are derived from the row id inside the creation transaction (`SUB-` + zero-padded id) — no count-based collisions.
- Line snapshots: description, agreed unit price (template items keep their template-saved price even if the catalogue changes afterwards; direct lines use the current effective price), quantity, `lineAmount`, and tax name/rate/mode snapshots; post-confirmation edits are frozen (409 `INVALID_TRANSITION`).
- Lifecycle (Draft → Quotation → Confirmed → Active → Paused/Closed) is a guarded transition service writing `subscription_events` (actor, from/to, reason): quotation submission sets the validity end from template validity (or the request body); confirming an expired quotation fails `QUOTATION_EXPIRED`; activation requires the start date reached (`START_DATE_NOT_REACHED` otherwise), stamps `next_billing_at` and the contract `expiry_date` (one billing interval, month-end clamped); pause only when the plan allows (`PAUSE_NOT_ALLOWED`), resume shifts `next_billing_at` by the paused duration; closing honours `allow_early_close` with an audited Admin override (`CLOSED_ADMIN_OVERRIDE`); renewal creates a linked new draft carrying the previous contract's agreed prices (`previous_subscription_id`) when the plan allows renewal.
- Totals follow BILLING_AND_FINANCE §4 with exact decimal-unit arithmetic: EXCLUSIVE tax is added on top of the subtotal; INCLUSIVE tax is extracted for display only and never double-counted into the grand total.
- Auto-close remains planned for Phase 5, where the controlled billing service will run it with a period lock.
- Environment: the global rate limit is now configured (default 300/5 min; `RATE_LIMIT_MAX` raised in the demo `.env` because acceptance suites issue hundreds of requests; production should keep the default).
- Verified: `npm run typecheck` clean; new `npm run test:subscriptions` — 29/29 (template CRUD + 409s, snapshot stability after catalogue price change, minimum quantity, availability window, inactive plan, unknown customer, DRAFT→QUOTATION→CONFIRMED→ACTIVE including the future-start block and start-date correction in DRAFT, pause/resume audit trail, close override, renewal linkage + `RENEWAL_NOT_ALLOWED`, template-driven copy with template validity, staff boundaries incl. planned 409 close, customer scoping and 403 writes, status filtering); `test:auth` 27/27 and `test:catalogue` fully pass (plan-visibility assertion now requests pageSize=100 since the grown catalogue exceeds one page).

## Entry template

For each completed implementation or documentation step, add a new dated entry under `Unreleased` or create a version heading when a release is made:

```markdown
## [Unreleased] — YYYY-MM-DD

### Added
- [Verified additions]

### Changed
- [Verified behaviour or design changes]

### Fixed
- [Verified defects corrected]

### Tests
- [Commands/scenarios run and outcome]

### Known limitations
- [Remaining issue, or None]
```

Do not record planned work as completed. Include relevant migration names, API routes, or commit hashes when they make the change easier to trace.
