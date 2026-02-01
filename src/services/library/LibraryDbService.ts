/**
 * LibraryDbService.ts
 *
 * Browser-based service for parsing and managing library.db files.
 * Handles ArrayBuffer operations for File System Access API integration.
 *
 * library.db Format (3D OS 1.2.0):
 * ───────────────────────────────────────────────────
 * Offset    Size     Description
 * ───────────────────────────────────────────────────
 * 0x00      1        Magic byte (0x07)
 * 0x01      31       "Analogue-Co" (null-padded)
 * 0x20      32       "Analogue-3D.library" (null-padded)
 * 0x40      4        Version (0x00010000)
 * 0x44-0xFF          Reserved (zeros)
 *
 * 0x100     N×4      Cart ID table (little-endian, 0xFFFFFFFF = empty)
 *
 * 0x4100    N×12     Extended data (per cart slot):
 *                    - Bytes 0-3: addedTime (Unix timestamp ÷ 60, i.e., minutes since Jan 1, 1970)
 *                    - Bytes 4-7: playTime (seconds)
 *                    - Bytes 8-11: sessions (number of times game was launched)
 */

import {
  getLibraryDb,
  setLibraryDb,
  hasLibraryDb,
  deleteLibraryDb,
  getLibraryDbMeta,
} from '../storage/IndexedDbStorage';
import { writeLibraryDbToSD } from '../sd-card/SdCardService';
import type { BrowserSDCard } from '../sd-card/SdCardService';
import type {
  LibraryEntry,
  LibraryDatabase,
  EnrichedLibraryEntry,
  CartridgeLibraryStats,
  LibrarySyncStatus,
} from '../../types/library';

// =============================================================================
// Constants
// =============================================================================

/** Magic byte at start of library.db */
export const LIBRARY_DB_MAGIC_BYTE = 0x07;

/** Identifier string at offset 0x01 */
export const LIBRARY_DB_IDENTIFIER_1 = 'Analogue-Co';

/** Identifier string at offset 0x20 */
export const LIBRARY_DB_IDENTIFIER_2 = 'Analogue-3D.library';

/** Expected version number */
export const LIBRARY_DB_VERSION = 0x00010000;

/** Start of the cart ID table */
export const LIBRARY_DB_ID_TABLE_START = 0x100;

/** Start of the extended data (stats) section */
export const LIBRARY_DB_DATA_START = 0x4100;

/** Number of cart slots in the library */
export const LIBRARY_DB_MAX_ENTRIES = 4096;

/** Size of each cart ID entry (4 bytes) */
export const LIBRARY_DB_ID_SIZE = 4;

/** Size of each extended data entry (12 bytes) */
export const LIBRARY_DB_ENTRY_SIZE = 12;

/** Empty slot marker */
export const LIBRARY_DB_EMPTY_SLOT = 0xffffffff;

/** Total expected file size */
export const LIBRARY_DB_FILE_SIZE =
  LIBRARY_DB_DATA_START + LIBRARY_DB_MAX_ENTRIES * LIBRARY_DB_ENTRY_SIZE;

/**
 * The Analogue 3D stores addedTime as Unix timestamp ÷ 60 (minutes since Jan 1, 1970).
 * There is no custom epoch - times are stored in minutes since Unix epoch.
 */

/** Path to library.db on SD card relative to root */
export const LIBRARY_DB_SD_PATH = 'Library/N64/library.db';

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert a cart ID number to an 8-character hex string
 */
export function cartIdToHex(cartId: number): string {
  return cartId.toString(16).padStart(8, '0').toLowerCase();
}

/**
 * Convert an 8-character hex string to a cart ID number
 */
export function hexToCartId(hex: string): number {
  return parseInt(hex, 16);
}

/**
 * Format play time in seconds to a human-readable string
 * @param seconds Total seconds played
 * @returns Formatted string like "5h 21m" or "3m 9s" or "0m"
 */
