# Subscriptions

**Subscription and recurring revenue management for the fictional Brightloop Software.**

Subscriptions is an independent Make-A-Ton 9.0 project. It brings product and plan setup, customer contracts, recurring billing, discounts, taxes, invoices, and payment recording into one application. It is not an official Odoo product.

## Current status

The application is under active development. The table separates features available in the browser from features available through the API.

| Area | Available now |
|---|---|
| Browser | Sign in, customer registration and password reset; Admin and Staff catalogue, tax, plan, quotation template, subscription, invoice, payment, and discount screens; finance overview; customer subscription, invoice, and payment views; printable invoices. |
| API | Authentication and roles; customer directory; catalogue and plans; quotation and subscription lifecycle; discount rules; recurring invoice generation; invoice reads, confirmation, cancellation, and email delivery; payment recording and reads; finance summary. |
| Billing trigger | Admin-only **Run billing** control on the invoice screen, `POST /api/v1/billing/run`, or an optional in-process scheduler. The scheduler is disabled by default. |
| Remaining work | External SMTP delivery and deployment checks, billing concurrency coverage, and any PDF email attachment required by the final submission. |

The main workflow is: configure a product and plan, create a customer subscription, submit and confirm its quotation, activate it, run billing when due, confirm the invoice, and record payments. Admins run billing from **Invoices & billing**. Admins and Staff can review invoices, confirm or cancel eligible invoices, record payments, search payment history, print or save an invoice as a PDF through the browser, and email a confirmed or paid invoice link when SMTP is configured. The **Overview** shows dated invoiced and received amounts plus current outstanding and overdue balances. Admins create, edit, activate, and deactivate discount rules; Staff can read active rules.

**Pricing rule:** a plan's `price` is a catalogue reference amount. Recurring invoice amounts come from the subscription's snapshotted product lines, followed by eligible discounts and taxes. The plan price does not add a fee or replace line prices. The plan and subscription screens label it as a reference price.

## Technology

- **Client:** React 19, TypeScript, Vite 8, Tailwind CSS 4.
- **Server:** Node.js, Express 5, TypeScript, Zod, MySQL2.
- **Database:** MySQL 8.4 with ordered SQL migrations.
- **Authentication:** MySQL-backed server sessions, HTTP-only cookies, and Argon2id password hashes.
- **Money:** decimal strings at API boundaries and integer minor units for calculations.

This is one modular application: the browser calls the versioned Express API, and the API reads and writes MySQL. During local development, Vite proxies `/api` requests to the server.

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

`migrate` applies pending files in `server/migrations/` and records them in `schema_migrations`. Migration 008 stores each subscription's billing anniversary day so a monthly contract beginning on January 31 bills on February 28 (or 29) and then returns to March 31; yearly February 29 contracts return to that date in leap years. `seed` creates or updates the Admin account from `.env`; it does not create a full demo dataset.

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
| Customer | Register and sign in; see their own subscriptions, issued invoices, invoice detail, and recorded payments in the portal; print or save their invoices as PDF. |

Subscriptions follow **Draft → Quotation → Confirmed → Active**. Active subscriptions may be paused, resumed, closed, or renewed according to plan policy. Invoice generation snapshots line prices, tax, and any eligible discount. A unique database key prevents duplicate invoices for the same subscription period. Payments can cover part or all of a confirmed invoice; overpayments are rejected.

The optional scheduler uses `BILLING_RUN_INTERVAL_MINUTES` in `.env`. A positive value starts periodic runs after the configured interval. Leave it blank or set it to `0` to use only the Admin API trigger. The scheduler has not yet been verified in a live deployment.

Monthly and yearly billing keeps the contract's anniversary day when a shorter month forces a temporary earlier date. Pausing and resuming a subscription shifts its next due date and sets a new anniversary day from that shifted date.

### Billing in the browser

