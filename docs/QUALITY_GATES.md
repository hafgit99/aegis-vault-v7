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
| Lines | 96.04% |
| Statements | 96.04% |
| Functions | 93.43% |
| Branches | 90.27% |

Coverage thresholds now act as a release-quality regression gate while staying slightly below the current baseline:

| Metric | Current threshold |
| --- | ---: |
| Lines | 90% |
| Statements | 90% |
| Functions | 85% |
| Branches | 80% |

These thresholds prevent meaningful regressions while leaving room to add tests around under-covered areas.

## Priority Coverage Targets

1. `src/components/SettingsPanel.tsx`: reduce remaining fallback-message and desktop-runtime branch gaps.

## Current Mutation Gate

The first practical mutation gate runs against critical library helpers with:

```bash
npm run test:mutation:core:dry
npm run test:mutation:core
```

Current mutation scope:

- `src/lib/diceware.ts`
- `src/lib/emergencyKit.ts`
- `src/lib/otp.ts`
- `src/lib/random.ts`
- `src/lib/secretKey.ts`

Current measured mutation baseline:

| Metric | Baseline |
| --- | ---: |
| Mutants | 460 |
| Mutation score | 81.74% |
| Covered mutation score | 82.46% |
| Killed | 371 |
| Timed out | 5 |
| Survived | 80 |
| No coverage | 4 |

Mutation thresholds:

| Threshold | Current value |
| --- | ---: |
| High | 80% |
| Low | 70% |
| Break | 65% |

The Diceware word lists live in `src/lib/dicewareWords.ts` and the TOTP HMAC/SHA primitives live in `src/lib/otpCrypto.ts`, so mutation testing focuses on user-visible passphrase and TOTP behavior instead of static vocabulary or hash constant tables.

## Dedicated Importer Mutation Gate

The universal import parser has its own mutation gate because adding it to the core gate increases the dry-run scope substantially. The gate focuses on import format detection and vault-item normalization; CSV parsing, default labels, and binary file decoding live in separate helper modules so the parser and decoder logic can be measured independently.

Run it with:

```bash
npm run test:mutation:importer:dry
npm run test:mutation:importer
```

Current mutation scope:

- `src/lib/importer.ts`

Current measured importer mutation baseline:

| Metric | Baseline |
| --- | ---: |
| Mutants | 682 |
| Mutation score | 80.35% |
| Covered mutation score | 83.28% |
| Killed | 548 |
| Timed out | 0 |
| Survived | 110 |
| No coverage | 24 |

## Importer Helper Mutation Gate

CSV parsing and file decoding now have a dedicated mutation gate because malformed backup files are user-facing import boundaries. This keeps helper behavior visible without hiding parser/decoder survivors inside the larger importer score.

Run it with:

```bash
npm run test:mutation:importer:helpers:dry
npm run test:mutation:importer:helpers
```

Current mutation scope:

- `src/lib/csvParser.ts`
- `src/lib/fileDecoder.ts`

Current measured importer helper mutation baseline:

| Metric | Baseline |
| --- | ---: |
| Mutants | 288 |
| Mutation score | 87.85% |
| Covered mutation score | 88.15% |
| Killed | 249 |
| Timed out | 4 |
| Survived | 34 |
| No coverage | 1 |

File scores:

| File | Mutation score |
| --- | ---: |
| `src/lib/csvParser.ts` | 87.56% |
| `src/lib/fileDecoder.ts` | 88.42% |

`src/lib/csvParser.ts` now exceeds the 80% target after the parser was hardened to treat quotes as structural only at field boundaries and preserve malformed quote data literally. `src/lib/fileDecoder.ts` now exceeds the 85% target after BOM marker, invalid post-BOM byte, and UTF-16 heuristic threshold boundaries were covered.

Importer helper mutation thresholds:

| Level | Threshold |
| --- | ---: |
| High | 90% |
| Low | 87% |
| Break | 85% |

## Storage Bridge Mutation Gate

Native persistence and Android secure-storage bridges have a dedicated mutation gate. Vault session/storage orchestration has its own separate gate so bridge failures and session/data-loss behavior can be measured independently.

Run it with:

```bash
npm run test:mutation:storage:dry
npm run test:mutation:storage
```

Current mutation scope:

- `src/lib/desktopStorage.ts`
- `src/lib/secureStorage.ts`

Current measured storage bridge mutation baseline:

| Metric | Baseline |
| --- | ---: |
| Mutants | 131 |
| Mutation score | 90.84% |
| Covered mutation score | 92.97% |
| Killed | 119 |
| Timed out | 0 |
| Survived | 9 |
| No coverage | 3 |

File scores:

| File | Mutation score |
| --- | ---: |
| `src/lib/desktopStorage.ts` | 91.46% |
| `src/lib/secureStorage.ts` | 89.80% |

## Storage Orchestration Mutation Gate

Vault session orchestration has a dedicated mutation gate because it protects setup/unlock, Secret Key routing, master-password rotation, trash retention, reset cleanup, and bulk-save paths that can otherwise cause silent data-loss or session-integrity regressions.

Run it with:

```bash
npm run test:mutation:storage:orchestration:dry
npm run test:mutation:storage:orchestration
```

Current mutation scope:

- `src/lib/storage.ts`

Current measured storage orchestration mutation baseline:

| Metric | Baseline |
| --- | ---: |
| Mutants | 242 |
| Mutation score | 88.43% |
| Covered mutation score | 88.43% |
| Killed | 214 |
| Timed out | 0 |
| Survived | 28 |
| No coverage | 0 |

## Current E2E Smoke Gate

The first Playwright smoke gate runs with:

```bash
npm run test:e2e:chromium
```

Current smoke scope:

- Initial vault setup.
- Create and save a login item.
- Verify the saved item appears in the vault list.
- Lock the vault.
- Unlock with the same master password.
- Verify the saved item is still available after unlock.
- Move a saved item to trash.
- Restore the trash item back to the vault.
- Mark a saved item as favorite and verify the favorites filter.
- Filter vault items by search query and clear the search.
- Show and clear the vault empty state when search has no matches.
- Navigate across vault, audit, generator, settings, and trash workspaces.
- Switch the interface language between English and Chinese from Settings.
- Export an encrypted `.aegis` backup download.
- Import a plain JSON backup file and verify the imported item appears in the vault.
- Import an encrypted `.aegis` backup file with the master password and verify the imported item appears in the vault.
- Reject encrypted `.aegis` import when the backup password is wrong.
- Cancel encrypted `.aegis` import before decrypting.

Recently improved:

