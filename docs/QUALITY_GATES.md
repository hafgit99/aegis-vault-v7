# Quality Gates

This document tracks the automated test gates for Aegis Vault 7. The goal is to raise confidence in small, measurable steps without making early development brittle.

## Current Unit Coverage Baseline

Baseline captured with:

```bash
npm run test:coverage
```

Current measured baseline from the latest local run:

| Metric | Baseline |
| --- | ---: |
| Lines | 91.23% |
| Statements | 90.05% |
| Functions | 90.49% |
| Branches | 82.16% |

Coverage thresholds are intentionally strict and currently pass at the measured baseline:

| Metric | Current threshold | Current status |
| --- | ---: | --- |
| Lines | 90% | PASS at 91.23% |
| Statements | 90% | PASS at 90.05% |
| Functions | 85% | PASS at 90.49% |
| Branches | 80% | PASS at 82.16% |

These thresholds prevent meaningful regressions while keeping the release-quality bar visible and repeatable.

## Priority Coverage Targets

Completed in the latest coverage recovery pass:

1. `src/hooks/useAndroidAutofillCoordinator.ts`: pending, stale, cancel, approve, native completion failure, and Android save-candidate state-machine coverage.
2. `src/lib/indexedDbStorage.ts`: IndexedDB read/write/remove/clear, localStorage migration, sync-cache fallback, and unsupported IndexedDB no-op coverage.
3. `src/lib/sync/syncConfigStorage.ts`, `src/lib/sync/index.ts`, `src/lib/clipboard.ts`, and `src/lib/passkey.ts`: encrypted sync config persistence, provider factory, protected clipboard fallback, and WebAuthn create/authenticate error paths.

Next useful targets after the 90/80 global gate is stable:

1. `src/components/SettingsPanel.tsx`: reduce remaining fallback-message and desktop-runtime branch gaps.
2. `src/lib/attachments.ts` and `src/lib/biometric.ts`: deepen edge-case coverage around legacy metadata and platform bridge failures.
3. `src/lib/waSqlite*.ts`: continue migration rollback and persistence branch coverage as wa-sqlite becomes the default storage path.

## Security Gate Scripts

Release candidates run dedicated security gates in addition to typecheck, unit tests, and builds:

```bash
npm run security:no-js-master-string
npm run security:csp
npm run security:release-hardening
npm run security:dependencies
npm run rust:fmt:check
npm run rust:test:native
```

The dependency security gate runs `npm audit --audit-level=high` so high and critical npm advisories block release candidates while lower-severity advisories remain review items. The Rust native gate runs `cargo fmt --check` and the focused atomic vault database write tests so desktop persistence regressions are caught before artifact creation.
Dependency audit hardening is kept current in the lockfile: Vitest and `@vitest/coverage-v8` are on the 4.x line to remove high/critical Vitest/Vite advisories, `form-data` is locked to the patched 4.0.6 tree, and `qs` is pinned through `overrides` at 6.15.3 so the Stryker/typed-rest-client chain does not reintroduce the known parser DoS advisory. The verified release state is `npm audit --audit-level=high` with zero high or critical findings; a full `npm audit` also reports zero vulnerabilities after the override resolution.

The CSP gate fails if Tauri's production Content-Security-Policy reintroduces `style-src 'unsafe-inline'`, remote Google font origins, React inline `style={...}` props, HTML `style` attributes, or production `<style>` blocks. Desktop, Android, and wa-sqlite final gates call it automatically.

The release-hardening gate scans the real dist and browser-extension outputs plus Android release configuration for source maps, development runtime markers, first-party console/debugger statements, bundled signing or credential patterns, tracked secret files, enabled Tauri devtools, disabled R8, debuggable release builds, Android backup exposure, and cleartext traffic. Existing merged Android release manifests are verified as artifacts; pass `--require-android-artifact` when an Android candidate must be present. Desktop, Android, local release, `release:readiness`, and `release:readiness:final` flows include this result automatically; signed Android gates require a generated release manifest.

## Property-Based Fuzz Gate

