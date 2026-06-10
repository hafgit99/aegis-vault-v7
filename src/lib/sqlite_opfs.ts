/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultItem } from '../types';
import { 
  generateArgon2idHash as generateLegacyArgon2idHash,
  verifyArgon2idHash as verifyLegacyArgon2idHash,
  generateArgon2idKey, 
  hkdfSha256, 
  aes256GcmEncrypt, 
  aes256GcmDecrypt,
  EncryptedPayload
} from './encryption';
import { secureRandomToken } from './random';
import {
  createEmptyVaultDatabaseState,
  normalizeVaultDatabaseState,
  parseVaultDatabaseState,
  type VaultDatabaseRow,
  type VersionedVaultDatabaseState,
} from './vaultDatabaseFormat';
import { createArgon2idHash, verifyArgon2idHash } from './argon2id';
import { deriveArgon2idKey as deriveVettedArgon2idKey } from './argon2id';
import {
  readDesktopVaultDatabase,
  writeDesktopVaultDatabase,
} from './desktopStorage';

/**
 * SQLite simulated schema and data manager storing DB blocks in private OPFS.
 */
export type SQLiteRow = VaultDatabaseRow;

export interface SQLCommandLog {
  id: string;
  timestamp: string;
  query: string;
  status: 'SUCCESS' | 'ERROR';
  rowsAffected: number;
}

const DB_FILENAME = 'aegis_sqlite.db';
const VAULT_ITEM_KDF = 'argon2-browser' as const;
const LEGACY_VAULT_ITEM_KDF = 'legacy-simulated-argon2id' as const;
const VAULT_ITEM_KDF_SALT = 'aegis_vault_v7_db_encryption_salt';
const VAULT_ITEM_KDF_PARAMS = {
  memoryKiB: 64 * 1024,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
};

class SQLiteOPFS {
  private state: VersionedVaultDatabaseState = createEmptyVaultDatabaseState();

  private logs: SQLCommandLog[] = [];
  private onLogsChangedCallbacks: (() => void)[] = [];
  private hydratePromise: Promise<void>;
  private encryptionKeyCache = new Map<string, Uint8Array>();

  constructor() {
    this.hydratePromise = this.loadFromPersistentStorage();
  }

  public async hydrate(): Promise<void> {
    await this.hydratePromise;
  }

  // Registers callback for console query updates
  public subscribeLogs(callback: () => void): () => void {
    this.onLogsChangedCallbacks.push(callback);
    return () => {
      this.onLogsChangedCallbacks = this.onLogsChangedCallbacks.filter(c => c !== callback);
    };
  }

  private notifyLogsChanged() {
    this.onLogsChangedCallbacks.forEach(cb => cb());
  }

  public getQueryLogs(): SQLCommandLog[] {
    return [...this.logs].reverse().slice(0, 50); // Get latest 50 queries
  }

  public logQuery(query: string, status: 'SUCCESS' | 'ERROR', rowsAffected: number) {
    this.logs.push({
      id: secureRandomToken(7),
      timestamp: new Date().toLocaleTimeString(),
      query,
      status,
      rowsAffected,
    });
    this.notifyLogsChanged();
  }

  /**
   * Loads SQLite file from OPFS (Origin Private File System) sandboxed directory.
   */
  private async loadFromPersistentStorage() {
    try {
      const desktopPayload = await readDesktopVaultDatabase();
      if (desktopPayload) {
        this.state = parseVaultDatabaseState(desktopPayload);
        localStorage.setItem('aegis_sqlite_fallback', JSON.stringify(this.state, null, 2));
        this.logQuery(`sqlite3_open("appdata:///${DB_FILENAME}")`, 'SUCCESS', 1);
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
        const root = await navigator.storage.getDirectory();
        let fileHandle;
        try {
          fileHandle = await root.getFileHandle(DB_FILENAME);
        } catch (e) {
          // File does not exist yet. Initialize using localStorage backup or start fresh
          this.migrateLegacyLocalStorage();
          await this.saveToPersistentStorage();
          return;
        }
        
        const file = await fileHandle.getFile();
        const content = await file.text();
        if (content) {
          this.state = parseVaultDatabaseState(content);
          this.logQuery(`sqlite3_open("opfs:///${DB_FILENAME}")`, 'SUCCESS', 1);
          await this.saveToPersistentStorage();
        }
      } else {
        // Fallback to standard sandbox-compliant simulated OPFS persistence
        this.migrateLegacyLocalStorage();
      }
    } catch (err) {
      console.warn("OPFS Loading failed, running in-memory fallback:", err);
      this.migrateLegacyLocalStorage();
    }
  }

