# Subscriptions

**Subscription and recurring revenue management for the fictional Brightloop Software.**

Subscriptions is an independent Make-A-Ton 9.0 project. It brings product and plan setup, customer contracts, recurring billing, discounts, taxes, invoices, and payment recording into one application. It is not an official Odoo product.

## Current status

The application is under active development. The table separates features available in the browser from features available through the API.

| Area | Available now |
|---|---|
| Browser | Sign in, customer registration and password reset; Admin and Staff catalogue, tax, plan, quotation template, subscription, invoice, payment, and discount screens; finance overview; customer subscription and optional add-on management, invoice, and payment views; printable invoices. |
| API | Authentication and roles; customer directory; catalogue and plans; quotation and subscription lifecycle; discount rules; recurring invoice generation; invoice reads, confirmation, cancellation, and email delivery; payment recording and reads; finance summary. |
| Billing trigger | Admin-only **Run billing** control on the invoice screen, `POST /api/v1/billing/run`, or an optional in-process scheduler. The scheduler is disabled by default. |
| Remaining work | Verify a real hosted deployment and external SMTP provider when available. |

The main workflow is: configure a product and plan, create a customer subscription, submit and confirm its quotation, activate it, run billing when due, confirm the invoice, and record payments. Admins run billing from **Invoices & billing**. Admins and Staff can review invoices, confirm or cancel eligible invoices, record payments, search payment history, print or save an invoice as a PDF through the browser, and email a confirmed or paid invoice link when SMTP is configured. The **Overview** shows dated invoiced and received amounts plus current outstanding and overdue balances. Admins create, edit, activate, and deactivate discount rules; Staff can read active rules.

**Pricing rule:** the plan sets the recurring unit price for the subscription's first core product line. Its variant adjustment is added to that price. Other core lines and optional add-ons use catalogue or stored template prices. The agreed line prices are snapshotted on the subscription; later plan or catalogue edits do not rewrite an active contract or an issued invoice. Customers can switch optional add-ons on or off for future billing periods. Eligible discounts and taxes are applied when an invoice is generated. Existing contracts created before migration 009 keep their agreed line prices.

## Technology

- **Client:** React 19, TypeScript, Vite 8, Tailwind CSS 4, and a shared responsive design system.
- **Server:** Node.js, Express 5, TypeScript, Zod, MySQL2.
- **Database:** MySQL 8.4 with ordered SQL migrations.
- **Authentication:** MySQL-backed server sessions, HTTP-only cookies, and Argon2id password hashes.
- **Money:** decimal strings at API boundaries and integer minor units for calculations.

This is one modular application: the browser calls the versioned Express API, and the API reads and writes MySQL. During local development, Vite proxies `/api` requests to the server.

### Interface

The browser uses a forest-green and lime visual system across sign-in, registration, password reset, the Admin and Staff workspace, and the customer portal. The finance overview groups live subscription counts and currency-specific billing metrics. The customer portal presents subscription cards, invoice and payment history, and guidance when an account has no records. Shared navigation, form controls, tables, dialogs, status badges, and responsive layouts carry the design through the catalogue and billing screens.