export function formatPlayTime(seconds: number): string {
  if (seconds === 0) return '0m';
  if (seconds < 60) return `${seconds}s`;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours === 0) {
    if (secs === 0) return `${minutes}m`;
    return `${minutes}m ${secs}s`;
  }

  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Convert a library.db addedTime (minutes since Unix epoch) to a Date
 */
export function timestampToDate(addedTime: number): Date {
  return new Date(addedTime * 60 * 1000);
}

/**
 * Convert a Date to a library.db addedTime (minutes since Unix epoch)
 */
export function dateToTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000 / 60);
}

/**
 * Format file size for display
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// =============================================================================
// Header Verification
// =============================================================================

/**
 * Verify that an ArrayBuffer contains a valid library.db header
 */
export function verifyHeader(data: ArrayBuffer): { valid: boolean; error?: string } {
  const view = new DataView(data);

  // Check minimum size
  if (data.byteLength < LIBRARY_DB_DATA_START) {
    return {
      valid: false,
      error: `File too small: expected at least ${LIBRARY_DB_DATA_START} bytes, got ${data.byteLength}`,
    };
  }

  // Check magic byte
  const magicByte = view.getUint8(0);
  if (magicByte !== LIBRARY_DB_MAGIC_BYTE) {
    return {
      valid: false,
      error: `Invalid magic byte: expected 0x${LIBRARY_DB_MAGIC_BYTE.toString(16).padStart(2, '0')}, got 0x${magicByte.toString(16).padStart(2, '0')}`,
    };
  }

  // Check first identifier (Analogue-Co)
  const id1Bytes = new Uint8Array(data, 0x01, LIBRARY_DB_IDENTIFIER_1.length);
  const id1 = String.fromCharCode(...id1Bytes);
  if (id1 !== LIBRARY_DB_IDENTIFIER_1) {
    return {
      valid: false,
      error: `Invalid identifier 1: expected "${LIBRARY_DB_IDENTIFIER_1}", got "${id1}"`,
    };
  }

  // Check second identifier (Analogue-3D.library)
  const id2Bytes = new Uint8Array(data, 0x20, LIBRARY_DB_IDENTIFIER_2.length);
  const id2 = String.fromCharCode(...id2Bytes);
  if (id2 !== LIBRARY_DB_IDENTIFIER_2) {
    return {
      valid: false,
      error: `Invalid identifier 2: expected "${LIBRARY_DB_IDENTIFIER_2}", got "${id2}"`,
    };
  }

  // Check version
  const version = view.getUint32(0x40, true); // little-endian
  if (version !== LIBRARY_DB_VERSION) {
    return {
      valid: false,
      error: `Unknown version: expected 0x${LIBRARY_DB_VERSION.toString(16).padStart(8, '0')}, got 0x${version.toString(16).padStart(8, '0')}`,
    };
  }

  return { valid: true };
}

// =============================================================================
// Parsing
// =============================================================================

/**
 * Parse a library.db ArrayBuffer into a LibraryDatabase object
 */
export function parseLibraryDb(data: ArrayBuffer): LibraryDatabase {
  const verification = verifyHeader(data);
  if (!verification.valid) {
    throw new Error(`Invalid library.db: ${verification.error}`);
  }

  const view = new DataView(data);
  const entries: LibraryEntry[] = [];
  const idToIndex = new Map<number, number>();

  // Read all entries
  for (let i = 0; i < LIBRARY_DB_MAX_ENTRIES; i++) {
    // Read cart ID from ID table
    const idOffset = LIBRARY_DB_ID_TABLE_START + i * LIBRARY_DB_ID_SIZE;
    const cartId = view.getUint32(idOffset, true); // little-endian

    // Skip empty slots
    if (cartId === LIBRARY_DB_EMPTY_SLOT) {
      continue;
    }

    // Read extended data
    const dataOffset = LIBRARY_DB_DATA_START + i * LIBRARY_DB_ENTRY_SIZE;
    const addedTime = view.getUint32(dataOffset, true);
    const playTime = view.getUint32(dataOffset + 4, true);
    const sessions = view.getUint32(dataOffset + 8, true);

    const entry: LibraryEntry = {
      cartId,
      cartIdHex: cartIdToHex(cartId),
      index: i,
      addedTime,
      playTime,
      sessions,
    };

    entries.push(entry);
    idToIndex.set(cartId, i);
  }

  return {
    entryCount: entries.length,
    entries,
    idToIndex,
  };
}

