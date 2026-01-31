/**
 * library-db-core.ts
 *
 * Core parsing, reading, and writing for the Analogue 3D library.db file.
 * This file tracks play statistics (play time, sessions, added date) for cartridges.
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
 *                    - Bytes 0-3: addedTime (seconds since custom epoch)
 *                    - Bytes 4-7: playTime (seconds)
 *                    - Bytes 8-11: sessions (count)
 *
 * Custom Epoch: February 23, 2025 22:43:27 UTC (Unix timestamp 1740350607)
 */

import * as fs from 'fs';
import * as path from 'path';

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

/** Unix timestamp for the custom epoch (Feb 23, 2025 22:43:27 UTC) */
export const LIBRARY_DB_EPOCH_UNIX = 1740350607;

/** Path to library.db on SD card relative to root */
export const LIBRARY_DB_SD_PATH = 'Library/N64/library.db';

/** Local storage directory for library.db backup */
export const LOCAL_STORAGE_DIR = path.join(process.cwd(), '.local-data');

/** Local library.db filename */
export const LOCAL_LIBRARY_DB_FILENAME = 'library.db';

// =============================================================================
// Types
// =============================================================================

/**
 * Represents a single entry in the library database
 */
export interface LibraryEntry {
  /** Cart ID (unique identifier from cart header) */
  cartId: number;
  /** Cart ID as 8-character hex string */
  cartIdHex: string;
  /** Index in the library (0-4095) */
  index: number;
  /** Time added (seconds since custom epoch) */
  addedTime: number;
  /** Total play time in seconds */
  playTime: number;
  /** Number of play sessions */
  sessions: number;
}

/**
 * Represents the parsed library database
 */
export interface LibraryDatabase {
  /** Number of valid entries */
  entryCount: number;
  /** All valid entries */
  entries: LibraryEntry[];
  /** Map from cart ID to index for fast lookup */
  idToIndex: Map<number, number>;
}

/**
 * Result of header verification
 */
export interface HeaderVerificationResult {
  valid: boolean;
  error?: string;
}

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
 * Convert a library.db timestamp (seconds since custom epoch) to a Date
 */
export function timestampToDate(ts: number): Date {
  return new Date((ts + LIBRARY_DB_EPOCH_UNIX) * 1000);
}

/**
 * Convert a Date to a library.db timestamp (seconds since custom epoch)
 */
export function dateToTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000) - LIBRARY_DB_EPOCH_UNIX;
}

// =============================================================================
// Header Verification
// =============================================================================

/**
 * Verify that a buffer contains a valid library.db header
 */
