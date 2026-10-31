# Subscriptions — Project Documentation

> **Documentation update rule:** After every completed implementation step, update the project documentation under `docs/` before beginning the next step. Change only information verified against the current code, database, tests, or running UI. Record the date, step completed, resulting behaviour, any deviation or unresolved issue, and update the changelog. Never mark an unimplemented or untested item as complete.

## Project summary

**Subscriptions** is a subscription and recurring-revenue management application being built for the Make-A-Ton 9.0 problem statement for the fictional company Brightloop Software. It is intended to bring product and plan configuration, customer subscriptions, recurring invoices, discounts, taxes, payments, and finance reporting into one system.

**Product subtitle:** Subscription & Recurring Revenue Management  
**Tagline:** Every subscription. Every cycle. Under control.

This is an independent hackathon implementation. It is not an official Odoo product or an Odoo-branded application.

## Start here

The documentation pack in `docs/` should be read in this order when you are new to the project:

1. Requirements and acceptance criteria — what the challenge explicitly asks for.
2. Business workflows — how a customer, subscription, invoice, and payment move through the system.
3. Architecture — how the browser, API, backend services, and database connect.
4. Data model — the entities and relationships that store the business data.
5. Billing and finance — recurring billing, invoices, taxes, discounts, payments, and reporting rules.
6. Security and access — authentication, roles, and customer data boundaries.
7. API contract and UI/UX specification — how the frontend and backend communicate and what each user sees.
8. Implementation plan — the recommended build order and completion criteria.
9. Test plan — how to verify the implementation.
10. Development guide and deployment/demo guide — how to run, configure, and demonstrate it.
11. The detailed development blueprint — setup commands, code patterns, and extended guidance.

## Source of truth and decision hierarchy

Use this order when documents or code disagree:

1. The supplied `Subscription_Management_System.pdf` is the source for the challenge's functional requirements. It is not bundled here because this ZIP contains Markdown documentation.
2. A later, explicit decision recorded in this documentation and the changelog controls implementation choices that the challenge does not specify.
3. The code, migrations, and tests describe what is currently implemented. Documentation must be brought into line with verified code after each implementation step.
4. The detailed development blueprint is the earlier reference. Its suggestions are not automatically organizer requirements.

Keep requirements separate from recommended design decisions. Where the challenge leaves behaviour unspecified, document the choice as a project decision rather than presenting it as a mandatory challenge rule.

## Recommended technology baseline

- Frontend: React, TypeScript, Vite, Tailwind CSS.
- Backend: Node.js, Express, TypeScript.
- Database: MySQL 8.4 with InnoDB.
- Data access: `mysql2/promise`, parameterized SQL, and a shared connection pool.
- Validation: Zod at API boundaries, with database constraints for critical invariants.
- Authentication: server-side sessions with secure HTTP-only cookies; Argon2id password hashes.
- Architecture: one modular monolith, not microservices.

Use the exact installed runtime and package versions in the repository's lockfiles. Check current official documentation if setup commands or major versions have changed.

## Core end-to-end outcome

The main demonstrable flow should work without manually editing database rows:

```text
Admin creates product and plan
          ↓
Customer account is registered / created
          ↓
Subscription is drafted and confirmed
          ↓
Subscription becomes active and reaches a billing date
          ↓
Billing service creates one invoice for that period
          ↓
Tax and eligible discount are calculated
          ↓
Staff records payment against the invoice
          ↓
Invoice balance and finance dashboard update
```

## Project status

This documentation package is an initial planning baseline. It does **not** mean that the application features have already been implemented. Keep the checklists in the implementation plan and the test plan accurate as development progresses.

Implementation progress so far: the local infrastructure (Node LTS, MySQL 8.4 via Docker Compose, Express + TypeScript skeleton, migration runner, health endpoint), authentication with three roles (register/login/logout, admin-managed staff, password reset), the catalogue (products with price-adjusted variants and computed effective prices, tax rules, subscription plans with availability windows and lifecycle flags) with its admin screens, the quotation/subscription backend (templates with snapshot prices, unique subscription numbers, guarded Draft → Quotation → Confirmed → Active → Paused/Closed lifecycle with audit events, tax-aware totals), and the corresponding staff screens (quotation templates, subscription management with the full lifecycle action bar, a customer directory for staff, and the customer portal's own-subscriptions view) are implemented and verified by automated suites plus API smoke tests. The recurring billing/invoice phase is next.

## Repository documentation convention

The README at the repository root is the only documentation file tracked in Git. All other documentation lives in a root `docs/` directory and is intentionally excluded from version control; the `.gitignore` ignores every Markdown file except this README. Keep the README a standalone overview that does not duplicate pack contents, so copies cannot drift apart.