- Localization audit: verified production code outside `src/i18n/translations.ts` no longer contains Turkish user-facing literals, with biometric/backup/legacy crypto errors represented by stable codes.
- Production build: covered Vite manual vendor chunking so the app, vendor, and Argon2 bundles stay below the 500 kB warning threshold.
- `src/lib/importer.ts`: covered supported JSON/CSV formats, encrypted envelope detection, malformed inputs, vault-item normalization, and parser/decoder delegation through focused helper modules.
- `src/lib/csvParser.ts` and `src/lib/fileDecoder.ts`: added direct helper tests and a dedicated importer helper mutation gate; CSV parsing now reports 84.46%, file decoding reports 87.37%, and the combined helper gate reports 85.42%.
- `src/lib/attachments.ts`: covered IndexedDB save/read/delete paths, bulk legacy migration, missing records, and connection cleanup behavior.
- `src/lib/sqlite_opfs.ts`: covered master setup/verification, encrypted row persistence, desktop payload hydration, OPFS file hydration, missing OPFS file initialization, OPFS write failures, desktop read fallback, legacy localStorage migration, read-only SQL console behavior, row update/defaults, reseed/delete/reset flows, query log subscriptions, localStorage fallback hydration, and missing-key decryption guards.
- `src/lib/storage.ts`: covered setup detection, Secret Key profile fallbacks, remembered-key migration/forget flows, failed unlock session guards, master-password rotation rollback rules, reset marker cleanup, no-session guards, save/delete/reseed wrappers, trash move/restore, retention-boundary cleanup, bulk-save progress callbacks, and full trash emptying.
- `src/components/PasswordGenerator.tsx`: covered character option changes, all character toggles, strength bar tone branches, diceware mode settings, word-count descriptions, diceware toggles, copy feedback, unmount cleanup, and safe clipboard clearing behavior.
- `src/lib/diceware.ts`: covered Turkish/English word selection, EFF-sized word-pool expansion, separator formats, capitalization, number and symbol placement, camel/none separator handling, optional entropy calculations, and static word-list separation for practical mutation testing.
- `src/components/VaultFormModal.tsx`: covered card, passkey, identity, secure note, attachment upload, oversized-file rejection, existing attachment download/removal, and non-login username normalization.
- `src/components/ProfileModal.tsx`: covered gradient detection, profile name validation, preset selection, image file validation, local image loading, save, and cancel flows.
- `src/components/ConfirmModal.tsx`: covered closed state, confirm/cancel behavior, header close, and alert-only mode.
- `src/components/SecurityAudit.tsx`: covered empty secure state, critical weak/reused groups, medium-score feedback, excellent-score feedback, metric rendering, and audit item selection.
- `src/components/SettingsPanel.tsx`: covered master password validation/update, auto-lock selection, demo reseed notification, safe destructive confirmation, biometric enable/disable/error paths, plain export fallback/error paths, and import error feedback.
- `src/components/LockScreen.tsx`: covered setup mismatch, password visibility toggles, manual unlock, biometric unsupported/success/integrity/permission-error paths, auto-triggered biometric unlock, and Emergency Kit save routing.
- `src/lib/emergencyKit.ts`: covered Secret Key validation, kit contents, native save-dialog success, native cancellation without hidden browser fallback, web browser-download fallback, and native save-error propagation.
- `src/lib/diceware.ts`: reached full statement, branch, function, and line coverage for Diceware passphrase generation.
- `src/components/LockScreen.tsx` and `src/components/DashboardHeader.tsx`: covered selected-language rendering for the expanded Turkish, English, and Chinese i18n surface.
- `src/components/VaultWorkspace.tsx` and `src/components/FloatingVaultAction.tsx`: covered selected-language rendering for vault list controls and new-item actions.
- Dashboard summary components: covered selected-language rendering for quick actions, security score copy, and category summary labels.
- Dashboard information panels: covered selected-language rendering for recent items, cryptology shield details, and Aegis Guard report copy.
- Vault row components: covered selected-language rendering for strength badges and recent-item copy controls.
- Vault detail shell components: covered selected-language rendering for header actions, security assessment, metadata labels, categories, and empty notes.
- Login detail panel: covered selected-language rendering for username/password labels, empty-password fallback, TOTP status, and copy/reveal controls.
- Card detail panel: covered selected-language rendering for card labels, fallback values, and copy/reveal controls.
- Passkey detail panel: covered selected-language rendering for labels, fallback values, and copy/reveal controls.
- Identity detail panel: covered selected-language rendering for labels, fallback values, gender labels, and copy controls.
- Secure note detail panel: covered selected-language rendering for title, copied state, and empty-note fallback.
- Vault attachment card: covered selected-language rendering for attachment title, decrypt-on-download label, and download tooltip.
- Trash workspace components: covered selected-language rendering for empty state, protection notice, workspace copy, item metadata, and restore/delete controls.
- Shared controls: covered selected-language rendering for top bar tooltips and confirmation modal default/alert controls.
- Profile modal: covered selected-language rendering for modal copy, upload controls, form labels, actions, and validation feedback.
- Local storage badge: covered selected-language rendering for the device-only storage status label.
- Security audit: covered selected-language rendering for score feedback, metric cards, action groups, and empty-state copy.
- Password generator: covered selected-language rendering for mode tabs, copy/refresh controls, character settings, Diceware settings, and guidance copy.
- Vault form shell: covered selected-language rendering for modal titles, category tabs, common fields, and default actions.
- Vault form login section: covered selected-language rendering for credential labels, password controls, and TOTP inputs.
- Vault form card section: covered selected-language rendering for cardholder, number, expiry, CVV, and PIN fields.
- Vault form passkey section: covered selected-language rendering for service, public key, private exponent, and generator controls.
- Vault form identity section: covered selected-language rendering for document, full-name, date, and gender fields.
- Vault form secure note section: covered selected-language rendering for secure note copy, shared note labels, and placeholders.
- Vault form attachment section: covered selected-language rendering for encrypted-file heading, protection badge, and drop zone copy.
- Settings overview: covered selected-language rendering for vault statistics and master-password change controls.
- Settings lock controls: covered selected-language rendering for auto-lock options and biometric unlock status/actions.
- Settings backup/import controls: covered selected-language rendering for export buttons, import drop zone, and locked-backup prompts.
- Settings danger controls: covered selected-language rendering for demo reseed and destructive reset warning copy.
- Settings biometric errors: covered selected-language rendering for generic biometric failure fallback text.
- Profile settings hook: covered selected-language rendering for the default profile identity fallback.
- Notification hooks: covered selected-language rendering for the vault status alert and profile-save notification keys.
- Trash action hooks: covered selected-language rendering for move, empty, restore, and permanent-delete confirmation flows.
- Attachment download hook: covered selected-language rendering for missing-file and decrypt-failure notifications.
- Attachment library: covered stable error codes for missing vault sessions, missing encryption metadata, and unreadable file data at localization boundaries.
- Universal importer: covered localized parser labels and selected-language Settings import error rendering.
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
- `src/components/SettingsPanel.tsx`: covered Emergency Kit settings flows for disabled Secret Key protection, invalid keys, remembered Secret Key saves, and default save-error fallbacks.
- `src/components/VaultFormModal.tsx`: covered legacy edit payloads with missing fields and missing attachment metadata. The remaining selected-file input reset branch is intentionally defensive because the file input is unmounted when a selected file is displayed.
- `src/lib/clipboard.ts`: covered unavailable clipboard APIs, rejected writes, empty expected text, missing clear methods, read failures, and clear-write failures so clipboard helpers now report full coverage.
- `src/lib/encryption.ts`: covered malformed backup JSON, legacy envelope routing, missing secure envelope fields, and checksum tampering so the secure backup envelope module now reports full coverage.
- `src/lib/biometric.ts`: covered PBKDF2 compatibility vectors, WebAuthn support detection, registration options, credential request options, WebCrypto bundle metadata, disable flow, unsupported registration, cancelled registration, missing stored bundle, cancelled authentication, mismatched authenticator rejection, and legacy bundle unwrap failures so biometric helpers now report full coverage.
- `src/lib/random.ts`: covered WebCrypto and Math.random fallback paths, non-positive ranges, unbiased-index retries, randomUUID usage, UUID v4 fallback formatting, and empty token generation so entropy helpers now report full coverage.
- `src/lib/otp.ts`: added to the core mutation gate with RFC vectors, otpauth URI parsing, period/digit validation, Base32 whitespace/padding normalization, eight-digit formatting, and high-counter serialization coverage; TOTP mutation score now reports 92.19%.
- `src/lib/securityEvents.ts`: added to the core mutation gate with structured error construction, severity routing, public error copy, metadata redaction, control-character normalization, truncation, and non-string metadata preservation; security event mutation score now reports 100%.
- `src/lib/hibp.ts`: covered k-anonymity range lookup, Add-Padding/no-store request options, prefix cache reuse, and fail-closed unavailable responses.
- `src/lib/airgapNetworkPolicy.ts`: covered policy installation guards for fetch, XMLHttpRequest, WebSocket, sendBeacon, and EventSource so unexpected outbound channels fail closed while same-origin, Tauri IPC, and HIBP range requests remain allowed.
- `src/lib/importer.ts`: covered sparse Aegis JSON defaults, sparse and unknown Bitwarden JSON types, numeric Bitwarden CSV categories/favorites, LastPass optional-column fallbacks, universal CSV fallback defaults, stable default/localized format labels, encrypted-envelope guards, and empty/error states. CSV delimiter parsing, label defaults, and file decoding were split into `src/lib/csvParser.ts`, `src/lib/importerLabels.ts`, and `src/lib/fileDecoder.ts`; importer mutation score now reports 80.35%.
- Importer helpers: expanded CSV parser and file decoder edge coverage for empty exports, CR-only row separators, closing-quote whitespace, malformed quoted fields, blank records, short UTF-16 samples, incomplete BOM prefixes, and tied UTF-16 null-byte votes; the dedicated helper gate now reports 87.85% with a break threshold of 85.
- `src/lib/legacyCrypto.ts`: covered malformed legacy hashes, compact KDF parameters, SHA-256/HMAC/HKDF vectors, authenticated legacy AES-GCM-compatible decrypt paths, tamper rejection, old stream-cipher fallback envelopes, malformed secure envelopes, checksum failures, and unsupported envelope versions.
- `src/lib/attachments.ts`: covered AES-GCM metadata validation, legacy records without explicit algorithms, binary MIME fallback, unreadable FileReader results, FileReader errors, and stored-record decrypt failures so attachment branch coverage now reports full coverage.
- Storage bridge helpers: added a dedicated mutation gate for desktop native persistence and Android secure storage, covering runtime scope detection, native command routing, extension credential shaping, secure bridge validation, and fail-closed native errors.
- Storage orchestration: hardened initialization, setup reseeding, Secret Key secure-storage fallback/cleanup, setup migration warnings, no-session bulk-save guards, setup detection edge cases, rotation biometric reset, trash retention, and bulk-save orchestration; storage orchestration mutation score now reports 88.43% with zero no-coverage mutants.

## Next Gates

- Add Android release gate:
  - `npm run lint`
  - `npm run test:unit`
  - `npm run build`
  - `npm run android:release:version:check`
  - `npm run android:release:gate`
  - `npm run android:release:gate -- --evidence` for shareable internal candidates
  - `npm run android:device:doctor` before connected-device candidates
  - `npm run android:release:gate -- --device` for connected-device candidates
  - `npm run android:release:signing:check` before signed release candidates
  - `npm run android:release:report -- --strict`
  - `npm run android:device:smoke`
  - Manual Android release candidate checklist from `docs/ANDROID_READINESS.md`.
- Expand smoke E2E coverage for detail actions, broader translated screens, desktop persistence, and mobile smoke viewports.
- Push importer helper and storage orchestration mutation scores toward the 90% high threshold, then expand mutation testing into SQLite migration modules.
- Keep global coverage thresholds at or above 90% lines/statements, 85% functions, and 80% branches; raise them again after the current priority targets improve.
