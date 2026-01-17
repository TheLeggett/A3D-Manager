/**
 * IndexedDB Storage Service
 *
 * A type-safe wrapper around IndexedDB using the `idb` library.
 * Provides storage for all browser-based data:
 * - labels.db binary data
 * - Owned cartridges list
 * - Cartridge settings (per-game JSON)
 * - Game pak data (controller pak images)
 * - Game pak backups
 * - User-defined cart names
 * - App preferences
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

// =============================================================================
// Database Schema
// =============================================================================

/**
 * Owned cartridge record
 */
export interface OwnedCartridge {
  cartId: string;
  addedAt: string;
  source: 'sd-card' | 'manual';
}

/**
 * Cartridge settings stored in IndexedDB
 */
export interface StoredSettings {
  cartId: string;
  settings: unknown; // CartridgeSettings type
  lastModified: string;
}

/**
 * Game pak (controller pak) data
 */
export interface StoredGamePak {
  cartId: string;
  data: ArrayBuffer;
  lastModified: string;
}

/**
 * Game pak backup record
 */
export interface GamePakBackup {
  id: string;
  cartId: string;
  name: string;
  description?: string;
  createdAt: string;
  md5Hash: string;
  data: ArrayBuffer;
}

/**
 * User-defined cart name for unknown/homebrew carts
 */
export interface UserCart {
  cartId: string;
  name: string;
  addedAt: string;
}

/**
 * App preferences stored in IndexedDB
 */
export interface AppPreferences {
  key: string;
  value: unknown;
}

/**
 * IndexedDB schema definition
 */
interface A3DManagerDBSchema extends DBSchema {
  // Store the entire labels.db as a single blob
  labelsDb: {
    key: 'labels.db';
    value: {
      key: 'labels.db';
      data: ArrayBuffer;
      lastModified: string;
      entryCount: number;
    };
  };

  // Owned cartridges
  ownedCarts: {
    key: string; // cartId
    value: OwnedCartridge;
    indexes: {
      'by-added-at': string;
      'by-source': string;
    };
  };

  // Cartridge settings (per-game)
  settings: {
    key: string; // cartId
    value: StoredSettings;
    indexes: {
      'by-last-modified': string;
    };
  };

  // Game pak data (controller pak images)
  gamePaks: {
    key: string; // cartId
    value: StoredGamePak;
    indexes: {
      'by-last-modified': string;
    };
  };

  // Game pak backups
  gamePakBackups: {
    key: string; // backup id
    value: GamePakBackup;
    indexes: {
      'by-cart-id': string;
      'by-created-at': string;
    };
  };

  // User-defined cart names
  userCarts: {
    key: string; // cartId
    value: UserCart;
  };

  // App preferences
  preferences: {
    key: string;
    value: AppPreferences;
  };
}

// =============================================================================
// Database Instance
// =============================================================================

const DB_NAME = 'a3d-manager';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<A3DManagerDBSchema> | null = null;

/**
 * Get or create the IndexedDB database instance
 */
export async function getDb(): Promise<IDBPDatabase<A3DManagerDBSchema>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<A3DManagerDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Labels database store
      if (!db.objectStoreNames.contains('labelsDb')) {
        db.createObjectStore('labelsDb', { keyPath: 'key' });
      }

      // Owned carts store
      if (!db.objectStoreNames.contains('ownedCarts')) {
        const ownedStore = db.createObjectStore('ownedCarts', { keyPath: 'cartId' });
        ownedStore.createIndex('by-added-at', 'addedAt');
        ownedStore.createIndex('by-source', 'source');
      }

      // Settings store
      if (!db.objectStoreNames.contains('settings')) {
        const settingsStore = db.createObjectStore('settings', { keyPath: 'cartId' });
        settingsStore.createIndex('by-last-modified', 'lastModified');
      }

      // Game paks store
      if (!db.objectStoreNames.contains('gamePaks')) {
        const gamePaksStore = db.createObjectStore('gamePaks', { keyPath: 'cartId' });
        gamePaksStore.createIndex('by-last-modified', 'lastModified');
      }

      // Game pak backups store
      if (!db.objectStoreNames.contains('gamePakBackups')) {
        const backupsStore = db.createObjectStore('gamePakBackups', { keyPath: 'id' });
        backupsStore.createIndex('by-cart-id', 'cartId');
        backupsStore.createIndex('by-created-at', 'createdAt');
      }

      // User carts store
      if (!db.objectStoreNames.contains('userCarts')) {
        db.createObjectStore('userCarts', { keyPath: 'cartId' });
      }

      // Preferences store
      if (!db.objectStoreNames.contains('preferences')) {
        db.createObjectStore('preferences', { keyPath: 'key' });
      }
    },
  });

  return dbInstance;
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// =============================================================================
// Labels Database Operations
// =============================================================================

