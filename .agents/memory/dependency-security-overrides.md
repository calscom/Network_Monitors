---
name: Dependency security overrides
description: Rationale for targeted security overrides when latest parent libraries pin vulnerable transitive dependencies.
---

Prefer narrow, compatibility-tested overrides when the latest parent library pins a vulnerable transitive dependency. Do not blindly accept an audit fix that downgrades a parent library.

**Why:** npm's suggested remediation for the typography selector parser and spreadsheet dependency chains can downgrade parent libraries rather than preserve current behavior. A scoped selector-parser patch passed both the production CSS build and the typography selector utility smoke test.

**How to apply:** Review the latest parent's dependency constraints, restrict overrides to the affected parent or dependency major, and exercise the API the parent actually uses. Reassess and remove overrides once an upstream release resolves the advisory. A passing build alone is not sufficient for unrelated spreadsheet-import changes.

For ExcelJS, retain the patched CommonJS-compatible UUID line rather than blindly selecting an ESM-only latest release.

**Why:** ExcelJS loads UUID through CommonJS, and the application needs spreadsheet imports to keep working across its supported runtimes. An audit fix need not also introduce a module-system migration.

**How to apply:** Test spreadsheet round-trips, the extended conditional-formatting path that generates UUIDs, and the frontend distribution. Overrides affect installed dependencies, not dependencies embedded in a library's prebuilt browser bundle; zero npm audit findings is not a guarantee that all embedded code has been replaced.
