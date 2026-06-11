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
| Lines | 78.79% |
| Statements | 78.79% |
| Functions | 78.68% |
| Branches | 75.14% |

Initial thresholds are intentionally below the current baseline:

| Metric | Current threshold |
| --- | ---: |
| Lines | 60% |
| Statements | 60% |
| Functions | 65% |
| Branches | 70% |

These thresholds prevent large regressions while leaving room to add tests around under-covered areas.

## Priority Coverage Targets

1. `src/components/VaultFormModal.tsx`: add workflow-focused component tests for remaining item categories and attachment controls.

Recently improved:

- `src/lib/importer.ts`: covered supported JSON/CSV formats, encrypted envelope detection, malformed inputs, and quote-aware CSV parsing.
- `src/lib/attachments.ts`: covered IndexedDB save/read/delete paths, bulk legacy migration, missing records, and connection cleanup behavior.
- `src/lib/sqlite_opfs.ts`: covered master setup/verification, encrypted row persistence, read-only SQL console behavior, reseed/delete/reset flows, query log subscriptions, and localStorage fallback hydration.
- `src/lib/storage.ts`: covered setup detection, no-session guards, save/delete/reseed wrappers, trash move/restore, expired trash cleanup, and full trash emptying.
- `src/components/PasswordGenerator.tsx`: covered character option changes, diceware mode settings, copy feedback, and safe clipboard clearing behavior.
- `src/lib/diceware.ts`: covered Turkish/English word selection, separator formats, capitalization, random number placement, and symbol placement.

## Next Gates

- Add smoke E2E tests for unlock, create item, lock, export, and import.
- Add mutation tests only for critical `src/lib` modules first.
- Raise global coverage thresholds after the low-coverage critical modules improve.
