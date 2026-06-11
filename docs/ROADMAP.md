# Aegis Vault 7 Roadmap

## Phase 1: Repository and Desktop Foundation

- [x] Initialize the local Git repository.
- [x] Replace AI Studio metadata with Aegis Vault 7 metadata.
- [x] Add deterministic npm lockfile.
- [x] Add baseline unit test tooling.
- [x] Push a clean `main` branch to `hafgit99/aegis-vault-v7`.
- [x] Add Tauri desktop target.
- [x] Verify Windows desktop build output.

## Phase 2: Codebase Stabilization

- [x] Centralize secure random helpers.
- [x] Replace password generator randomness with secure randomness.
- [x] Split `src/App.tsx` into route/view/layout components.
  - [x] Mobile sidebar backdrop extracted to `MobileSidebarBackdrop`.
  - [x] Local storage status badge extracted to `LocalStorageBadge`.
  - [x] Trash empty state extracted to `TrashEmptyState`.
  - [x] Trash info banner extracted to `TrashInfoBanner`.
  - [x] Trash item card extracted to `TrashItemCard`.
  - [x] Vault list row extracted to `VaultListItem`.
  - [x] Dashboard recent item row extracted to `RecentVaultItem`.
  - [x] Dashboard crypto shield panel extracted to `CryptoShieldPanel`.
  - [x] Dashboard Aegis Guard report extracted to `AegisGuardReport`.
  - [x] Dashboard category stats extracted to `DashboardCategoryStats`.
  - [x] Dashboard security score card extracted to `DashboardSecurityScoreCard`.
  - [x] Dashboard quick actions extracted to `DashboardQuickActions`.
  - [x] Dashboard recent vault panel extracted to `RecentVaultPanel`.
  - [x] Dashboard header extracted to `DashboardHeader`.
  - [x] Vault item side info extracted to `VaultItemSideInfo`.
  - [x] Vault item security assessment extracted to `VaultItemSecurityAssessment`.
  - [x] Vault item detail header extracted to `VaultItemDetailHeader`.
  - [x] Vault item attachment card extracted to `VaultItemAttachmentCard`.
  - [x] Secure note detail extracted to `SecureNoteDetail`.
  - [x] Passkey detail extracted to `PasskeyDetail`.
  - [x] Identity detail extracted to `IdentityDetail`.
  - [x] Card detail extracted to `CardDetail`.
  - [x] Login detail extracted to `LoginDetail`.
  - [x] Selected vault item panel extracted to `VaultItemDetailPanel`.
  - [x] Vault list and detail workspace extracted to `VaultWorkspace`.
  - [x] Trash workspace extracted to `TrashWorkspace`.
  - [x] App shell event handlers normalized.
  - [x] Sidebar navigation extracted to `SidebarNavigation`.
  - [x] Top bar extracted to `TopBar`.
  - [x] Main tab content renderer extracted to `MainContent`.
  - [x] Floating vault action extracted to `FloatingVaultAction`.
  - [x] App modal host extracted to `AppModals`.
- [x] Extract vault item selection, reveal state, and auto-lock logic into hooks.
  - [x] Auto-lock behavior extracted to `useAutoLock`.
  - [x] Copy feedback and sensitive reveal state extracted to dedicated hooks.
  - [x] Vault filtering, trash, counters, and audit summary extracted to `useVaultQueries`.
  - [x] Vault selection and audit-selection behavior extracted to `useVaultSelection`.
  - [x] Profile settings persistence extracted to `useProfileSettings`.
  - [x] Auto-lock duration persistence extracted to `useAutoLockDuration`.
  - [x] Confirm and notification modal state extracted to `useConfirmModal`.
  - [x] TOTP countdown interval extracted to `useTotpCountdown`.
  - [x] Vault item loading, saving, and favorite state extracted to `useVaultData`.
  - [x] Attachment download flow extracted to `useAttachmentDownload`.
  - [x] Trash action confirmations and storage updates extracted to `useTrashActions`.
  - [x] Tab and sidebar navigation state extracted to `useAppNavigation`.
  - [x] Vault form open/edit state extracted to `useVaultFormState`.
  - [x] Mobile vault list/detail state extracted to `useVaultMobileView`.
  - [x] Lock/unlock and auto-lock orchestration extracted to `useVaultLock`.
  - [x] Search and favorite filter state extracted to `useVaultFilters`.
  - [x] Unlock-triggered vault refresh extracted to `useUnlockedVaultRefresh`.
  - [x] Selected item password score extracted to `useSelectedItemScore`.
  - [x] Vault status alert action extracted to `useVaultStatusAction`.