  /**
   * Saves raw DB state to private OPFS.
   */
  private async saveToPersistentStorage() {
    try {
      const payloadStr = JSON.stringify(this.state, null, 2);
      
      // Save locally to localStorage as immediate mirror fallback
      localStorage.setItem('aegis_sqlite_fallback', payloadStr);
      await writeDesktopVaultDatabase(payloadStr);

      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(DB_FILENAME, { create: true });
        
        // Use createWritable if supported (standard), or fallback to alternative file APIs
        if ('createWritable' in fileHandle) {
          const writable = await (fileHandle as any).createWritable();
          await writable.write(payloadStr);
          await writable.close();
        } else {
          // Alternative file system writer standard for Safari / some Mobile browsers
          const accessHandle = await (fileHandle as any).createWritable ? await (fileHandle as any).createWritable() : null;
          if (accessHandle) {
            await accessHandle.write(payloadStr);
            await accessHandle.close();
          }
        }
      }
    } catch (err) {
      console.error("Failed writing SQLite persistence block:", err);
    }
  }

  /**
   * Migrate legacy plaintext vault items into relational SQLite rows with GCM encryption.
   */
  private migrateLegacyLocalStorage() {
    const fallback = localStorage.getItem('aegis_sqlite_fallback');
    if (fallback) {
      try {
        this.state = parseVaultDatabaseState(fallback);
        return;
      } catch (e) {}
    }

    // Attempt to seed from standard legacy keys
    const isSetup = localStorage.getItem('aegis_is_setup') === 'true';
    const legacyPass = localStorage.getItem('aegis_master_password');
    const legacyItemsStr = localStorage.getItem('aegis_vault_items');

    if (isSetup && legacyPass && legacyItemsStr) {
      try {
        const passwordPlain = atob(legacyPass);
        const argonHash = generateLegacyArgon2idHash(passwordPlain);
        
        this.state.user_secrets = [{
          username: 'owner',
          argon_hash: argonHash,
        }];

        const items: VaultItem[] = JSON.parse(legacyItemsStr);
        const derivedKey = this.deriveLegacyEncryptionKey(passwordPlain);

        this.state.vault_items = items.map(item => {
          const sensitivePayload = JSON.stringify(item);
          const encrypted = aes256GcmEncrypt(sensitivePayload, derivedKey);
          
          return {
            id: item.id,
            title: item.title,
            category: item.category,
            favorite: item.favorite ? 1 : 0,
            deleted: item.deleted ? 1 : 0,
            deleted_at: item.deletedAt || null,
            created_at: item.createdAt,
            updated_at: item.updatedAt,
            username: item.username || '',
            username_db: '[encrypted: aes-256-gcm]',
            password_db: '[encrypted: aes-256-gcm]',
            notes_db: item.notes ? '[encrypted: aes-256-gcm]' : '',
            enc_metadata: JSON.stringify(encrypted),
            enc_kdf: LEGACY_VAULT_ITEM_KDF,
          };
        });

        this.logQuery('CREATE TABLE vault_items (id TEXT PRIMARY KEY, title TEXT, category TEXT, favorite INTEGER, deleted INTEGER, username_db TEXT, password_db TEXT, enc_metadata TEXT);', 'SUCCESS', this.state.vault_items.length);
      } catch (e) {
        console.error("Migration error:", e);
      }
    }

    this.state = normalizeVaultDatabaseState(this.state);
  }

  /**
   * Verifies the user's password using the strict Argon2id scheme.
   */
  public async verifyPassword(password: string): Promise<boolean> {
    await this.hydrate();
    this.logQuery('SELECT argon_hash FROM user_secrets WHERE username = "owner";', 'SUCCESS', 1);
    if (this.state.user_secrets.length === 0) {
      return false;
    }
    const expectedHash = this.state.user_secrets[0].argon_hash;
    if (expectedHash.startsWith('$argon2id$')) {
      const isVettedMatch = await verifyArgon2idHash(password, expectedHash);
      if (isVettedMatch) {
        await this.prepareEncryptionKey(password);
        return true;
      }
    }

    const isLegacyMatch = verifyLegacyArgon2idHash(password, expectedHash);
    if (isLegacyMatch) {
      this.state.user_secrets[0].argon_hash = await createArgon2idHash(password, secureRandomToken(16));
      await this.prepareEncryptionKey(password);
      await this.saveToPersistentStorage();
    }
    return isLegacyMatch;
  }

  /**
   * Configures primary master verification keys.
   */
  public async setupMaster(password: string): Promise<void> {
    await this.hydrate();
    const argonHash = await createArgon2idHash(password, secureRandomToken(16));
    await this.prepareEncryptionKey(password);
    this.state.user_secrets = [{
      username: 'owner',
      argon_hash: argonHash,
    }];
    this.logQuery('INSERT INTO user_secrets (username, argon_hash) VALUES ("owner", "[argon2id verification hash]");', 'SUCCESS', 1);
    await this.saveToPersistentStorage();
  }

  /**
   * Returns derived encryption key from master password using Argon2id with 32 bytes derived output.
   */
  public async prepareEncryptionKey(password: string): Promise<void> {
    if (this.encryptionKeyCache.has(password)) return;
    const key = await deriveVettedArgon2idKey(password, VAULT_ITEM_KDF_SALT, VAULT_ITEM_KDF_PARAMS);
    this.encryptionKeyCache.set(password, key);
  }

  public deriveEncryptionKey(password: string): Uint8Array {
    const preparedKey = this.encryptionKeyCache.get(password);
    if (!preparedKey) {
      throw new Error('Vault encryption key is not prepared for the active session.');
    }
    return preparedKey;
  }

  private deriveLegacyEncryptionKey(password: string): Uint8Array {
    return generateArgon2idKey(password, 'static_db_salt', 1024, 3, 2, 32);
  }

  /**
   * Retrieves and decrypts SQLite relational items on-the-fly.
   */
  public getVaultItems(masterPasswordPlain: string): VaultItem[] {
    const queryStr = 'SELECT id, title, category, favorite, deleted, username_db, enc_metadata FROM vault_items;';
    
    if (this.state.vault_items.length === 0) {
      this.logQuery(queryStr, 'SUCCESS', 0);
      return [];
    }

    try {
      const derivedKey = this.deriveEncryptionKey(masterPasswordPlain);
      const legacyDerivedKey = this.deriveLegacyEncryptionKey(masterPasswordPlain);
      const list: VaultItem[] = [];
      let migratedLegacyRows = false;

      this.state.vault_items.forEach(row => {
        try {
          const encryptedPayload: EncryptedPayload = JSON.parse(row.enc_metadata);
          const isLegacyRow = row.enc_kdf !== VAULT_ITEM_KDF;
          const decryptedJson = aes256GcmDecrypt(encryptedPayload, isLegacyRow ? legacyDerivedKey : derivedKey);
          const originalItem: VaultItem = JSON.parse(decryptedJson);

          if (isLegacyRow) {
            row.enc_metadata = JSON.stringify(aes256GcmEncrypt(decryptedJson, derivedKey));
            row.enc_kdf = VAULT_ITEM_KDF;
            migratedLegacyRows = true;
          }
          
          // Make sure properties match up correctly
          list.push({
            ...originalItem,
            id: row.id,
            title: row.title,
            category: row.category as any,
            favorite: row.favorite === 1,
            deleted: row.deleted === 1,
            deletedAt: row.deleted_at || undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          });
        } catch (e) {
          // Crypt key mismatch or corruption (return partially decrypted row indicators)
          list.push({
            id: row.id,
            title: row.title,
            username: row.username_db,
            url: '',
            category: row.category as any,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            favorite: row.favorite === 1,
            deleted: row.deleted === 1,
          });
        }
      });

      if (migratedLegacyRows) {
        this.saveToPersistentStorage();
      }

      this.logQuery(queryStr, 'SUCCESS', list.length);
      return list;
    } catch (e) {
      this.logQuery(queryStr, 'ERROR', 0);
      return [];
    }
  }

  /**
   * Saves or updates a specific Item row inside SQLite and OPFS with separate fresh 12-byte GCM IV.
   */
  public saveVaultItem(item: VaultItem, masterPasswordPlain: string): VaultItem[] {
    const derivedKey = this.deriveEncryptionKey(masterPasswordPlain);
    const index = this.state.vault_items.findIndex(x => x.id === item.id);

    // Build fresh serialized payload
    const rawSensitive = JSON.stringify(item);
    // Uses separate secure 12-byte IV for this encryption action automatically inside aes256GcmEncrypt!
    const encrypted = aes256GcmEncrypt(rawSensitive, derivedKey);

    const nowStr = new Date().toISOString().split('T')[0];
    const category = item.category || 'login';

    const row: SQLiteRow = {
      id: item.id || secureRandomToken(9),
      title: item.title || 'İçeri Aktarılan Kayıt',
      category: category,
      favorite: item.favorite ? 1 : 0,
      deleted: item.deleted ? 1 : 0,
      deleted_at: item.deletedAt || null,
      created_at: item.createdAt || nowStr,
      updated_at: nowStr,
      
      // Decrypted display properties
      username: item.username || '',

      // SQLite visible values (completely masked for security)
      username_db: '[encrypted: aes-256-gcm]',
      password_db: '[encrypted: aes-256-gcm]',
      notes_db: item.notes ? '[encrypted: aes-256-gcm]' : '',
      
      enc_metadata: JSON.stringify(encrypted),
      enc_kdf: VAULT_ITEM_KDF,
    };

    let query = '';
    if (index > -1) {
      this.state.vault_items[index] = row;
      query = `UPDATE vault_items SET title = "${row.title}", category = "${row.category}", enc_metadata = "[encrypted metadata payload]" WHERE id = "${row.id}";`;
    } else {
      this.state.vault_items.push(row);
      query = `INSERT INTO vault_items (id, title, category, favorite, username_db, password_db, enc_metadata) VALUES ("${row.id}", "${row.title}", "${row.category}", ${row.favorite}, "${row.username_db}", "${row.password_db}", "[encrypted metadata]");`;
    }

    this.logQuery(query, 'SUCCESS', 1);
    this.saveToPersistentStorage();
    return this.getVaultItems(masterPasswordPlain);
  }

  /**
   * SQL Parser implementation simulating typical queries execution.
   * Useful for the Interactive SQL Command Terminal inside Settings/Audit!
   */
  public executeCustomSQL(sql: string, masterPasswordPlain: string): { columns: string[]; rows: any[][]; error?: string } {
    const sanitized = sql.trim().replace(/;$/, '');
    const tokens = sanitized.split(/\s+/);
    
    if (tokens.length === 0) {
      return { columns: [], rows: [] };
    }

    const command = tokens[0].toUpperCase();

    if (command === 'SELECT') {
      // 1. SELECT * FROM user_secrets
      if (sanitized.toUpperCase().includes('USER_SECRETS')) {
        this.logQuery(sql, 'SUCCESS', this.state.user_secrets.length);
        return {
          columns: ['username', 'argon_hash'],
          rows: this.state.user_secrets.map(s => [s.username, s.argon_hash])
        };
      }

      // 2. SELECT * FROM vault_items
      if (sanitized.toUpperCase().includes('VAULT_ITEMS')) {
        let itemsToUse = this.state.vault_items;
        
        // Handle filter WHERE deleted = 0
        if (sanitized.toUpperCase().includes('WHERE DELETED = 0')) {
          itemsToUse = itemsToUse.filter(i => i.deleted === 0);
        } else if (sanitized.toUpperCase().includes('WHERE DELETED = 1')) {
          itemsToUse = itemsToUse.filter(i => i.deleted === 1);
        }

        const isAsterisk = tokens[1] === '*';
        
        this.logQuery(sql, 'SUCCESS', itemsToUse.length);
        
        if (isAsterisk) {
          return {
            columns: ['id', 'title', 'category', 'favorite', 'deleted', 'username_db', 'password_db', 'notes_db', 'enc_metadata'],
            rows: itemsToUse.map(i => [
              i.id,
              i.title,
              i.category,
              i.favorite,
              i.deleted,
              i.username_db,
              i.password_db,
              i.notes_db ? i.notes_db : 'NULL',
              i.enc_metadata.substring(0, 32) + '...'
            ])
          };
        } else {
          // Parse columns e.g. SELECT id, title, category FROM
          const selectPart = sanitized.toUpperCase().split('FROM')[0];
          const cols = selectPart.replace('SELECT', '').split(',').map(c => c.trim().toLowerCase());
          
          return {
            columns: cols,
            rows: itemsToUse.map(i => {
              return cols.map(c => {
                if (c === 'id') return i.id;
                if (c === 'title') return i.title;
                if (c === 'category') return i.category;
                if (c === 'favorite') return i.favorite;
                if (c === 'deleted') return i.deleted;
                if (c === 'username_db' || c === 'username') return i.username_db;
                if (c === 'password_db' || c === 'password') return i.password_db;
                if (c === 'enc_metadata') return i.enc_metadata.substring(0, 32) + '...';
                return 'NULL';
              });
            })
          };
        }
      }

      return { columns: [], rows: [], error: "Sadece 'user_secrets' ve 'vault_items' tabloları desteklenmektedir." };
    }

    if (command === 'UPDATE' || command === 'DELETE' || command === 'INSERT') {
      this.logQuery(sql, 'ERROR', 0);
      return { columns: [], rows: [], error: "Güvenlik kısıtlamaları dolayısıyla SQLite Terminali üzerinden doğrudan yazma (INSERT/UPDATE/DELETE) işlemleri devre dışı bırakılmıştır. Lütfen ana arayüzü kullanın." };
    }

    this.logQuery(sql, 'ERROR', 0);
    return { columns: [], rows: [], error: `Tanımlanamayan SQL komutu: "${command}". Sadece SELECT sorguları desteklenmektedir.` };
  }

  /**
   * Resets entire SQLite database schemas.
   */
  public resetAll() {
    this.state = createEmptyVaultDatabaseState();
    this.encryptionKeyCache.clear();
    this.logQuery('DROP TABLE user_secrets; DROP TABLE vault_items;', 'SUCCESS', 1);
    this.saveToPersistentStorage();
  }

  /**
   * Permanently purges an item
   */
  public deletePermanently(id: string, passwordPlain: string): VaultItem[] {
    this.state.vault_items = this.state.vault_items.filter(row => row.id !== id);
    this.logQuery(`DELETE FROM vault_items WHERE id = "${id}";`, 'SUCCESS', 1);
    this.saveToPersistentStorage();
    return this.getVaultItems(passwordPlain);
  }

  /**
   * Seeds demo data.
   */
  public reseedDemo(passwordPlain: string, demoItems: VaultItem[]): VaultItem[] {
    const derivedKey = this.deriveEncryptionKey(passwordPlain);
    
    this.state.vault_items = demoItems.map(item => {
      const sensitivePayload = JSON.stringify(item);
      const encrypted = aes256GcmEncrypt(sensitivePayload, derivedKey);
      
      return {
        id: item.id,
        title: item.title,
        category: item.category,
        favorite: item.favorite ? 1 : 0,
        deleted: item.deleted ? 1 : 0,
        deleted_at: item.deletedAt || null,
        created_at: item.createdAt || new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString().split('T')[0],
        username: item.username || '',
        username_db: '[encrypted: aes-256-gcm]',
        password_db: '[encrypted: aes-256-gcm]',
        notes_db: item.notes ? '[encrypted: aes-256-gcm]' : '',
        enc_metadata: JSON.stringify(encrypted),
        enc_kdf: VAULT_ITEM_KDF,
      };
    });

    this.logQuery(`RESEED: INSERT ${demoItems.length} rows into 'vault_items'`, 'SUCCESS', demoItems.length);
    this.saveToPersistentStorage();
    return this.getVaultItems(passwordPlain);
  }
}

export const sqliteOPFSInstance = new SQLiteOPFS();
