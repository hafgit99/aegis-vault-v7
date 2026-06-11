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
| Lines | 92.43% |
| Statements | 92.43% |
| Functions | 88.06% |
| Branches | 79.97% |

Initial thresholds are intentionally below the current baseline:

| Metric | Current threshold |
| --- | ---: |
| Lines | 60% |
| Statements | 60% |
| Functions | 65% |
| Branches | 70% |

These thresholds prevent large regressions while leaving room to add tests around under-covered areas.

## Priority Coverage Targets

1. `src/components/PasswordGenerator.tsx`: add uncovered diceware/password mode edge cases.
2. `src/components/VaultFormModal.tsx`: add remaining edit/reset and conditional-field branch coverage.

Recently improved:

- `src/lib/importer.ts`: covered supported JSON/CSV formats, encrypted envelope detection, malformed inputs, and quote-aware CSV parsing.
- `src/lib/attachments.ts`: covered IndexedDB save/read/delete paths, bulk legacy migration, missing records, and connection cleanup behavior.
- `src/lib/sqlite_opfs.ts`: covered master setup/verification, encrypted row persistence, read-only SQL console behavior, reseed/delete/reset flows, query log subscriptions, and localStorage fallback hydration.
- `src/lib/storage.ts`: covered setup detection, no-session guards, save/delete/reseed wrappers, trash move/restore, expired trash cleanup, and full trash emptying.
- `src/components/PasswordGenerator.tsx`: covered character option changes, diceware mode settings, copy feedback, and safe clipboard clearing behavior.
- `src/lib/diceware.ts`: covered Turkish/English word selection, separator formats, capitalization, random number placement, and symbol placement.
- `src/components/VaultFormModal.tsx`: covered card, passkey, identity, secure note, attachment upload, oversized-file rejection, existing attachment download/removal, and non-login username normalization.
- `src/components/ProfileModal.tsx`: covered gradient detection, profile name validation, preset selection, image file validation, local image loading, save, and cancel flows.
- `src/components/ConfirmModal.tsx`: covered closed state, confirm/cancel behavior, header close, and alert-only mode.
- `src/components/SecurityAudit.tsx`: covered empty secure state, critical weak/reused groups, medium-score feedback, excellent-score feedback, metric rendering, and audit item selection.
- `src/components/SettingsPanel.tsx`: covered master password validation/update, auto-lock selection, demo reseed notification, safe destructive confirmation, biometric enable/disable/error paths, plain export fallback/error paths, and import error feedback.
- `src/components/LockScreen.tsx`: covered setup mismatch, password visibility toggles, manual unlock, biometric unsupported/success/integrity/permission-error paths, and auto-triggered biometric unlock.

## Next Gates

- Add smoke E2E tests for unlock, create item, lock, export, and import.
- Add mutation tests only for critical `src/lib` modules first.
- Raise global coverage thresholds after the low-coverage critical modules improve.