- [x] Extract display helpers for file sizes and trash retention calculations.
  - [x] Platform logo resolver moved into display helpers.
  - [x] Vault form attachment size labels use shared display helpers.
- [x] Replace `alert()` calls with the existing modal/toast pattern.
- [x] Normalize naming: `AegisVault`, `Aegis Vault`, and `Aegis Vault 7`.
- [x] Add component tests for lock screen, vault form, settings import/export, and trash.
  - [x] Lock screen setup and unlock behavior covered by component tests.
  - [x] Settings encrypted export and JSON import behavior covered by component tests.
  - [x] Trash workspace and item actions covered by component tests.
  - [x] Vault form create/edit behavior covered by component tests.
- [x] Add core regression tests for encrypted backup envelopes and universal imports.

## Phase 3: Security Hardening

- [x] Replace simulated Argon2id with a vetted Argon2id implementation.
  - [x] Browser Argon2id adapter added around `argon2-browser`.
  - [x] Encrypted backup export/import uses vetted Argon2id adapter.
  - [x] Master password verification hashes use vetted Argon2id with legacy hash upgrade.
  - [x] Vault item encryption keys use the vetted Argon2id adapter with legacy row migration.
- [ ] Replace custom AES/GCM simulation with WebCrypto AES-GCM or a vetted crypto library.
  - [x] Encrypted backup export/import uses WebCrypto AES-GCM.
  - [x] Biometric master-password wrapping uses WebCrypto AES-GCM.
  - [x] New vault item metadata writes and localStorage migration writes use WebCrypto AES-GCM.
  - [x] Legacy backup encryption writer removed; remaining custom AES is read-only compatibility fallback.
  - [x] Read-only legacy crypto fallbacks isolated from the secure backup module.
  - [x] Legacy XOR attachment migration runs automatically after successful unlock.
- [x] Remove base64 master password storage from `sessionStorage`.
- [x] Replace attachment XOR encryption with authenticated encryption.
- [x] Introduce a versioned vault database format and migration tests.
- [x] Define the desktop threat model and recovery model.
- [x] Add security regression tests for import/export, attachments, and lock/unlock flows.
  - [x] Encrypted backup envelope roundtrip and wrong-password rejection tests.
  - [x] Active-session encrypted export and encrypted import flow tests.
  - [x] Attachment wrong-session and tampered-tag rejection tests.
  - [x] Manual and automatic lock session clearing tests.
  - [x] Add unit coverage baseline and conservative coverage thresholds.
  - [x] Expand importer fixtures for JSON, CSV, encrypted envelopes, and malformed inputs.
  - [x] Expand attachment IndexedDB persistence and migration coverage.
  - [x] Expand SQLite OPFS persistence engine coverage.
  - [x] Expand storage lifecycle wrapper coverage.
  - [x] Expand password generator and Diceware workflow coverage.

## Phase 4: Desktop Productization

- [x] Replace generated Tauri icons with Aegis Vault 7 branded icons.
- [x] Add app data directory integration for desktop vault persistence.
- [x] Add controlled native file dialogs for import/export.
- [x] Add safe clipboard clearing behavior.
- [x] Add CI build workflow for Windows desktop artifacts.
- [x] Add release checklist and signed build plan.

## Phase 5: Android Preparation

- [ ] Separate shared core logic from web/desktop UI concerns.
- [ ] Add platform storage adapter interfaces.
- [ ] Add mobile biometric adapter plan.
- [ ] Validate Tauri Android feasibility with a debug APK.
- [ ] Define Android backup and recovery UX.
