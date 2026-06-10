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
- [ ] Split `src/App.tsx` into route/view/layout components.
  - [x] Mobile sidebar backdrop extracted to `MobileSidebarBackdrop`.
  - [x] Local storage status badge extracted to `LocalStorageBadge`.
  - [x] Trash empty state extracted to `TrashEmptyState`.
  - [x] Trash info banner extracted to `TrashInfoBanner`.
  - [x] Trash item card extracted to `TrashItemCard`.
- [ ] Extract vault item selection, reveal state, and auto-lock logic into hooks.
  - [x] Auto-lock behavior extracted to `useAutoLock`.
  - [x] Copy feedback and sensitive reveal state extracted to dedicated hooks.
  - [x] Vault filtering, trash, counters, and audit summary extracted to `useVaultQueries`.
  - [x] Vault selection and audit-selection behavior extracted to `useVaultSelection`.
- [x] Extract display helpers for file sizes and trash retention calculations.
  - [x] Platform logo resolver moved into display helpers.
  - [x] Vault form attachment size labels use shared display helpers.
- [x] Replace `alert()` calls with the existing modal/toast pattern.
- [ ] Normalize naming: `AegisVault`, `Aegis Vault`, and `Aegis Vault 7`.
- [ ] Add component tests for lock screen, vault form, settings import/export, and trash.
- [x] Add core regression tests for encrypted backup envelopes and universal imports.

## Phase 3: Security Hardening

- [ ] Replace simulated Argon2id with a vetted Argon2id implementation.
- [ ] Replace custom AES/GCM simulation with WebCrypto AES-GCM or a vetted crypto library.
- [ ] Remove base64 master password storage from `sessionStorage`.
- [ ] Replace attachment XOR encryption with authenticated encryption.
- [ ] Introduce a versioned vault database format and migration tests.
- [ ] Define the desktop threat model and recovery model.
- [ ] Add security regression tests for import/export, attachments, and lock/unlock flows.
  - [x] Encrypted backup envelope roundtrip and wrong-password rejection tests.

## Phase 4: Desktop Productization

- [ ] Replace generated Tauri icons with Aegis Vault 7 branded icons.
- [ ] Add app data directory integration for desktop vault persistence.
- [ ] Add controlled native file dialogs for import/export.
- [ ] Add safe clipboard clearing behavior.
- [ ] Add CI build workflow for Windows desktop artifacts.
- [ ] Add release checklist and signed build plan.

## Phase 5: Android Preparation

- [ ] Separate shared core logic from web/desktop UI concerns.
- [ ] Add platform storage adapter interfaces.
- [ ] Add mobile biometric adapter plan.
- [ ] Validate Tauri Android feasibility with a debug APK.
- [ ] Define Android backup and recovery UX.