/**
 * Get the stored labels.db data
 */
export async function getLabelsDb(): Promise<ArrayBuffer | null> {
  const db = await getDb();
  const record = await db.get('labelsDb', 'labels.db');
  return record?.data || null;
}

/**
 * Get labels.db metadata without loading the full data
 */
export async function getLabelsDbMeta(): Promise<{ lastModified: string; entryCount: number } | null> {
  const db = await getDb();
  const record = await db.get('labelsDb', 'labels.db');
  if (!record) return null;
  return {
    lastModified: record.lastModified,
    entryCount: record.entryCount,
  };
}

/**
 * Store the labels.db data
 */
export async function setLabelsDb(data: ArrayBuffer, entryCount: number): Promise<void> {
  const db = await getDb();
  await db.put('labelsDb', {
    key: 'labels.db',
    data,
    lastModified: new Date().toISOString(),
    entryCount,
  });
}

/**
 * Check if labels.db exists
 */
export async function hasLabelsDb(): Promise<boolean> {
  const db = await getDb();
  const record = await db.get('labelsDb', 'labels.db');
  return !!record;
}

/**
 * Delete labels.db
 */
export async function deleteLabelsDb(): Promise<void> {
  const db = await getDb();
  await db.delete('labelsDb', 'labels.db');
}

// =============================================================================
// Owned Carts Operations
// =============================================================================

/**
 * Get all owned cartridges
 */
export async function getOwnedCarts(): Promise<OwnedCartridge[]> {
  const db = await getDb();
  return db.getAll('ownedCarts');
}

/**
 * Get owned cart IDs only (faster for checking ownership)
 */
export async function getOwnedCartIds(): Promise<string[]> {
  const db = await getDb();
  return db.getAllKeys('ownedCarts');
}

/**
 * Check if a cart is owned
 */
export async function isCartOwned(cartId: string): Promise<boolean> {
  const db = await getDb();
  const record = await db.get('ownedCarts', cartId.toLowerCase());
  return !!record;
}

/**
 * Mark a cart as owned
 */
export async function markCartOwned(cartId: string, source: 'sd-card' | 'manual' = 'manual'): Promise<void> {
  const db = await getDb();
  await db.put('ownedCarts', {
    cartId: cartId.toLowerCase(),
    addedAt: new Date().toISOString(),
    source,
  });
}

/**
 * Mark a cart as not owned
 */
export async function unmarkCartOwned(cartId: string): Promise<void> {
  const db = await getDb();
  await db.delete('ownedCarts', cartId.toLowerCase());
}

/**
 * Get owned carts count
 */
export async function getOwnedCartsCount(): Promise<number> {
  const db = await getDb();
  return db.count('ownedCarts');
}

/**
 * Clear all owned carts
 */
export async function clearOwnedCarts(): Promise<void> {
  const db = await getDb();
  await db.clear('ownedCarts');
}

// =============================================================================
// Settings Operations
// =============================================================================

/**
 * Get settings for a cartridge
 */
export async function getSettings(cartId: string): Promise<StoredSettings | null> {
  const db = await getDb();
  const result = await db.get('settings', cartId.toLowerCase());
  return result ?? null;
}