1. Sign in as Admin. In **Plans**, set the billing interval and a reference price. In **Products & variants**, set sale prices. Create a quotation template or add priced product lines when creating a subscription.
2. In **Subscriptions**, complete the quotation and activate the subscription. Its line prices are the recurring billing basis.
3. Optionally create a rule in **Discounts**. Choose a fixed amount or percentage, a whole subscription or selected products, and any minimums, date window, or usage limit. Only Admins can change rules.
4. When an active subscription is due, open **Invoices & billing** and select **Run billing** as Admin. The screen reports how many subscriptions were scanned, invoiced, skipped, closed, or failed. Billing also runs automatically if the optional scheduler is enabled.
5. Filter and open an invoice to review its line, discount, tax, total, payment, and outstanding-balance snapshots. Confirm a draft invoice before collecting payment or emailing it. Eligible draft or unpaid confirmed invoices can be cancelled. Select **Print / save PDF** to use the browser's print dialog; **Email customer** sends a link to the customer's own portal invoice when SMTP is configured.
6. Record a partial or full payment on a confirmed invoice. Use **Payments** for history and a link back to the invoice. The server rejects overpayments and updates the invoice to paid when its balance reaches zero. Customers see invoices that were confirmed and their payment history in **My portal**; draft invoices, including those cancelled before confirmation, stay hidden from them.
7. Use **Overview** to choose an issue/payment date range. Invoiced totals include confirmed and paid invoices issued in that range; cash received includes successful payments in that range. Outstanding and overdue are current balances across all confirmed or paid invoices, and active subscriptions are a current count. Money is grouped by currency rather than summed across currencies.

Billing is repeat-safe for an already invoiced subscription period. The browser's **Run billing** button affects every currently due subscription, so review the reported failures and server log after a run.

Password reset uses SMTP when configured. In local development without SMTP, the reset link is logged by the server and returned to the browser as a development link.

Invoice email requires `SMTP_HOST` and a suitable `MAIL_FROM` in `.env`. Without SMTP, the **Email customer** action returns an error and does not log invoice data. It sends a portal link, without a PDF attachment. Customers must sign in to open the link; the API checks invoice ownership. The SMTP capture test verifies message content locally; delivery through a real external provider still needs checking with the deployment credentials.

### Prepare local demo records

With the API and database running, run `npm.cmd run seed:demo` from `server/`. This creates two fictional customers, a Staff account, a product and variant, monthly and weekly plans, a quotation template, tax and discount, partially and fully paid invoices, and an active subscription ready for the Admin **Run billing** action. The two customers let you demonstrate that each sees only their own records. The script writes generated sign-in details and record IDs to the Git-ignored `demo-credentials.txt` at the repository root. Use a local demo database; each run creates another dataset.

## Checks

With the server and database running, run the API acceptance scripts from `server/`:

```powershell
npm.cmd run test:auth
npm.cmd run test:catalogue
npm.cmd run test:subscriptions
npm.cmd run test:billing
```

The API acceptance scripts create test records in the configured database, so use a local test or demo database. `test:finance:unit`, `test:billing:unit`, and `test:email:unit` run without a database after building the server. The email check captures one message in a local SMTP server. The billing unit check covers interval date math; the live billing suite covers daily billing and repeated monthly/yearly periods. Concurrent billing and scheduler execution still need live checks.

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

For the browser workflow check, keep the API and Vite running and install Microsoft Edge on the test machine. From `client/`, run `npm.cmd run test:e2e`. This Playwright check exercises Admin, Customer, and Staff views, including a rendered invoice PDF. It creates test records in the local database. Run `npm.cmd run test:performance` from `server/` to measure finance summary and list responses with 1,000 temporary records; the script deletes its fixture after the run. These are local checks, not production load results.

The [changelog](docs/CHANGELOG.md) records verification evidence and remaining gaps. Live API acceptance scripts need a running MySQL server and API.

## Repository map

| Path | Contents |
|---|---|
| `client/src/pages/` | Role-specific React pages. |
| `client/src/lib/api.ts` | Shared browser API client and response handling. |
| `server/src/modules/` | API routes, schemas, and business services. |
| `server/src/jobs/` | Optional billing scheduler. |
| `server/migrations/` | Ordered MySQL schema changes. |
| `server/scripts/` | Migration, seed, acceptance, SMTP capture, and performance scripts. |
| `docs/CHANGELOG.md` | Tracked record of implementation changes, checks, and open gaps. |

## Documentation in Git

Git tracks this README and [docs/CHANGELOG.md](docs/CHANGELOG.md).