The navigation uses [React Bits PillNav](https://reactbits.dev/components/pill-nav); React Bits Dither animates the sign-in visual and sits behind the Admin and customer workspaces; metric and subscription cards use React Bits SpotlightCard. Their source is included under `client/src/reactbits/`, with the upstream copyright and license notice in [client/src/reactbits/LICENSE.txt](client/src/reactbits/LICENSE.txt). Dither uses WebGL2 when available. An animated CSS pixel background takes over when WebGL2 is unavailable or its context fails; reduced-motion settings keep the background still.

## Run locally

### Prerequisites

- Node.js **26** (see [.nvmrc](.nvmrc)) and npm.
- Docker with Compose for the supplied MySQL setup, or a compatible local MySQL 8.4 instance.
- Git.

The commands below use Windows PowerShell. On macOS/Linux, use `cp` instead of `Copy-Item` and `npm` instead of `npm.cmd`.

### 1. Configure the environment and database

From the repository root:

```powershell
Copy-Item .env.example .env
```

Edit `.env` before starting anything. Set `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`, and a random `SESSION_SECRET` of at least 32 characters. Set `SEED_ADMIN_EMAIL` and a strong `SEED_ADMIN_PASSWORD` for the demo Admin account. The example values are placeholders; `.env` is ignored by Git. The same file is read by Docker Compose and the API.

```powershell
docker compose up -d mysql
```

If using an existing MySQL server, create the database and application user named in `.env` and skip the Compose command.

### 2. Install dependencies, migrate, and seed

```powershell
Set-Location server
npm.cmd ci
npm.cmd run migrate
npm.cmd run seed
```

`migrate` applies pending files in `server/migrations/` and records them in `schema_migrations`. Migration 008 stores the billing anniversary day. Migration 009 marks optional subscription and template lines and stores whether each subscription add-on is enabled. Existing lines remain enabled. `seed` creates or updates the Admin account from `.env`; it does not create a full demo dataset.

### 3. Start the API and browser

In the server terminal:

```powershell
npm.cmd run dev
```

In a second terminal, from the repository root:

```powershell
Set-Location client
npm.cmd ci
npm.cmd run dev
```

Open **http://localhost:5173**. The API listens on **http://localhost:4000**. A ready database should make **http://localhost:4000/api/v1/health** return `data.status: "ready"`; it returns HTTP 503 when the database is unavailable.

For a compiled API run, execute `npm.cmd run build` and then `npm.cmd run start` from `server/`. The client production bundle is created with `npm.cmd run build` from `client/`. A public deployment still needs HTTPS, a reverse proxy for `/api`, persistent MySQL, and environment-specific configuration.

## Roles and workflow

| Role | Main access |
|---|---|
| Admin | Configure products, variants, taxes, and plans; manage users; run billing; manage subscriptions and finance records; view the finance overview. |
| Staff | Read catalogue configuration and active discounts; create and edit quotation templates and subscriptions; review, confirm, or cancel eligible invoices, email issued invoice links, record payments, and view the finance overview. |
| Customer | Register and sign in; see their own subscriptions, switch optional add-ons, pause, resume, close, or request renewal when the plan permits; view issued invoices and payments; print or save invoices as PDF. |

Subscriptions follow **Draft → Quotation → Confirmed → Active**. Active subscriptions may be paused, resumed, closed, or renewed according to plan policy. Invoice generation snapshots line prices, tax, and any eligible discount. A unique database key prevents duplicate invoices for the same subscription period. Payments can cover part or all of a confirmed invoice; overpayments are rejected.

The optional scheduler uses `BILLING_RUN_INTERVAL_MINUTES` in `.env`. A positive value starts periodic runs after the configured interval. Leave it blank or set it to `0` to use only the Admin API trigger. A dedicated local API run verified that the scheduler created an invoice on its first tick with a system audit event; a hosted scheduler has not been verified.

Monthly and yearly billing keeps the contract's anniversary day when a shorter month forces a temporary earlier date. Pausing and resuming a subscription shifts its next due date and sets a new anniversary day from that shifted date.

### Billing in the browser

1. Sign in as Admin. In **Plans**, set the billing interval and recurring price. In **Products & variants**, set sale prices and variant adjustments. Create a quotation template or product lines for the subscription; mark optional lines as **Add-on**. Keep at least one core line.
2. In **Subscriptions**, complete the quotation and activate the subscription. The first core line uses the plan price plus its variant adjustment. Add-ons use their catalogue or template price. The resulting agreed line prices are the recurring billing basis.
3. Optionally create a rule in **Discounts**. Choose a fixed amount or percentage, a whole subscription or selected products, and any minimums, date window, or usage limit. Only Admins can change rules.
4. When an active subscription is due, open **Invoices & billing** and select **Run billing** as Admin. The screen reports how many subscriptions were scanned, invoiced, skipped, closed, or failed. Billing also runs automatically if the optional scheduler is enabled.
5. Filter and open an invoice to review its line, discount, tax, total, payment, and outstanding-balance snapshots. Confirm a draft invoice before collecting payment or emailing it. Eligible draft or unpaid confirmed invoices can be cancelled. Select **Print / save PDF** to use the browser's print dialog; **Email customer** sends a link to the customer's own portal invoice when SMTP is configured.
6. Record a partial or full payment on a confirmed invoice. Use **Payments** for history and a link back to the invoice. The server rejects overpayments and updates the invoice to paid when its balance reaches zero. Customers see invoices that were confirmed and their payment history in **My portal**; draft invoices, including those cancelled before confirmation, stay hidden from them. In **My subscriptions**, customers can manage their own add-ons and permitted lifecycle actions. Switching an add-on affects the next invoice and leaves older invoices unchanged. A renewal request creates a linked draft for the team to confirm and activate.
7. Use **Overview** to choose an issue/payment date range. Invoiced totals include confirmed and paid invoices issued in that range; cash received includes successful payments in that range. Outstanding and overdue are current balances across all confirmed or paid invoices, and active subscriptions are a current count. Money is grouped by currency rather than summed across currencies.

Billing is repeat-safe for an already invoiced subscription period. The browser's **Run billing** button affects every currently due subscription, so review the reported failures and server log after a run.

Password reset uses SMTP when configured. In local development without SMTP, the reset link is logged by the server and returned to the browser as a development link. In production without SMTP, the API does not log or return the reset token.

Invoice email requires `SMTP_HOST` and a suitable `MAIL_FROM` in `.env`. Without SMTP, the **Email customer** action returns an error and does not log invoice data. It sends a portal link, without a PDF attachment. Customers must sign in to open the link; the API checks invoice ownership. Local SMTP capture checks verify both invoice and password reset messages. Delivery through an external provider still needs checking with deployment credentials.

### Prepare local demo records

With the API and database running, run `npm.cmd run seed:demo` from `server/`. This creates two fictional customers, a Staff account, a product and variant, monthly and weekly plans, a quotation template, tax and discount, partially and fully paid invoices, and an active subscription ready for the Admin **Run billing** action. The two customers let you demonstrate that each sees only their own records. The script writes generated sign-in details and record IDs to the Git-ignored `demo-credentials.txt` at the repository root. Use a local demo database; each run creates another dataset.

For a full automated rehearsal, keep the API and Vite running, install Microsoft Edge, and run `npm.cmd run rehearse:demo` from `server/`. It seeds a dataset, runs the browser through billing twice, invoice confirmation, partial and full payments, an overpayment error, dashboard views, two customer accounts, and 390 px and 320 px layouts. It then seeds a fresh dataset so the credentials file points to an active subscription still ready for the live demo. The Admin **Run billing** action affects every due subscription in the database; use a local demo database.

## Checks

With the server and database running, run the API acceptance scripts from `server/`:

```powershell
npm.cmd run test:auth
npm.cmd run test:catalogue
npm.cmd run test:subscriptions
npm.cmd run test:billing
npm.cmd run test:concurrency
npm.cmd run test:scheduler
```

The API acceptance scripts create test records in the configured database, so use a local test or demo database. `test:subscriptions` covers customer ownership, plan pricing, add-on controls, and lifecycle policy. `test:billing` verifies that switching off an add-on removes it from the next invoice while the previous invoice remains unchanged. `test:concurrency` runs overlapping billing and payment requests and checks invoice/payment rows in MySQL. `test:scheduler` starts a separate API with a one-minute billing interval and waits for its invoice and system audit event. `test:finance:unit`, `test:billing:unit`, and `test:email:unit` run without a database after building the server. The email checks capture invoice and reset messages in a local SMTP server and ensure production does not expose reset tokens without SMTP.

The checks below do not require the running API:

```powershell
# From server/
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:finance:unit
npm.cmd run test:billing:unit
npm.cmd run test:email:unit

# From client/
npm.cmd run test:api
npm.cmd run lint
npm.cmd run build
```

For the browser workflow check, keep the API and Vite running and install Microsoft Edge on the test machine. From `client/`, run `npm.cmd run test:e2e`. This Playwright check exercises Admin, Customer, and Staff views, customer add-on and pause controls, and a rendered invoice PDF. It creates test records in the local database. Run `npm.cmd run test:performance` from `server/` to measure finance summary and paginated subscription, invoice, and payment lists with 3,000 temporary subscriptions and invoices; the script deletes its fixture after the run. These are local checks, not production load results.

To check a production-like setup locally, run `npm.cmd run test:deployment` from `server/`. It requires OpenSSL (or `OPENSSL_BIN`), Microsoft Edge, MySQL, and the installed dependencies. The script builds both apps, checks migrations 008 and 009, starts a production-mode API and browser bundle behind a temporary HTTPS reverse proxy, then tests health, CORS, Secure session cookies, browser billing and customer controls, PDF output, and invoice delivery to a local SMTP capture server. It removes the temporary certificate after the run. No hosted environment or external SMTP provider is configured here, so this check does not establish their behaviour.

The [changelog](docs/CHANGELOG.md) records verification evidence and remaining gaps. Live API acceptance scripts need a running MySQL server and API.

## Repository map

| Path | Contents |
|---|---|
| `client/src/pages/` | Role-specific React pages. |
| `client/src/ui/` | Shared app shell, brand, controls, dialogs, and empty states. |
| `client/src/reactbits/` | React Bits component source and its license notice. |
| `client/src/lib/api.ts` | Shared browser API client and response handling. |
| `server/src/modules/` | API routes, schemas, and business services. |
| `server/src/jobs/` | Optional billing scheduler. |
| `server/migrations/` | Ordered MySQL schema changes. |
| `server/scripts/` | Migration, seed, acceptance, SMTP capture, and performance scripts. |
| `docs/CHANGELOG.md` | Tracked record of implementation changes, checks, and open gaps. |

## Documentation in Git

Git tracks this README and [docs/CHANGELOG.md](docs/CHANGELOG.md).