Malformed backups, importer input, and attachment metadata now have a fast property-based fuzz gate powered by `fast-check`. This gate is intentionally bounded so it can run inside normal unit tests while still exploring malformed JSON, CSV, secure backup envelopes, and AES-GCM attachment metadata.

Run it directly with:

```bash
npm run test:fuzz
```

Current fuzz scope:

- `src/lib/importer.fuzz.test.ts`: arbitrary import text, arbitrary JSON-compatible values, native Aegis JSON array normalization, native Aegis JSON export/import round-trips, and CSV parser row-shape invariants.
- `src/lib/encryption.fuzz.test.ts`: malformed encrypted backup envelopes, weak/malformed KDF parameters, and malformed JSON error taxonomy.
- `src/lib/attachments.fuzz.test.ts`: unsupported attachment algorithms, missing AES-GCM metadata, and arbitrary authenticated-decryption metadata boundaries.

This gate already caught and fixed a native Aegis JSON import hardening issue where non-string fields such as `password: true` could be carried into normalized vault item data. Native Aegis JSON array imports now coerce credential fields through explicit string guards, and exported vault items now have a property-based round-trip guard that verifies supported fields survive JSON export/import normalization. The desktop release gate, Android release gate, local release script, and wa-sqlite final gate now run `npm run test:fuzz` as a visible release step instead of leaving it implicit inside the full unit suite.

## Current Mutation Gate

The first practical mutation gate runs against critical library helpers with:

The same gate validates the native-anchored asset integrity manifest: all production files are hashed with SHA-256, the canonical root is embedded by the Rust build script, and the runtime verifier compares every served asset against that root. This is defense in depth for detecting modified packages, not a replacement for Windows/macOS code signing, Android APK signing, or trusted distribution checksums.

