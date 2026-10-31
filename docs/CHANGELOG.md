# Changelog

> **Documentation update rule:** After every completed implementation step, update this file before beginning the next step. Change only information verified against the current code, database, tests, or running UI. Record the date, step completed, resulting behaviour, and any deviation or unresolved issue. Update `CHANGELOG.md` at the same time. Never mark an unimplemented or untested item as complete.

All notable project, documentation, and implementation changes should be recorded here. Keep entries newest first. This changelog tracks verified work; planned or unimplemented features belong in `IMPLEMENTATION_PLAN.md`, not as completed entries here.

## [Unreleased]

### Added

- Initial documentation pack for the **Subscriptions** project.
- Requirements, workflows, architecture, data model, API contract, security/access, billing/finance, UI/UX, implementation roadmap, test plan, development guide, and deployment/demo guide.
- Earlier detailed development blueprint included as `DEVELOPMENT_BLUEPRINT.md`, with a documentation-maintenance note added before the original content.

### Notes

- This entry records documentation creation only. It does not claim that application code, database migrations, API endpoints, or UI features are implemented.
- Functional requirements are based on the supplied `Subscription_Management_System.pdf`. Project decisions and recommended defaults are labelled in the relevant documents.

### Changed — 2026-10-31

- Repository layout aligned with the documented convention: `README.md` moved to the repository root and the documentation pack moved from `Subscriptions_Project_Documentation/` to `docs/`. `DOCS_MANIFEST.md` and the README convention section updated to match.
- `.gitignore` no longer excludes the documentation Markdown files. The pack is version-controlled so documentation updates can accompany implementation commits, as the documentation update rule and the implementation Definition of Done require.

### Fixed — 2026-10-31

- `DEVELOPMENT_GUIDE.md`: corrected a code fence that closed with four backticks while the opening fence used three.
- `API_CONTRACT.md`: clarified that Admin-only access for `POST /billing/run` is the recommended base policy and that Staff billing access may only be added by a recorded decision.

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