/**
 * Get a single entry by cart ID from an ArrayBuffer
 */
export function getEntryByCartId(
  data: ArrayBuffer,
  cartId: number
): LibraryEntry | null {
  const verification = verifyHeader(data);
  if (!verification.valid) {
    throw new Error(`Invalid library.db: ${verification.error}`);
  }

  const view = new DataView(data);

  // Search the ID table for this cart ID
  for (let i = 0; i < LIBRARY_DB_MAX_ENTRIES; i++) {
    const idOffset = LIBRARY_DB_ID_TABLE_START + i * LIBRARY_DB_ID_SIZE;
    const id = view.getUint32(idOffset, true);

    if (id === cartId) {
      const dataOffset = LIBRARY_DB_DATA_START + i * LIBRARY_DB_ENTRY_SIZE;
      const addedTime = view.getUint32(dataOffset, true);
      const playTime = view.getUint32(dataOffset + 4, true);
      const sessions = view.getUint32(dataOffset + 8, true);

      return {
        cartId,
        cartIdHex: cartIdToHex(cartId),
        index: i,
        addedTime,
        playTime,
        sessions,
      };
    }
  }

  return null;
}

/**
 * Enrich an entry with formatted data
 */
export function enrichEntry(entry: LibraryEntry, name?: string): EnrichedLibraryEntry {
  return {
    ...entry,
    name,
    addedDate: timestampToDate(entry.addedTime).toISOString(),
    playTimeFormatted: formatPlayTime(entry.playTime),
  };
}

// =============================================================================
// Creation
// =============================================================================

/**
 * Create a new empty library.db with proper headers
 */
export function createEmptyLibraryDb(): ArrayBuffer {
  const data = new ArrayBuffer(LIBRARY_DB_FILE_SIZE);
  const view = new DataView(data);
  const bytes = new Uint8Array(data);

  // Write magic byte
  view.setUint8(0, LIBRARY_DB_MAGIC_BYTE);

  // Write identifier 1: "Analogue-Co" at offset 0x01
  for (let i = 0; i < LIBRARY_DB_IDENTIFIER_1.length; i++) {
    bytes[0x01 + i] = LIBRARY_DB_IDENTIFIER_1.charCodeAt(i);
  }

  // Write identifier 2: "Analogue-3D.library" at offset 0x20
  for (let i = 0; i < LIBRARY_DB_IDENTIFIER_2.length; i++) {
    bytes[0x20 + i] = LIBRARY_DB_IDENTIFIER_2.charCodeAt(i);
  }

  // Write version at offset 0x40 (little-endian)
  view.setUint32(0x40, LIBRARY_DB_VERSION, true);

  // Fill ID table with empty slot markers (0xFFFFFFFF)
  for (let i = 0; i < LIBRARY_DB_MAX_ENTRIES; i++) {
    const idOffset = LIBRARY_DB_ID_TABLE_START + i * LIBRARY_DB_ID_SIZE;
    view.setUint32(idOffset, LIBRARY_DB_EMPTY_SLOT, true);
  }

  // Extended data section is already zeros from ArrayBuffer initialization

  return data;
}

/**
 * Add a new entry to a library.db ArrayBuffer
 * Returns a new ArrayBuffer with the entry added
 * Throws if the entry already exists or library is full
 */