export function verifyHeader(data: Buffer): HeaderVerificationResult {
  // Check minimum size
  if (data.length < LIBRARY_DB_DATA_START) {
    return {
      valid: false,
      error: `File too small: expected at least ${LIBRARY_DB_DATA_START} bytes, got ${data.length}`,
    };
  }

  // Check magic byte
  if (data[0] !== LIBRARY_DB_MAGIC_BYTE) {
    return {
      valid: false,
      error: `Invalid magic byte: expected 0x${LIBRARY_DB_MAGIC_BYTE.toString(16).padStart(2, '0')}, got 0x${data[0].toString(16).padStart(2, '0')}`,
    };
  }

  // Check first identifier (Analogue-Co)
  const id1 = data
    .slice(0x01, 0x01 + LIBRARY_DB_IDENTIFIER_1.length)
    .toString('utf8');
  if (id1 !== LIBRARY_DB_IDENTIFIER_1) {
    return {
      valid: false,
      error: `Invalid identifier 1: expected "${LIBRARY_DB_IDENTIFIER_1}", got "${id1}"`,
    };
  }

  // Check second identifier (Analogue-3D.library)
  const id2 = data
    .slice(0x20, 0x20 + LIBRARY_DB_IDENTIFIER_2.length)
    .toString('utf8');
  if (id2 !== LIBRARY_DB_IDENTIFIER_2) {
    return {
      valid: false,
      error: `Invalid identifier 2: expected "${LIBRARY_DB_IDENTIFIER_2}", got "${id2}"`,
    };
  }

  // Check version
  const version = data.readUInt32LE(0x40);
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
 * Parse a library.db buffer into a LibraryDatabase object
 */
export function parseLibraryDb(data: Buffer): LibraryDatabase {
  const verification = verifyHeader(data);
  if (!verification.valid) {
    throw new Error(`Invalid library.db: ${verification.error}`);
  }

  const entries: LibraryEntry[] = [];
  const idToIndex = new Map<number, number>();

  // Read all entries
  for (let i = 0; i < LIBRARY_DB_MAX_ENTRIES; i++) {
    // Read cart ID from ID table
    const idOffset = LIBRARY_DB_ID_TABLE_START + i * LIBRARY_DB_ID_SIZE;
    const cartId = data.readUInt32LE(idOffset);

    // Skip empty slots
    if (cartId === LIBRARY_DB_EMPTY_SLOT) {
      continue;
    }

    // Read extended data
    const dataOffset = LIBRARY_DB_DATA_START + i * LIBRARY_DB_ENTRY_SIZE;
    const addedTime = data.readUInt32LE(dataOffset);
    const playTime = data.readUInt32LE(dataOffset + 4);
    const sessions = data.readUInt32LE(dataOffset + 8);

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
 * Get a single entry by cart ID
 */
export function getEntryByCartId(
  data: Buffer,
  cartId: number
): LibraryEntry | null {
  const verification = verifyHeader(data);
  if (!verification.valid) {
    throw new Error(`Invalid library.db: ${verification.error}`);
  }

  // Search the ID table for this cart ID
  for (let i = 0; i < LIBRARY_DB_MAX_ENTRIES; i++) {
    const idOffset = LIBRARY_DB_ID_TABLE_START + i * LIBRARY_DB_ID_SIZE;
    const id = data.readUInt32LE(idOffset);

    if (id === cartId) {
      const dataOffset = LIBRARY_DB_DATA_START + i * LIBRARY_DB_ENTRY_SIZE;
      const addedTime = data.readUInt32LE(dataOffset);
      const playTime = data.readUInt32LE(dataOffset + 4);
      const sessions = data.readUInt32LE(dataOffset + 8);

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

// =============================================================================
// Modification
// =============================================================================

/**
 * Update an existing entry's stats in a library.db buffer
 * Returns a new buffer with the updated data
 */
export function updateEntry(
  data: Buffer,
  cartId: number,
  updates: { addedTime?: number; playTime?: number; sessions?: number }
): Buffer {
  const verification = verifyHeader(data);
  if (!verification.valid) {
    throw new Error(`Invalid library.db: ${verification.error}`);
  }

  // Find the entry
  let entryIndex = -1;
  for (let i = 0; i < LIBRARY_DB_MAX_ENTRIES; i++) {
    const idOffset = LIBRARY_DB_ID_TABLE_START + i * LIBRARY_DB_ID_SIZE;
    const id = data.readUInt32LE(idOffset);

    if (id === cartId) {
      entryIndex = i;
      break;
    }
  }

  if (entryIndex === -1) {
    throw new Error(
      `Cart ID ${cartIdToHex(cartId)} not found in library.db`
    );
  }

  // Create a copy of the buffer
  const newData = Buffer.from(data);

  // Update the extended data
  const dataOffset = LIBRARY_DB_DATA_START + entryIndex * LIBRARY_DB_ENTRY_SIZE;

  if (updates.addedTime !== undefined) {
    newData.writeUInt32LE(updates.addedTime, dataOffset);
  }

  if (updates.playTime !== undefined) {
    newData.writeUInt32LE(updates.playTime, dataOffset + 4);
  }

  if (updates.sessions !== undefined) {
    newData.writeUInt32LE(updates.sessions, dataOffset + 8);
  }

  return newData;
}

// =============================================================================
// File System Operations
// =============================================================================

/**
 * Get the path to the local library.db backup
 */
export function getLocalLibraryDbPath(): string {
  return path.join(LOCAL_STORAGE_DIR, LOCAL_LIBRARY_DB_FILENAME);
}

/**
 * Check if a local library.db backup exists
 */
export function hasLocalLibraryDb(): boolean {
  return fs.existsSync(getLocalLibraryDbPath());
}

/**
 * Read the local library.db backup
 * Returns null if the file doesn't exist
 */
export function readLocalLibraryDb(): Buffer | null {
  const filePath = getLocalLibraryDbPath();

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath);
}

/**
 * Write library.db data to the local backup
 */
export function writeLocalLibraryDb(data: Buffer): void {
  const filePath = getLocalLibraryDbPath();

  // Ensure directory exists
  if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
    fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
  }

  fs.writeFileSync(filePath, data);
}

/**
 * Delete the local library.db backup
 */
export function deleteLocalLibraryDb(): void {
  const filePath = getLocalLibraryDbPath();

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Get info about the local library.db backup
 */
export function getLocalLibraryDbInfo(): {
  exists: boolean;
  entryCount?: number;
  fileSize?: number;
  lastModified?: Date;
} | null {
  const filePath = getLocalLibraryDbPath();

  if (!fs.existsSync(filePath)) {
    return { exists: false };
  }

  const stats = fs.statSync(filePath);
  const data = fs.readFileSync(filePath);

  // Try to parse to get entry count
  try {
    const verification = verifyHeader(data);
    if (!verification.valid) {
      return {
        exists: true,
        fileSize: stats.size,
        lastModified: stats.mtime,
      };
    }

    const library = parseLibraryDb(data);
    return {
      exists: true,
      entryCount: library.entryCount,
      fileSize: stats.size,
      lastModified: stats.mtime,
    };
  } catch {
    return {
      exists: true,
      fileSize: stats.size,
      lastModified: stats.mtime,
    };
  }
}

/**
 * Get the path to library.db on an SD card
 */
export function getSDLibraryDbPath(sdCardPath: string): string {
  return path.join(sdCardPath, LIBRARY_DB_SD_PATH);
}

/**
 * Check if library.db exists on an SD card
 */
export function hasSDLibraryDb(sdCardPath: string): boolean {
  return fs.existsSync(getSDLibraryDbPath(sdCardPath));
}

/**
 * Read library.db from an SD card
 * Returns null if the file doesn't exist
 */
export function readSDLibraryDb(sdCardPath: string): Buffer | null {
  const filePath = getSDLibraryDbPath(sdCardPath);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath);
}

/**
 * Write library.db to an SD card
 */
export function writeSDLibraryDb(sdCardPath: string, data: Buffer): void {
  const filePath = getSDLibraryDbPath(sdCardPath);

  // Ensure directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, data);
}

/**
 * Get info about library.db on an SD card
 */
export function getSDLibraryDbInfo(sdCardPath: string): {
  exists: boolean;
  entryCount?: number;
  fileSize?: number;
  lastModified?: Date;
} | null {
  const filePath = getSDLibraryDbPath(sdCardPath);

  if (!fs.existsSync(filePath)) {
    return { exists: false };
  }

  const stats = fs.statSync(filePath);
  const data = fs.readFileSync(filePath);

  // Try to parse to get entry count
  try {
    const verification = verifyHeader(data);
    if (!verification.valid) {
      return {
        exists: true,
        fileSize: stats.size,
        lastModified: stats.mtime,
      };
    }

    const library = parseLibraryDb(data);
    return {
      exists: true,
      entryCount: library.entryCount,
      fileSize: stats.size,
      lastModified: stats.mtime,
    };
  } catch {
    return {
      exists: true,
      fileSize: stats.size,
      lastModified: stats.mtime,
    };
  }
}
