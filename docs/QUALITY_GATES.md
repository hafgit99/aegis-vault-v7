# Quality Gates

This document tracks the automated test gates for Aegis Vault 7. The goal is to raise confidence in small, measurable steps without making early development brittle.

## Current Unit Coverage Baseline

Baseline captured with:

```bash
npm run test:coverage
```

Current measured baseline:

| Metric | Baseline |
| --- | ---: |
| Lines | 70.86% |
| Statements | 70.86% |
| Functions | 72.83% |
| Branches | 74.82% |

Initial thresholds are intentionally below the current baseline:

| Metric | Current threshold |
| --- | ---: |
| Lines | 60% |
| Statements | 60% |
| Functions | 65% |
| Branches | 70% |

These thresholds prevent large regressions while leaving room to add tests around under-covered areas.

## Priority Coverage Targets

1. `src/lib/sqlite_opfs.ts`: currently under-tested because persistence behavior is mostly exercised through higher-level storage tests.
2. `src/lib/storage.ts`: add coverage for trash, reseed, and item lifecycle wrappers.
3. `src/components/VaultFormModal.tsx` and `src/components/PasswordGenerator.tsx`: add workflow-focused component tests.

Recently improved:

- `src/lib/importer.ts`: covered supported JSON/CSV formats, encrypted envelope detection, malformed inputs, and quote-aware CSV parsing.
- `src/lib/attachments.ts`: covered IndexedDB save/read/delete paths, bulk legacy migration, missing records, and connection cleanup behavior.

## Next Gates

- Add smoke E2E tests for unlock, create item, lock, export, and import.
- Add mutation tests only for critical `src/lib` modules first.
- Raise global coverage thresholds after the low-coverage critical modules improve.