export function addEntry(
  data: ArrayBuffer,
  cartId: number,
  stats: { addedTime: number; playTime: number; sessions?: number }
): ArrayBuffer {
  const verification = verifyHeader(data);
  if (!verification.valid) {
    throw new Error(`Invalid library.db: ${verification.error}`);
  }

  const view = new DataView(data);

  // Check if entry already exists and find first empty slot
  let emptySlotIndex = -1;
  for (let i = 0; i < LIBRARY_DB_MAX_ENTRIES; i++) {
    const idOffset = LIBRARY_DB_ID_TABLE_START + i * LIBRARY_DB_ID_SIZE;
    const id = view.getUint32(idOffset, true);

    if (id === cartId) {
      throw new Error(`Cart ID ${cartIdToHex(cartId)} already exists in library.db`);
    }

    if (id === LIBRARY_DB_EMPTY_SLOT && emptySlotIndex === -1) {
      emptySlotIndex = i;
    }
  }

  if (emptySlotIndex === -1) {
    throw new Error('Library is full (4096 entries maximum)');
  }

  // Create a copy of the buffer
  const newData = data.slice(0);
  const newView = new DataView(newData);

  // Write cart ID to ID table
  const idOffset = LIBRARY_DB_ID_TABLE_START + emptySlotIndex * LIBRARY_DB_ID_SIZE;
  newView.setUint32(idOffset, cartId, true);

  // Write extended data
  const dataOffset = LIBRARY_DB_DATA_START + emptySlotIndex * LIBRARY_DB_ENTRY_SIZE;
  newView.setUint32(dataOffset, stats.addedTime, true);
  newView.setUint32(dataOffset + 4, stats.playTime, true);
  newView.setUint32(dataOffset + 8, stats.sessions ?? 0, true);

  return newData;
}

// =============================================================================
// Modification
// =============================================================================

/**
 * Update an existing entry's stats in a library.db ArrayBuffer
 * Returns a new ArrayBuffer with the updated data
 */
export function updateEntry(
  data: ArrayBuffer,
  cartId: number,
  updates: { addedTime?: number; playTime?: number; sessions?: number }
): ArrayBuffer {
  const verification = verifyHeader(data);
  if (!verification.valid) {
    throw new Error(`Invalid library.db: ${verification.error}`);
  }

  const view = new DataView(data);

  // Find the entry
  let entryIndex = -1;
  for (let i = 0; i < LIBRARY_DB_MAX_ENTRIES; i++) {
    const idOffset = LIBRARY_DB_ID_TABLE_START + i * LIBRARY_DB_ID_SIZE;
    const id = view.getUint32(idOffset, true);

    if (id === cartId) {
      entryIndex = i;
      break;
    }
  }

  if (entryIndex === -1) {
    throw new Error(`Cart ID ${cartIdToHex(cartId)} not found in library.db`);
  }

  // Create a copy of the buffer
  const newData = data.slice(0);
  const newView = new DataView(newData);

  // Update the extended data
  const dataOffset = LIBRARY_DB_DATA_START + entryIndex * LIBRARY_DB_ENTRY_SIZE;

  if (updates.addedTime !== undefined) {
    newView.setUint32(dataOffset, updates.addedTime, true);
  }

  if (updates.playTime !== undefined) {
    newView.setUint32(dataOffset + 4, updates.playTime, true);
  }

  if (updates.sessions !== undefined) {
    newView.setUint32(dataOffset + 8, updates.sessions, true);
  }

  return newData;
}

// =============================================================================
// IndexedDB Operations
// =============================================================================

/**
 * Check if library.db is stored locally
 */
export async function hasLocalLibraryDb(): Promise<boolean> {
  return hasLibraryDb();
}

/**
 * Get local library.db data
 */
export async function getLocalLibraryDb(): Promise<ArrayBuffer | null> {
  return getLibraryDb();
}

/**
 * Get local library.db metadata
 */
