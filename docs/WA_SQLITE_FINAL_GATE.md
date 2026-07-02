# wa-sqlite Final Gate

This gate groups the checks required before wa-sqlite can be considered for default active-backend promotion. The backend is still intentionally gated; passing this command does not by itself make wa-sqlite the default storage engine.

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
- App initialization restores a persisted wa-sqlite backend before hydrating normal storage. Storage-session coverage now proves unlock, reads, and writes continue through the restored repository after initialization.
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

Before making wa-sqlite the default backend, require:

- This final gate passing on the target desktop host.
- Android smoke testing after promotion remains green.
- Backup/export/import flows work after active backend promotion.
- Release notes clearly state whether wa-sqlite is default or opt-in migration-only.
