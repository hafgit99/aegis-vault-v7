# wa-sqlite Final Gate

This gate groups the checks required for the wa-sqlite active backend. Fresh vaults now start on wa-sqlite by default when persistent IndexedDB VFS support is available. Existing OPFS/JSON vaults remain on the legacy backend until the guarded migration flow proves persistence, parity, and restore safety.

## Command

```bash
npm run wa-sqlite:final:gate
```

Fast focused run without Playwright:

```bash
npm run wa-sqlite:final:gate:unit
```

Dry-run command plan:

```bash
npm run wa-sqlite:final:gate:dry
```

## Coverage Map

The gate covers these release-decision questions:

- Promotion writes and restores the active wa-sqlite backend marker only after verified readiness.
- App initialization restores a persisted wa-sqlite backend before hydrating normal storage. Storage-session coverage now proves unlock, backup reads, and import writes continue through the restored repository after initialization.
- Forged, malformed, or scope-mismatched backend markers are cleared and fall back to OPFS.
- Desktop, Android, and browser fallback persistence profiles keep separate database and VFS names.
- OPFS-to-wa-sqlite migration validates source unlock, item identity, target writes, parity, rollback, and persistent reopen checks.
- Active backend migration fails closed when smoke, dry-run, persistent migration candidate, readiness, hydration, or marker writes fail.
- Settings migration UI still exposes the guarded migration action and reports promotion/blocker outcomes.

## Included Tests

Focused Vitest files:

- `src/lib/waSqlitePersistence.test.ts`
- `src/lib/waSqlitePersistenceSmoke.test.ts`
- `src/lib/waSqlitePromotionReadiness.test.ts`
- `src/lib/vaultStorageMigration.test.ts`
- `src/lib/vaultStorageMigrationCandidate.test.ts`
- `src/lib/vaultStorageActiveMigration.test.ts`
- `src/lib/vaultStorageProvider.test.ts`
- `src/lib/waSqliteVaultStorageRepository.test.ts`
- `src/lib/storageSession.test.ts`

Playwright smoke:

- `tests/e2e/vault-smoke.spec.ts` filtered by `wa-sqlite`.

## Default Backend Decision

wa-sqlite default-backend release requirements:

- This final gate passing on the target desktop host.
- Fresh install starts on wa-sqlite and persists the active-backend marker.
- Existing OPFS/JSON vaults are detected and kept on OPFS until the guarded migration succeeds.
- Android smoke testing after promotion remains green.
- Backup/export/import flows work after active backend promotion.
- Release notes state that wa-sqlite is default for fresh vaults and migration-gated for legacy vaults.