export async function getLocalLibraryDbInfo(): Promise<{
  exists: boolean;
  entryCount: number;
  fileSize: number;
  lastModified?: Date;
} | null> {
  const meta = await getLibraryDbMeta();
  if (!meta) {
    return { exists: false, entryCount: 0, fileSize: 0 };
  }

  const data = await getLibraryDb();
  return {
    exists: true,
    entryCount: meta.entryCount,
    fileSize: data?.byteLength ?? 0,
    lastModified: new Date(meta.lastModified),
  };
}

/**
 * Save library.db to local storage
 */
export async function saveLocalLibraryDb(data: ArrayBuffer): Promise<void> {
  const verification = verifyHeader(data);
  if (!verification.valid) {
    throw new Error(`Invalid library.db: ${verification.error}`);
  }

  const library = parseLibraryDb(data);
  await setLibraryDb(data, library.entryCount);
}

/**
 * Delete local library.db
 */
export async function deleteLocalLibraryDb(): Promise<void> {
  await deleteLibraryDb();
}

/**
 * Update the local library.db's lastModified timestamp without changing data.
 * Useful after uploading to SD card to keep timestamps in sync.
 */
export async function touchLocalLibraryDb(): Promise<void> {
  const data = await getLibraryDb();
  if (!data) {
    return; // Nothing to touch
  }
  const library = parseLibraryDb(data);
  await setLibraryDb(data, library.entryCount);
}

/**
 * Update a single entry and save to local storage
 */
export async function updateAndSaveEntry(
  cartId: number,
  updates: { addedTime?: number; playTime?: number; sessions?: number }
): Promise<void> {
  const data = await getLibraryDb();
  if (!data) {
    throw new Error('No local library.db exists');
  }

  const updatedData = updateEntry(data, cartId, updates);
  const library = parseLibraryDb(updatedData);
  await setLibraryDb(updatedData, library.entryCount);
}

/**
 * Add a new entry to local storage, creating library.db if it doesn't exist
 */
export async function addAndSaveEntry(
  cartId: number,
  stats: { addedTime: number; playTime: number }
): Promise<void> {
  let data = await getLibraryDb();

  // Create empty library.db if it doesn't exist
  if (!data) {
    data = createEmptyLibraryDb();
  }

  const updatedData = addEntry(data, cartId, stats);
  const library = parseLibraryDb(updatedData);
  await setLibraryDb(updatedData, library.entryCount);
}

// =============================================================================
// Sync-aware Operations (auto-sync to SD card when connected)
// =============================================================================

/**
 * Result of a sync-aware operation
 */
export interface SyncResult {
  localUpdated: boolean;
  sdUpdated: boolean;
  sdError?: string;
}

/**
 * Update a single entry and sync to SD card if provided.
 * Individual edits always write to both local AND SD card when connected.
 */
export async function updateAndSaveEntryWithSync(
  cartId: number,
  updates: { addedTime?: number; playTime?: number; sessions?: number },
  sdCard?: BrowserSDCard
): Promise<SyncResult> {
  // 1. Update local IndexedDB
  await updateAndSaveEntry(cartId, updates);

  // 2. If SD card provided, also write to SD
  if (sdCard) {
    try {
      const updatedData = await getLocalLibraryDb();
      if (updatedData) {
        await writeLibraryDbToSD(sdCard, updatedData);
        return { localUpdated: true, sdUpdated: true };
      }
    } catch (err) {
      // Log but don't fail - local update succeeded
      console.error('Auto-sync to SD failed:', err);
      return {
        localUpdated: true,
        sdUpdated: false,
        sdError: err instanceof Error ? err.message : 'Failed to sync to SD card',
      };
    }
  }

  return { localUpdated: true, sdUpdated: false };
}

/**
 * Add a new entry and sync to SD card if provided.
 * Individual additions always write to both local AND SD card when connected.
 */