/**
 * Save settings for a cartridge
 */
export async function saveSettings(cartId: string, settings: unknown): Promise<void> {
  const db = await getDb();
  await db.put('settings', {
    cartId: cartId.toLowerCase(),
    settings,
    lastModified: new Date().toISOString(),
  });
}

/**
 * Delete settings for a cartridge
 */
export async function deleteSettings(cartId: string): Promise<void> {
  const db = await getDb();
  await db.delete('settings', cartId.toLowerCase());
}

/**
 * Get all stored settings
 */
export async function getAllSettings(): Promise<StoredSettings[]> {
  const db = await getDb();
  return db.getAll('settings');
}

/**
 * Get cart IDs that have stored settings
 */
export async function getSettingsCartIds(): Promise<string[]> {
  const db = await getDb();
  return db.getAllKeys('settings');
}

/**
 * Clear all settings
 */
export async function clearAllSettings(): Promise<void> {
  const db = await getDb();
  await db.clear('settings');
}

// =============================================================================
// Game Pak Operations
// =============================================================================

/**
 * Get game pak data for a cartridge
 */
export async function getGamePak(cartId: string): Promise<StoredGamePak | null> {
  const db = await getDb();
  const result = await db.get('gamePaks', cartId.toLowerCase());
  return result ?? null;
}

/**
 * Save game pak data for a cartridge
 */
export async function saveGamePak(cartId: string, data: ArrayBuffer): Promise<void> {
  const db = await getDb();
  await db.put('gamePaks', {
    cartId: cartId.toLowerCase(),
    data,
    lastModified: new Date().toISOString(),
  });
}

/**
 * Delete game pak data for a cartridge
 */
export async function deleteGamePak(cartId: string): Promise<void> {
  const db = await getDb();
  await db.delete('gamePaks', cartId.toLowerCase());
}

/**
 * Get all stored game paks
 */
export async function getAllGamePaks(): Promise<StoredGamePak[]> {
  const db = await getDb();
  return db.getAll('gamePaks');
}

/**
 * Get cart IDs that have stored game paks
 */
export async function getGamePakCartIds(): Promise<string[]> {
  const db = await getDb();
  return db.getAllKeys('gamePaks');
}

/**
 * Clear all game paks
 */
export async function clearAllGamePaks(): Promise<void> {
  const db = await getDb();
  await db.clear('gamePaks');
}

// =============================================================================
// Game Pak Backup Operations
// =============================================================================

/**
 * Get all backups for a cartridge
 */
export async function getBackupsForCart(cartId: string): Promise<GamePakBackup[]> {
  const db = await getDb();
  return db.getAllFromIndex('gamePakBackups', 'by-cart-id', cartId.toLowerCase());
}

/**
 * Get a specific backup by ID
 */
export async function getBackup(backupId: string): Promise<GamePakBackup | null> {
  const db = await getDb();
  const result = await db.get('gamePakBackups', backupId);
  return result ?? null;
}

/**
 * Create a new backup
 */
export async function createBackup(backup: GamePakBackup): Promise<void> {
  const db = await getDb();
  await db.put('gamePakBackups', {
    ...backup,
    cartId: backup.cartId.toLowerCase(),
  });
}

/**
 * Update a backup's metadata
 */
export async function updateBackup(backupId: string, updates: { name?: string; description?: string }): Promise<void> {
  const db = await getDb();
  const backup = await db.get('gamePakBackups', backupId);
  if (!backup) {
    throw new Error(`Backup ${backupId} not found`);
  }

  await db.put('gamePakBackups', {
    ...backup,
    ...updates,
  });
}

/**
 * Delete a backup
 */
export async function deleteBackup(backupId: string): Promise<void> {
  const db = await getDb();
  await db.delete('gamePakBackups', backupId);
}

/**
 * Delete all backups for a cartridge
 */
export async function deleteBackupsForCart(cartId: string): Promise<void> {
  const db = await getDb();
  const backups = await getBackupsForCart(cartId);
  const tx = db.transaction('gamePakBackups', 'readwrite');
  await Promise.all(backups.map(b => tx.store.delete(b.id)));
  await tx.done;
}