```bash
npm run test:mutation:dry
npm run test:mutation
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

## Dedicated Security Mutation Gate

A specialized mutation testing gate focuses on cryptographic primitives, share URL decryption, recovery key generation/reconstruction, and database format normalization.

Run it with:

```bash
npm run test:mutation:security:dry
npm run test:mutation:security
```

Current mutation scope:

- `src/lib/share.ts`
- `src/lib/recoveryKey.ts`
- `src/lib/backupValidation.ts`
- `src/lib/vaultDatabaseFormat.ts`

Current measured security mutation baseline:

| Metric | Baseline |
| --- | ---: |
| Mutants | 533 |
| Mutation score | 86.15% |
| Covered mutation score | 86.48% |
| Killed | 441 |
| Timed out | 13 |
| Survived | 71 |
| No coverage | 2 |

File scores:

| File | Mutation score | Covered score |
| --- | ---: | ---: |
| `src/lib/backupValidation.ts` | 87.61% | 87.61% |
| `src/lib/recoveryKey.ts` | 87.00% | 87.44% |
| `src/lib/share.ts` | 83.67% | 83.67% |
| `src/lib/vaultDatabaseFormat.ts` | 80.00% | 81.36% |

Security mutation thresholds:

| Threshold | Current value |
| --- | ---: |
| High | 85% |
| Low | 75% |
| Break | 70% |

## Dedicated Search & Smart Folders Mutation Gate

Search, tag resolution, and smart folder filtering logic have a dedicated mutation gate measuring fuzz and predicate resilience.

Run it with:

```bash
npm run test:mutation:search:dry
npm run test:mutation:search
```

Current mutation scope:

- `src/lib/fuzzySearch.ts`
- `src/lib/recentSearches.ts`
- `src/lib/tags.ts`
- `src/lib/smartFolders.ts`

Current measured search mutation baseline:

| Metric | Baseline |
| --- | ---: |
| Mutants | 1,082 |
| Mutation score | 81.33% |
| Covered mutation score | 82.61% |
| Killed | 777 |
| Timed out | 7 |
| Survived | 165 |
| No coverage | 15 |

File scores:

| File | Mutation score | Covered score |
| --- | ---: | ---: |
| `src/lib/recentSearches.ts` | 87.50% | 89.36% |
| `src/lib/tags.ts` | 86.77% | 87.23% |
| `src/lib/fuzzySearch.ts` | 79.53% | 82.11% |
| `src/lib/smartFolders.ts` | 78.59% | 79.33% |

Search mutation thresholds:

| Threshold | Current value |
| --- | ---: |
| High | 80% |
| Low | 60% |
| Break | 45% |

## Android Release Evidence Boundary

Android release quality gates intentionally separate automated script evidence from device-only manual claims. Automated gates can validate artifact integrity, signing metadata, install/launch health, app-private storage, declared Autofill services, selected security-report output, and the presence of a completed biometric production matrix. Final Android release candidates still require the completed checklist copy in `release-local/android/<timestamp>/` for document picker destinations, browser Autofill behavior, biometric flows, FLAG_SECURE behavior on the target phone, and safe-area/mobile UI checks. Public biometric claims additionally require `--require-biometric-matrix` with Pixel, Samsung, Xiaomi, and Android 12/13/14/15 evidence recorded.

For final candidate review, run:

```bash
npm run android:release:evidence:verify -- --dir release-local/android/<timestamp> --require-device --require-fresh-install --require-signed --require-completed-checklist
```

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
- `src/lib/sqlite_opfs.ts`: covered master setup/verification, encrypted row persistence, desktop payload hydration, OPFS file hydration, missing OPFS file initialization, OPFS write failures, desktop read fallback, legacy localStorage migration, read-only SQL console behavior, row update/defaults, reseed/delete/reset flows, query log subscriptions, localStorage fallback hydration, missing-key decryption guards, and master-password rotation rollback when persistence cannot be written, and single/bulk vault-item save rollback, permanent-delete rollback, bulk-delete rollback, demo-reseed rollback when persistence cannot be written, and native reset fail-closed behavior when desktop/app-private reset cannot be confirmed.
- Storage backend contract: introduced `src/lib/vaultStorageRepository.ts` so the current OPFS-backed engine and a future real SQLite/wa-sqlite backend must expose the same persistence, migration, reset, SQL-console, and encrypted-item operations.
- Storage backend provider: routed `src/lib/storage.ts` through `src/lib/vaultStorageProvider.ts` so OPFS and future SQLite repositories can be swapped behind the same tested contract without changing app workflows.
- Storage migration dry-run: added fail-closed `VITE_AEGIS_STORAGE_BACKEND` parsing and a read-only wa-sqlite dry-run planner that validates unlockability and item identity integrity without writing to the vault.
- wa-sqlite migration mirror: added a read-only `ReadOnlyWaSqliteVaultStorageAdapter` behind the provider dry-run target so future SQLite work can exercise the repository contract without allowing writes or changing production OPFS behavior.
- wa-sqlite engine bootstrap: added the real `wa-sqlite` dependency, a Vite-safe WASM loader, schema bootstrap, normalized query execution, close handling, and a Node WASM smoke path using `wasmBinary` which established the path from the read-only mirror to the current active backend safely.
- wa-sqlite read-only query gate: added `executeReadOnly` and `selectObjects` helpers so future adapter reads can map SQLite rows safely while blocking mutating SQL before it reaches the engine.
- wa-sqlite adapter engine reads: wired the read-only migration mirror to optionally initialize the real wa-sqlite engine and merge engine vault row metadata with decrypted OPFS source items while keeping all write paths fail-closed.
- wa-sqlite dry-run metadata seed: connected the provider dry-run target to the real engine and added source-to-target metadata seeding for empty wa-sqlite tables without copying usernames, passwords, notes, or other decrypted secret fields into SQL seed statements.
- wa-sqlite dry-run target validation: extended migration dry-run results with target item counts and source/target identity checks so mismatched, missing, duplicate, unreadable, or extra target records block migration readiness before any active backend switch.
- wa-sqlite repository write path: `WaSqliteVaultStorageRepository` now supports schema hydration, Argon2id-backed master setup/verification, per-vault salt/KDF metadata, AES-GCM encrypted vault row save/read, transaction rollback on failed upserts, permanent delete/reset/reseed flows, transaction-guarded master password rekey/rollback, no plaintext password-keyed cache, and a fail-closed direct SQL surface until active backend migration parity is complete.
- wa-sqlite migration orchestration: added a controlled OPFS-to-wa-sqlite migration service with source unlock validation, source id integrity checks, target setup/save/read verification, content parity checks, target rollback on write/integrity failures, optional reopen-and-read persistent parity checks, and an explicit provider factory for write-target repositories while keeping the active backend unchanged.
- wa-sqlite persistent VFS: wired the engine to the async wa-sqlite runtime with IndexedDB `IDBMinimalVFS`, scoped desktop/Android/browser database names, VFS registration/open/close handling, volatile fallback when IndexedDB is unavailable, and active backend promotion still fail-closed until migration switch testing is complete.
- wa-sqlite persistence smoke: added a reusable write-close-reopen-read smoke verifier with deterministic tests for pass, unavailable VFS, write failure, and mismatch paths so desktop/Android runtime checks can prove persistence before the backend is promoted.
- wa-sqlite migration preflight: `runVaultStorageMigration` now requires a passing persistent-target smoke check before the wa-sqlite target is hydrated, reset, or written, blocks promotion when the VFS cannot prove write-close-reopen-read durability, and sanitizes target write/rollback errors before they become migration report issues.
- wa-sqlite promotion readiness: added a single readiness report that keeps active backend promotion blocked until persistent VFS, smoke, dry-run, persistent migration candidate, backend direction, profile parity, and dry-run/migration item-count parity checks have all passed and surfaces blocker codes for release review.
- wa-sqlite active selection gate: active `VITE_AEGIS_STORAGE_BACKEND=wa-sqlite` requests now fail closed with structured blocker codes unless promotion readiness is ready and the active provider switch is explicitly enabled. Active repository creation now has a provider-level factory that returns OPFS by default and requires an explicitly active-ready persistent wa-sqlite profile before constructing the real wa-sqlite repository. Controlled migration repository creation also returns a same-profile reopen factory, and the persistent migration candidate runner now wires OPFS source, wa-sqlite write target, smoke preflight, and close/reopen parity into one promotion-ready call without accidentally switching database scopes. Migration write-target repository creation also requires a persistent wa-sqlite VFS profile so volatile WASM storage cannot become the destination for a real migration. A dedicated active backend promotion plan now combines readiness evidence, active wa-sqlite backend selection, and the verified active-ready persistence profile before the provider can construct the promoted repository; forged or blocked plans fail closed. The provider can now promote the singleton active repository from a verified plan with an explicit restore handle, failed promotion validation leaves the current OPFS repository untouched, and hydrate-first promotion waits for `repository.hydrate()` before swapping the active repository so hydrate failures also leave the existing active repository untouched.
- wa-sqlite active migration orchestration: added `runWaSqliteActiveBackendMigration`, a shared desktop/Android promotion runner that performs persistent VFS smoke, OPFS-to-wa-sqlite persistent migration, close/reopen dry-run parity, readiness-plan creation, and hydrate-first active repository promotion in one fail-closed sequence. Smoke, source unlock, migration, dry-run, or readiness failures return blocker evidence and never call active promotion.
- wa-sqlite storage integration seam: added `migrateActiveVaultStorageToWaSqlite()` in the storage/session layer so desktop and Android UI can trigger the shared active migration runner with the already-unlocked session credential, including Secret Key combined credentials. The wrapper fails closed without an active session and only refreshes the setup marker after a promoted result.
- Sync metadata freshness: sync envelopes now publish the newest item timestamp as remote metadata freshness so near-simultaneous remote writes cannot be skipped because the envelope build time is equal to or older than local item timestamps.
- `src/lib/storage.ts`: covered setup detection, Secret Key profile fallbacks, remembered-key migration/forget flows, failed unlock session guards, master-password rotation rollback rules, reset marker cleanup, no-session guards, save/delete/reseed wrappers, trash move/restore, retention-boundary cleanup, bulk-save progress callbacks, and full trash emptying.
- `src/components/PasswordGenerator.tsx`: covered character option changes, all character toggles, strength bar tone branches, diceware mode settings, word-count descriptions, diceware toggles, copy feedback, unmount cleanup, and safe clipboard clearing behavior.
- `src/lib/diceware.ts`: covered Turkish/English word selection, EFF-sized word-pool expansion, separator formats, capitalization, number and symbol placement, camel/none separator handling, optional entropy calculations, and static word-list separation for practical mutation testing.
- `src/components/VaultFormModal.tsx`: covered card, secure key/API secret, identity, secure note, attachment upload, oversized-file rejection, existing attachment download/removal, and non-login username normalization.
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
- Secure key detail panel: covered selected-language rendering for labels, fallback values, and copy/reveal controls.
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
- Vault form secure key section: covered selected-language rendering for service/use-case, identifier, secret material, and generator controls.
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
- Attachment download hook: covered selected-language rendering for missing-file/decrypt-failure notifications, native-save cancellation, FileReader byte fallback, and fallback filenames so Android/desktop attachment saves avoid unintended browser downloads after user cancellation.
- Attachment library: covered stable error codes for missing vault sessions, missing encryption metadata, and unreadable file data at localization boundaries.
- Universal importer: covered localized parser labels and selected-language Settings import error rendering.
- `src/components/VaultFormModal.tsx`: covered edit-save identity preservation, title validation, password visibility/autogeneration, selected file removal, attachment upload failures, existing attachment removal before save, and download error notifications.
- `src/components/CardDetail.tsx`: covered copied states, PIN copy action, missing-field fallbacks, and empty-string copy behavior.
- `src/components/LoginDetail.tsx`: covered copied states, empty-password fallback, and safe empty-password copy behavior.
- `src/components/PasskeyDetail.tsx`: covered secure-key copied states, missing-field fallbacks, and safe empty-string copy behavior.
- `src/lib/passkey.ts`, `src/components/PasskeyManager.tsx`, and the Settings passkey wiring: covered WebAuthn capability detection, credential-id encoding, strict RP ID validation, registration validation, platform authenticator request options, vault-key wrapped recovery metadata, tamper/closed-session unwrap behavior, vault-field mapping, localized status rendering, record list display, create form dispatch, assertion actions, and delete action dispatch.
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
- `src/lib/clipboard.ts`: covered unavailable clipboard APIs, rejected writes, unchanged-content checks, overwrite-then-clear clipboard hardening, empty expected text, missing clear methods, read failures, and clear-write failures so clipboard helpers now report full coverage.
- `src/lib/encryption.ts`: covered malformed backup JSON, legacy envelope routing, missing secure envelope fields, and checksum tampering so the secure backup envelope module now reports full coverage.
- `src/lib/biometric.ts`: covered PBKDF2 compatibility vectors, WebAuthn support detection, registration options, credential request options, WebCrypto bundle metadata, disable flow, unsupported registration, cancelled registration, missing stored bundle, cancelled authentication, mismatched authenticator rejection, and legacy bundle unwrap failures so biometric helpers now report full coverage.
- `src/lib/random.ts`: covered WebCrypto and Math.random fallback paths, non-positive ranges, unbiased-index retries, randomUUID usage, UUID v4 fallback formatting, and empty token generation so entropy helpers now report full coverage.
- `src/lib/otp.ts`: added to the core mutation gate with RFC vectors, otpauth URI parsing, explicit period/digit validation errors, Base32 whitespace/padding normalization, eight-digit formatting, and high-counter serialization coverage; TOTP mutation score now reports 92.19%.
- `src/lib/securityEvents.ts`: added to the core mutation gate with structured error construction, severity routing, public error copy, metadata redaction, control-character normalization, truncation, and non-string metadata preservation; security event mutation score now reports 100%.
- `src/lib/hibp.ts`: covered k-anonymity range lookup, Add-Padding/no-store request options, prefix cache reuse, empty-password short-circuiting, malformed range rows, HTTP failures, missing WebCrypto SHA-1 support, and fail-closed unavailable responses so HIBP now reports full line/function coverage.
- `src/lib/airgapNetworkPolicy.ts`: covered policy installation guards for fetch, XMLHttpRequest, WebSocket, sendBeacon, and EventSource so unexpected outbound channels fail closed while same-origin, Tauri IPC, and HIBP range requests remain allowed.
- Android Autofill helpers: covered missing-target matching, malformed host normalization, deceptive suffix rejection, requested/cancelled security logs, diagnostic field redaction, and completed/failed event routing.
- `src/hooks/useVaultData.ts`: covered large-dataset progressive refresh and persisted favorite-selection behavior so UI selection follows normalized storage rows instead of stale optimistic objects.
- `src/lib/importer.ts`: covered sparse Aegis JSON defaults, sparse and unknown Bitwarden JSON types, numeric Bitwarden CSV categories/favorites, LastPass optional-column fallbacks, universal CSV fallback defaults, stable default/localized format labels, encrypted-envelope guards, and empty/error states. CSV delimiter parsing, label defaults, and file decoding were split into `src/lib/csvParser.ts`, `src/lib/importerLabels.ts`, and `src/lib/fileDecoder.ts`; importer mutation score now reports 80.35%.
- Importer helpers: expanded CSV parser and file decoder edge coverage for empty exports, CR-only row separators, closing-quote whitespace, malformed quoted fields, blank records, short UTF-16 samples, incomplete BOM prefixes, and tied UTF-16 null-byte votes; the dedicated helper gate now reports 87.85% with a break threshold of 85.
- `src/lib/legacyCrypto.ts`: covered the removed-legacy fail-closed boundary and asserted that custom legacy decrypt/KDF/HMAC helpers are no longer exported.
- `src/lib/attachments.ts`: covered AES-GCM metadata validation, legacy records without explicit algorithms, binary MIME fallback, unreadable FileReader results, FileReader errors, and stored-record decrypt failures so attachment branch coverage now reports full coverage.
- Storage bridge helpers: added a dedicated mutation gate for desktop native persistence and Android secure storage, covering runtime scope detection, native command routing, extension credential shaping, secure bridge validation, and fail-closed native errors.
- Storage orchestration: hardened initialization, setup reseeding, Secret Key secure-storage fallback/cleanup, setup migration warnings, no-session bulk-save guards, setup detection edge cases, rotation biometric reset, trash retention, and bulk-save orchestration; storage orchestration mutation score now reports 88.43% with zero no-coverage mutants.
- wa-sqlite settings migration control: covered the guarded Settings entry point for active backend promotion, confirmation cancellation, safety-check blockers, missing-session errors, success refresh, and user notification routing.
- wa-sqlite persisted active backend marker: promoted backends now write a non-secret active backend marker, startup restores wa-sqlite only after hydrate succeeds, invalid markers are cleared fail-closed, reset removes the marker, and marker write failures roll promotion back.
- wa-sqlite active backend reporting: provider diagnostics now track the live repository selection through verified promotion, hydrate-first promotion, persisted restore, rollback, and test swaps instead of falling back to build-time backend configuration after wa-sqlite becomes active.
- wa-sqlite startup restore integration: storage-session tests now verify that app initialization restores any persisted active wa-sqlite backend before hydrating the active repository, then continues biometric and secure-storage migration work in order.
- wa-sqlite default backend completion: fresh vault startup now hydrates and marks wa-sqlite as the active backend by default when persistent VFS support is available, while existing OPFS/JSON vault data is detected and kept on OPFS until the guarded migration flow completes successfully.
- wa-sqlite active promotion failure handling: active backend migration now returns a sanitized blocked result when hydrate-first promotion fails, and it does not write the active backend marker after a failed promotion attempt.
- wa-sqlite repository batch transaction integrity: batch save progress is now reported after successful encrypted upserts, and tests verify partial batch failures roll the target table back to its previous committed rows.
- wa-sqlite active migration dry-run fail-closed path: active backend orchestration now converts unexpected post-migration dry-run exceptions into sanitized blocked readiness evidence, and tests verify promotion and active marker persistence are skipped.
- wa-sqlite active migration pair creation failure: active backend orchestration now converts repository-pair creation exceptions into sanitized blocked readiness evidence before smoke, migration, promotion, or marker persistence can run.
- wa-sqlite active marker profile validation: persisted active backend markers now reject unsupported storage scopes, missing IndexedDB VFS names, and database/VFS names that do not exactly match the selected storage scope, with tests proving forged markers are cleared without replacing OPFS.
- wa-sqlite migration rollback source integrity gate: target rollback paths now re-verify that the OPFS/source vault still unlocks and matches the pre-migration item set, adding explicit source-drift blocker codes if rollback safety ever detects source-side mutation.
- wa-sqlite promotion smoke profile parity: active backend readiness now requires a passing smoke test to report the exact database name and IndexedDB VFS name for the candidate persistence profile, so a smoke pass from another desktop/Android/browser scope cannot promote the backend.
- Rust native persistence: `cargo test write_vault_database_file` verifies the desktop vault database write helper replaces existing contents through the atomic temp-file path, removes the temporary file after success, and preserves the previous database contents if temporary file creation fails.

## Next Gates

- Add Android release gate:
  - `npm run typecheck`
  - `npm run test:unit`
  - `npm run build`
  - `npm run android:release:version:check`
  - `npm run android:release:gate`
  - `npm run android:release:gate -- --evidence` for shareable internal candidates; evidence mode also runs `npm run android:release:evidence:verify`
  - `npm run android:release:evidence:verify -- --dir release-local/android/<timestamp> --require-device --require-fresh-install --require-signed --require-completed-checklist` before final signed APK distribution
  - `npm run android:release:evidence:summary -- --dir release-local/android/<timestamp> --final` to print a final PASS/BLOCKED release evidence summary
  - `npm run android:release:notes -- --dir release-local/android/<timestamp> --signed --final` to generate archived Android release notes
  - `npm run android:device:doctor` before connected-device candidates
  - `npm run android:release:gate -- --device` for connected-device candidates
  - `npm run android:release:signing:check` before signed release candidates
  - `npm run android:release:report -- --strict`
  - `npm run android:device:smoke`
  - Manual Android release candidate checklist from `docs/ANDROID_READINESS.md`.

- Add desktop final checklist evidence gate:
  - `npm run desktop:release:evidence -- --require-completed-checklist` before publishing desktop artifacts after the copied manual smoke checklist is completed.
  - `npm run desktop:release:evidence:summary -- --platform <windows|linux|macos> --final` to print a desktop PASS/BLOCKED evidence summary.
  - `npm run desktop:release:gate -- --final` is the distribution gate: it requires a clean tree, completed checklist evidence, release hardening, and verified signatures for every Windows/macOS executable or installer. Linux publication requires matching SHA-256 evidence; detached package signing remains platform/distribution specific.
  - Rust release binaries use thin LTO, one codegen unit, `panic = "abort"`, symbol stripping, disabled debug info, and disabled incremental compilation. `npm run security:release-hardening` enforces this profile so a debug-oriented binary cannot silently enter release evidence.
- Continue smoke E2E expansion beyond the current 24 Chromium scenarios, with next focus on Android-specific manual parity checks and wa-sqlite UI-level backup/import smoke.
- Push importer helper and storage orchestration mutation scores toward the 90% high threshold, then expand mutation testing into SQLite migration modules.
- Keep global coverage thresholds at or above 90% lines/statements, 85% functions, and 80% branches; raise them again after the current priority targets improve.

## wa-sqlite Final Gate

Use `npm run wa-sqlite:final:gate` before deciding whether wa-sqlite is ready for default active-backend promotion. Use `npm run wa-sqlite:final:gate:unit` for the faster focused unit/integration pass and `npm run wa-sqlite:final:gate:dry` to inspect the command plan. Details live in `docs/WA_SQLITE_FINAL_GATE.md`.