export async function addAndSaveEntryWithSync(
  cartId: number,
  stats: { addedTime: number; playTime: number; sessions?: number },
  sdCard?: BrowserSDCard
): Promise<SyncResult> {
  // 1. Add to local IndexedDB
  await addAndSaveEntry(cartId, stats);

  // 2. If SD card provided, also write to SD
  if (sdCard) {
    try {
      const updatedData = await getLocalLibraryDb();
      if (updatedData) {
        await writeLibraryDbToSD(sdCard, updatedData);
        return { localUpdated: true, sdUpdated: true };
      }
    } catch (err) {
      // Log but don't fail - local update succeeded
      console.error('Auto-sync to SD failed:', err);
      return {
        localUpdated: true,
        sdUpdated: false,
        sdError: err instanceof Error ? err.message : 'Failed to sync to SD card',
      };
    }
  }

  return { localUpdated: true, sdUpdated: false };
}

// =============================================================================
// Stats Helpers
// =============================================================================

/**
 * Get play stats for a single cartridge by its hex cart ID
 */
export async function getCartridgeStats(cartIdHex: string): Promise<CartridgeLibraryStats> {
  const data = await getLibraryDb();
  if (!data) {
    return { hasStats: false };
  }

  const cartId = hexToCartId(cartIdHex);
  const entry = getEntryByCartId(data, cartId);

  if (!entry) {
    return { hasStats: false };
  }

  return {
    hasStats: true,
    addedTime: entry.addedTime,
    addedDate: timestampToDate(entry.addedTime),
    playTime: entry.playTime,
    playTimeFormatted: formatPlayTime(entry.playTime),
    sessions: entry.sessions,
  };
}

/**
 * Get all entries with enriched data
 */
export async function getAllEntriesEnriched(
  nameLookup?: (cartIdHex: string) => string | undefined
): Promise<EnrichedLibraryEntry[]> {
  const data = await getLibraryDb();
  if (!data) {
    return [];
  }

  const library = parseLibraryDb(data);
  return library.entries.map((entry) =>
    enrichEntry(entry, nameLookup?.(entry.cartIdHex))
  );
}

// =============================================================================
// Comparison
// =============================================================================

/**
 * Compare local vs SD library.db based on metadata
 */
export function compareQuick(
  localInfo: { exists: boolean; entryCount: number; fileSize: number; lastModified?: Date } | null,
  sdInfo: { exists: boolean; entryCount: number; fileSize: number; lastModified?: Date } | null
): LibrarySyncStatus {
  const local = {
    exists: localInfo?.exists ?? false,
    entryCount: localInfo?.entryCount ?? 0,
    fileSize: localInfo?.fileSize ?? 0,
    lastModified: localInfo?.lastModified?.toISOString(),
  };

  const sd = {
    exists: sdInfo?.exists ?? false,
    entryCount: sdInfo?.entryCount ?? 0,
    fileSize: sdInfo?.fileSize ?? 0,
    lastModified: sdInfo?.lastModified?.toISOString(),
  };

  // Determine which is newer
  let newerVersion: 'local' | 'sd' | 'same' | 'unknown' = 'unknown';

  if (!local.exists && !sd.exists) {
    newerVersion = 'same';
  } else if (!local.exists && sd.exists) {
    newerVersion = 'sd';
  } else if (local.exists && !sd.exists) {
    newerVersion = 'local';
  } else if (localInfo?.lastModified && sdInfo?.lastModified) {
    const localTime = localInfo.lastModified.getTime();
    const sdTime = sdInfo.lastModified.getTime();

    if (localTime > sdTime) {
      newerVersion = 'local';
    } else if (sdTime > localTime) {
      newerVersion = 'sd';
    } else if (local.fileSize === sd.fileSize && local.entryCount === sd.entryCount) {
      newerVersion = 'same';
    } else {
      newerVersion = 'unknown';
    }
  } else {
    if (local.fileSize === sd.fileSize && local.entryCount === sd.entryCount) {
      newerVersion = 'same';
    }
  }

  return { local, sd, newerVersion };
}
