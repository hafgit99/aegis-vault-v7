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
| Lines | 94.26% |
| Statements | 94.26% |
| Functions | 93.10% |
| Branches | 87.69% |

Initial thresholds are intentionally below the current baseline:

| Metric | Current threshold |
| --- | ---: |
| Lines | 60% |
| Statements | 60% |
| Functions | 65% |
| Branches | 70% |

These thresholds prevent large regressions while leaving room to add tests around under-covered areas.

## Priority Coverage Targets

1. `src/components/SettingsPanel.tsx`: reduce remaining fallback-message and desktop-runtime branch gaps.
2. `src/lib/biometric.ts` and `src/lib/encryption.ts`: raise low branch coverage around security-sensitive fallbacks.

Recently improved:

- `src/lib/importer.ts`: covered supported JSON/CSV formats, encrypted envelope detection, malformed inputs, and quote-aware CSV parsing.
- `src/lib/attachments.ts`: covered IndexedDB save/read/delete paths, bulk legacy migration, missing records, and connection cleanup behavior.
- `src/lib/sqlite_opfs.ts`: covered master setup/verification, encrypted row persistence, read-only SQL console behavior, reseed/delete/reset flows, query log subscriptions, and localStorage fallback hydration.
- `src/lib/storage.ts`: covered setup detection, no-session guards, save/delete/reseed wrappers, trash move/restore, expired trash cleanup, and full trash emptying.
- `src/components/PasswordGenerator.tsx`: covered character option changes, all character toggles, strength bar tone branches, diceware mode settings, word-count descriptions, diceware toggles, copy feedback, unmount cleanup, and safe clipboard clearing behavior.
- `src/lib/diceware.ts`: covered Turkish/English word selection, separator formats, capitalization, random number placement, and symbol placement.
- `src/components/VaultFormModal.tsx`: covered card, passkey, identity, secure note, attachment upload, oversized-file rejection, existing attachment download/removal, and non-login username normalization.
- `src/components/ProfileModal.tsx`: covered gradient detection, profile name validation, preset selection, image file validation, local image loading, save, and cancel flows.
- `src/components/ConfirmModal.tsx`: covered closed state, confirm/cancel behavior, header close, and alert-only mode.
- `src/components/SecurityAudit.tsx`: covered empty secure state, critical weak/reused groups, medium-score feedback, excellent-score feedback, metric rendering, and audit item selection.
- `src/components/SettingsPanel.tsx`: covered master password validation/update, auto-lock selection, demo reseed notification, safe destructive confirmation, biometric enable/disable/error paths, plain export fallback/error paths, and import error feedback.
- `src/components/LockScreen.tsx`: covered setup mismatch, password visibility toggles, manual unlock, biometric unsupported/success/integrity/permission-error paths, and auto-triggered biometric unlock.
- `src/components/VaultFormModal.tsx`: covered edit-save identity preservation, title validation, password visibility/autogeneration, selected file removal, attachment upload failures, existing attachment removal before save, and download error notifications.
- `src/components/CardDetail.tsx`: covered copied states, PIN copy action, missing-field fallbacks, and empty-string copy behavior.
- `src/components/LoginDetail.tsx`: covered copied states, empty-password fallback, and safe empty-password copy behavior.
- `src/components/PasskeyDetail.tsx`: covered copied states, missing-field fallbacks, and safe empty-string copy behavior.
- `src/components/IdentityDetail.tsx`: covered copied states, male gender label, missing-field fallbacks, and safe empty-name copy behavior.
- `src/components/SecureNoteDetail.tsx`: covered copied state, empty-note fallback, and safe empty-note copy behavior.
- `src/components/VaultItemAttachmentCard.tsx`: covered missing-size fallback for encrypted attachment metadata.
- `src/components/VaultItemDetailHeader.tsx`: covered known-platform logo rendering and copied export state.
- `src/components/VaultListItem.tsx`: covered known-platform logo rendering and missing-password strength fallback.
- `src/components/RecentVaultItem.tsx`: covered known-platform logo rendering, username copied state, and missing-password copy fallback.
- `src/components/VaultWorkspace.tsx`: covered favorite filter active state, empty filtered-list fallback, dashboard quick actions, and profile action forwarding.
- `src/components/SettingsPanel.tsx`: covered biometric missing-session, WebAuthn permission, and disable-error paths plus encrypted export guards, file-picker error handling, drag-state styling, and encrypted import cancellation.
- `src/components/VaultFormModal.tsx`: covered drag-and-drop attachment selection and selected-file removal behavior when the hidden input has already unmounted.
- `src/components/SecurityAudit.tsx`: covered missing-password audit classification so empty credentials are weak, non-reused, non-secure, and selectable.
- `src/components/ProfileModal.tsx`: covered file-reader failures, empty file selections, fallback avatar initials, and upload button forwarding so the modal now reports full component coverage.
- `src/components/SettingsPanel.tsx`: covered destructive reset confirmation, drag-and-drop JSON import, desktop import cancellation, decrypt-password validation, malformed decrypted backups, and encrypted export failures.
- `src/components/VaultFormModal.tsx`: covered legacy edit payloads with missing fields and missing attachment metadata. The remaining selected-file input reset branch is intentionally defensive because the file input is unmounted when a selected file is displayed.
- `src/lib/clipboard.ts`: covered unavailable clipboard APIs, rejected writes, empty expected text, missing clear methods, read failures, and clear-write failures so clipboard helpers now report full coverage.

## Next Gates

- Add smoke E2E tests for unlock, create item, lock, export, and import.
- Add mutation tests only for critical `src/lib` modules first.
- Raise global coverage thresholds after the low-coverage critical modules improve.