/**
 * Clear all backups
 */
export async function clearAllBackups(): Promise<void> {
  const db = await getDb();
  await db.clear('gamePakBackups');
}

// =============================================================================
// User Carts Operations
// =============================================================================

/**
 * Get all user-defined carts
 */
export async function getUserCarts(): Promise<UserCart[]> {
  const db = await getDb();
  return db.getAll('userCarts');
}

/**
 * Get a user-defined cart by ID
 */
export async function getUserCart(cartId: string): Promise<UserCart | null> {
  const db = await getDb();
  const result = await db.get('userCarts', cartId.toLowerCase());
  return result ?? null;
}

/**
 * Add or update a user-defined cart
 */
export async function setUserCart(cartId: string, name: string): Promise<void> {
  const db = await getDb();
  await db.put('userCarts', {
    cartId: cartId.toLowerCase(),
    name,
    addedAt: new Date().toISOString(),
  });
}

/**
 * Delete a user-defined cart
 */
export async function deleteUserCart(cartId: string): Promise<void> {
  const db = await getDb();
  await db.delete('userCarts', cartId.toLowerCase());
}

/**
 * Clear all user-defined carts
 */
export async function clearUserCarts(): Promise<void> {
  const db = await getDb();
  await db.clear('userCarts');
}

// =============================================================================
// Preferences Operations
// =============================================================================

/**
 * Get a preference value
 */
export async function getPreference<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const record = await db.get('preferences', key);
  return (record?.value as T) || null;
}

/**
 * Set a preference value
 */
export async function setPreference<T>(key: string, value: T): Promise<void> {
  const db = await getDb();
  await db.put('preferences', { key, value });
}

/**
 * Delete a preference
 */
export async function deletePreference(key: string): Promise<void> {
  const db = await getDb();
  await db.delete('preferences', key);
}

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * Clear all data from all stores
 */
export async function clearAllData(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.clear('labelsDb'),
    db.clear('ownedCarts'),
    db.clear('settings'),
    db.clear('gamePaks'),
    db.clear('gamePakBackups'),
    db.clear('userCarts'),
    // Don't clear preferences by default
  ]);
}

/**
 * Get storage statistics
 */
export async function getStorageStats(): Promise<{
  hasLabelsDb: boolean;
  labelsEntryCount: number;
  ownedCartsCount: number;
  settingsCount: number;
  gamePaksCount: number;
  backupsCount: number;
  userCartsCount: number;
}> {
  const db = await getDb();

  const [labelsDbMeta, ownedCartsCount, settingsCount, gamePaksCount, backupsCount, userCartsCount] = await Promise.all([
    getLabelsDbMeta(),
    db.count('ownedCarts'),
    db.count('settings'),
    db.count('gamePaks'),
    db.count('gamePakBackups'),
    db.count('userCarts'),
  ]);

  return {
    hasLabelsDb: !!labelsDbMeta,
    labelsEntryCount: labelsDbMeta?.entryCount || 0,
    ownedCartsCount,
    settingsCount,
    gamePaksCount,
    backupsCount,
    userCartsCount,
  };
}

/**
 * Export all data for backup (returns a serializable object)
 */
export async function exportAllData(): Promise<{
  labelsDb: ArrayBuffer | null;
  ownedCarts: OwnedCartridge[];
  settings: StoredSettings[];
  gamePaks: StoredGamePak[];
  backups: GamePakBackup[];
  userCarts: UserCart[];
}> {
  const db = await getDb();

  const [labelsDb, ownedCarts, settings, gamePaks, backups, userCarts] = await Promise.all([
    getLabelsDb(),
    db.getAll('ownedCarts'),
    db.getAll('settings'),
    db.getAll('gamePaks'),
    db.getAll('gamePakBackups'),
    db.getAll('userCarts'),
  ]);

  return { labelsDb, ownedCarts, settings, gamePaks, backups, userCarts };
}
