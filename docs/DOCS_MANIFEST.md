# Documentation Pack Manifest

> **Documentation update rule:** After every completed implementation step, update this file before beginning the next step. Change only information verified against the current code, database, tests, or running UI. Record the date, step completed, resulting behaviour, and any deviation or unresolved issue. Update `CHANGELOG.md` at the same time. Never mark an unimplemented or untested item as complete.

## Included files

The project README (`README.md`) is kept at the repository root; every other file in this table lives in `docs/`.

| File | Purpose |
|---|---|
| `README.md` | Project overview, reading order, source hierarchy, and project identity. |
| `REQUIREMENTS.md` | Challenge requirements and acceptance criteria. |
| `BUSINESS_WORKFLOWS.md` | Subscription, quotation, billing, invoice, payment, pause, close, and renewal flows. |
| `ARCHITECTURE.md` | Technology stack, component flow, and repository structure. |
| `DATA_MODEL.md` | Database entities, relationships, constraints, and migration guidance. |
| `API_CONTRACT.md` | REST route map, response conventions, validation, and access expectations. |
| `SECURITY_AND_ACCESS.md` | Authentication, roles, ownership, password reset, and security tests. |
| `BILLING_AND_FINANCE.md` | Money, taxes, discounts, recurring billing, payments, and metrics. |
| `UI_UX_SPEC.md` | Screens, role navigation, reusable components, and interaction rules. |
| `IMPLEMENTATION_PLAN.md` | Build order, definitions of done, checklists, and step log template. |
| `TEST_PLAN.md` | Unit, integration, end-to-end, security, and performance test cases. |
| `DEVELOPMENT_GUIDE.md` | Local setup, environment variables, migrations, run commands, and troubleshooting. |
| `DEPLOYMENT_AND_DEMO.md` | Deployment checks, demo data, demo sequence, and handoff. |
| `DEVELOPMENT_BLUEPRINT.md` | Earlier 22-section detailed development blueprint, preserved with a maintenance note. |
| `CHANGELOG.md` | Dated record of verified documentation and implementation changes. |

## Suggested reading order

Start with `README.md`, then read `REQUIREMENTS.md`, `BUSINESS_WORKFLOWS.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, and `BILLING_AND_FINANCE.md`. Continue with security, API, UI, roadmap, tests, development, and demo. Use the earlier blueprint as a deep reference while coding.
