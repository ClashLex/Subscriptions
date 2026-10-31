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

The documentation pack contains both the original plan and dated implementation notes. Check the current code and test results before treating a planned feature as complete.

Implementation progress so far: local infrastructure, authentication and roles, catalogue and plans, quotation/subscription backend and staff screens, and the customer subscription portal are implemented. The Phase 5 billing API includes an Admin-only run trigger, discount rules, recurring invoice generation with transactional snapshots, invoice confirmation/cancellation, customer-scoped invoice reads, and atomic payment recording with partial/full balance handling. An optional automatic billing runner (`BILLING_RUN_INTERVAL_MINUTES`, off unless set) reuses the same billing service as the Admin trigger. The client now includes password-reset pages and a verified paginated-list response helper. The billing/invoice UI, invoice email/print, and finance dashboard remain to be implemented. API acceptance suites were previously recorded as passing; they require a running MySQL and API service to re-run.

## Repository documentation convention

The root README and the `docs/` documentation pack are tracked in Git. Update the relevant document and `docs/CHANGELOG.md` when behavior changes. Keep the README a short overview and use the pack for detailed requirements, decisions, and test evidence.
