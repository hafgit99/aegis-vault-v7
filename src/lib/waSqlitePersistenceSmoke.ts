/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createWaSqliteEngine, type WaSqliteEngine } from './waSqliteEngine';
import { createWaSqlitePersistenceProfile, type WaSqlitePersistenceProfile } from './waSqlitePersistence';

export type WaSqlitePersistenceSmokeStatus = 'passed' | 'failed';

export interface WaSqlitePersistenceSmokeResult {
  status: WaSqlitePersistenceSmokeStatus;
  databaseName: string;
  vfsName: string | null;
  issue?: string;
}

interface WaSqlitePersistenceSmokeOptions {
  persistenceProfile?: WaSqlitePersistenceProfile;
  createEngine?: (profile: WaSqlitePersistenceProfile) => WaSqliteEngine;
  smokeValue?: string;
}

const SMOKE_TABLE = 'aegis_persistence_smoke';

export async function verifyWaSqlitePersistentVfsSmoke(
  options: WaSqlitePersistenceSmokeOptions = {},
): Promise<WaSqlitePersistenceSmokeResult> {
  const persistenceProfile = options.persistenceProfile ?? createWaSqlitePersistenceProfile();
  const createEngine = options.createEngine ?? ((profile) => createWaSqliteEngine({ persistenceProfile: profile }));
  const smokeValue = options.smokeValue ?? `smoke-${Date.now()}`;

  if (!persistenceProfile.persistentVfsReady) {
    return failed(persistenceProfile, 'wa-sqlite-persistent-vfs-not-ready');
  }

  const writer = createEngine(persistenceProfile);
  try {
    await writer.initialize();
    const writeResult = await writer.execute(`
      CREATE TABLE IF NOT EXISTS ${SMOKE_TABLE} (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR REPLACE INTO ${SMOKE_TABLE} (id, value) VALUES (1, '${escapeSqlLiteral(smokeValue)}');
    `);
    if (writeResult.error) {
      return failed(persistenceProfile, writeResult.error);
    }
  } catch (error) {
    return failed(persistenceProfile, errorMessage(error, 'wa-sqlite-persistence-smoke-write-failed'));
  } finally {
    await closeQuietly(writer);
  }

  const reader = createEngine(persistenceProfile);
  try {
    await reader.initialize();
    const readResult = await reader.executeReadOnly(
      `SELECT value FROM ${SMOKE_TABLE} WHERE id = 1;`,
    );
    if (readResult.error) {
      return failed(persistenceProfile, readResult.error);
    }

    if (readResult.rows[0]?.[0] !== smokeValue) {
      return failed(persistenceProfile, 'wa-sqlite-persistence-smoke-mismatch');
    }
  } catch (error) {
    return failed(persistenceProfile, errorMessage(error, 'wa-sqlite-persistence-smoke-read-failed'));
  } finally {
    await closeQuietly(reader);
  }

  return {
    status: 'passed',
    databaseName: persistenceProfile.databaseName,
    vfsName: persistenceProfile.vfsName,
  };
}

function failed(profile: WaSqlitePersistenceProfile, issue: string): WaSqlitePersistenceSmokeResult {
  return {
    status: 'failed',
    databaseName: profile.databaseName,
    vfsName: profile.vfsName,
    issue,
  };
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function closeQuietly(engine: WaSqliteEngine): Promise<void> {
  try {
    await engine.close();
  } catch {
    // Smoke verification must report the write/read failure, not cleanup noise.
  }
}
