/**
 * Game Pak Service (Browser)
 *
 * Manages controller pak (game pak) data using IndexedDB for persistence.
 * Provides the same API as the server-side game-pak.ts.
 *
 * This service handles:
 * - Storing and retrieving controller pak images
 * - Creating and managing backups
 * - Syncing game paks with SD card
 * - Validating controller pak format
 */

import * as storage from '../storage/IndexedDbStorage';
import * as sdCard from '../sd-card/SdCardService';
import type { BrowserSDCard } from '../sd-card/SdCardService';

// =============================================================================
// Constants
// =============================================================================

/**
 * N64 Controller Pak size: 256Kbit = 32KB = 32,768 bytes
 */
export const CONTROLLER_PAK_SIZE = 32768;

/**
 * Controller Pak page size
 */
export const CONTROLLER_PAK_PAGE_SIZE = 256;

/**
 * Total page count
 */
export const CONTROLLER_PAK_PAGE_COUNT = 128;

/**
 * System pages (0-4 are reserved)
 */
export const SYSTEM_PAGES = 5;

// =============================================================================
// Types
// =============================================================================

export interface GamePakSaveDetails {
  pagesUsed: number;
  pagesFree: number;
  percentUsed: number;
}

export interface GamePakInfo {
  exists: boolean;
  source: 'local' | 'sd';
  size?: number;
  lastModified?: string;
  isValidSize?: boolean;
  saveInfo?: GamePakSaveDetails;
  md5Hash?: string;
}

export interface GamePakSyncStatus {
  localHash: string | null;
  sdHash: string | null;
  inSync: boolean;
  hasConflict: boolean;
}

export interface GamePakBackup {
  id: string;
  cartId: string;
  name: string;
  description?: string;
  createdAt: string;
  md5Hash: string;
  size: number;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate a game pak buffer
 */
export function validateGamePak(buffer: ArrayBuffer): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (buffer.byteLength !== CONTROLLER_PAK_SIZE) {
    errors.push(`Invalid size: ${buffer.byteLength} bytes (expected ${CONTROLLER_PAK_SIZE} bytes)`);
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// Hash Computation
// =============================================================================

/**
 * Compute MD5 hash of a game pak buffer using Web Crypto API
 * Note: Web Crypto doesn't support MD5, so we use SHA-256 and truncate for compatibility
 * For true MD5 compatibility, consider adding a library
 */
export async function computeGamePakHash(buffer: ArrayBuffer): Promise<string> {
  // Use SHA-256 since MD5 isn't available in Web Crypto
  // This is fine for our comparison purposes
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // Return first 16 bytes (32 hex chars) to match MD5 length
  return hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

// =============================================================================
// Save Info Analysis
// =============================================================================

/**
 * Check if a game pak is empty (no save data)
 */
export function isGamePakEmpty(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength !== CONTROLLER_PAK_SIZE) {
    return false;
  }

  const view = new DataView(buffer);

  // Check the index table to see if any pages are in use (not 0x0003 = free)
  // Pages 0-4 are system pages, so we check from page 5 onwards
  for (let i = SYSTEM_PAGES; i < CONTROLLER_PAK_PAGE_COUNT; i++) {
    const offset = 0x100 + i * 2;
    const status = view.getUint16(offset, false); // big-endian

    // 0x0003 means free, anything else means in use
    if (status !== 0x0003) {
      return false;
    }
  }

  return true;
}

/**
 * Get information about save data in a game pak
 */
export function getGamePakSaveInfo(buffer: ArrayBuffer): GamePakSaveDetails {
  if (buffer.byteLength !== CONTROLLER_PAK_SIZE) {
    return { pagesUsed: 0, pagesFree: 0, percentUsed: 0 };
  }

  const view = new DataView(buffer);
  let pagesUsed = 0;
  let pagesFree = 0;

  // Check pages 5-127 (0-4 are system pages)
  for (let i = SYSTEM_PAGES; i < CONTROLLER_PAK_PAGE_COUNT; i++) {
    const offset = 0x100 + i * 2;
    const status = view.getUint16(offset, false); // big-endian

    if (status === 0x0003) {
      pagesFree++;
    } else {
      pagesUsed++;
    }
  }

  const totalUserPages = CONTROLLER_PAK_PAGE_COUNT - SYSTEM_PAGES; // 123 pages
  const percentUsed = Math.round((pagesUsed / totalUserPages) * 100);

  return { pagesUsed, pagesFree, percentUsed };
}

/**
 * Create an empty (formatted) controller pak
 */
export function createEmptyGamePak(): ArrayBuffer {
  const buffer = new ArrayBuffer(CONTROLLER_PAK_SIZE);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Fill with zeros
  bytes.fill(0x00);

  // First 32 bytes are the label area (usually 0x81 for empty)
  for (let i = 0; i < 32; i++) {
    bytes[i] = 0x81;
  }

  // ID area at offset 0x20-0x3F (repeated at 0x60, 0x80, 0xC0)
  // These contain checksum and format info
  const idAreas = [0x20, 0x60, 0x80, 0xC0];
  for (const offset of idAreas) {
    view.setUint32(offset, 0xFFFFFFFF, false);
  }

  // Index table starts at 0x100 (256)
  // First 5 pages (0-4) are reserved for system
  // Mark them as system pages (0x0001)
  for (let i = 0; i < SYSTEM_PAGES; i++) {
    view.setUint16(0x100 + i * 2, 0x0001, false);
  }

  // Mark remaining pages as free (0x0003)
  for (let i = SYSTEM_PAGES; i < CONTROLLER_PAK_PAGE_COUNT; i++) {
    view.setUint16(0x100 + i * 2, 0x0003, false);
  }

  return buffer;
}

// =============================================================================
// Local Storage Operations
// =============================================================================

/**
 * Get game pak info from local storage
 */
export async function getLocalGamePakInfo(cartId: string): Promise<GamePakInfo> {
  const stored = await storage.getGamePak(cartId);

  if (!stored) {
    return {
      exists: false,
      source: 'local',
    };
  }

  const isValidSize = stored.data.byteLength === CONTROLLER_PAK_SIZE;
  const saveInfo = isValidSize ? getGamePakSaveInfo(stored.data) : undefined;
  const md5Hash = isValidSize ? await computeGamePakHash(stored.data) : undefined;

  return {
    exists: true,
    source: 'local',
    size: stored.data.byteLength,
    lastModified: stored.lastModified,
    isValidSize,
    saveInfo,
    md5Hash,
  };
}

/**
 * Read game pak data from local storage
 */
export async function readLocalGamePak(cartId: string): Promise<ArrayBuffer | null> {
  const stored = await storage.getGamePak(cartId);
  return stored?.data || null;
}

/**
 * Save game pak to local storage
 */
export async function saveLocalGamePak(cartId: string, data: ArrayBuffer): Promise<void> {
  const validation = validateGamePak(data);
  if (!validation.valid) {
    throw new Error(`Invalid game pak: ${validation.errors.join(', ')}`);
  }

  await storage.saveGamePak(cartId, data);
}

/**
 * Delete game pak from local storage
 */
export async function deleteLocalGamePak(cartId: string): Promise<boolean> {
  const stored = await storage.getGamePak(cartId);
  if (!stored) {
    return false;
  }

  await storage.deleteGamePak(cartId);
  return true;
}

/**
 * Check if game pak exists in local storage
 */
export async function hasLocalGamePak(cartId: string): Promise<boolean> {
  const stored = await storage.getGamePak(cartId);
  return !!stored;
}

/**
 * Get all cart IDs that have local game paks
 */
export async function getCartIdsWithGamePaks(): Promise<string[]> {
  return storage.getGamePakCartIds();
}

// =============================================================================
// SD Card Operations
// =============================================================================

/**
 * Get game pak info from SD card
 */
export async function getSDGamePakInfo(
  sdCardHandle: BrowserSDCard,
  cartId: string
): Promise<GamePakInfo> {
  const data = await sdCard.readGamePakFromSD(sdCardHandle, cartId);

  if (!data) {
    return {
      exists: false,
      source: 'sd',
    };
  }

  const isValidSize = data.byteLength === CONTROLLER_PAK_SIZE;
  const saveInfo = isValidSize ? getGamePakSaveInfo(data) : undefined;
  const md5Hash = isValidSize ? await computeGamePakHash(data) : undefined;

  return {
    exists: true,
    source: 'sd',
    size: data.byteLength,
    isValidSize,
    saveInfo,
    md5Hash,
  };
}

/**
 * Get game pak info for both local and SD
 */
export async function getGamePakInfo(
  cartId: string,
  sdCardHandle?: BrowserSDCard,
  includeHash = false
): Promise<{
  local: GamePakInfo;
  sd: GamePakInfo | null;
  syncStatus?: GamePakSyncStatus;
}> {
  const local = await getLocalGamePakInfo(cartId);

  let sd: GamePakInfo | null = null;
  if (sdCardHandle) {
    sd = await getSDGamePakInfo(sdCardHandle, cartId);
  }

  let syncStatus: GamePakSyncStatus | undefined;
  if (includeHash && sdCardHandle) {
    const localHash = local.md5Hash || null;
    const sdHash = sd?.md5Hash || null;
    const bothExist = localHash !== null && sdHash !== null;

    syncStatus = {
      localHash,
      sdHash,
      inSync: !bothExist || localHash === sdHash,
      hasConflict: bothExist && localHash !== sdHash,
    };
  }

  return { local, sd, syncStatus };
}

/**
 * Download game pak from SD card to local storage
 */
export async function downloadGamePakFromSD(
  sdCardHandle: BrowserSDCard,
  cartId: string
): Promise<{ success: boolean; error?: string }> {
  const data = await sdCard.readGamePakFromSD(sdCardHandle, cartId);

  if (!data) {
    return { success: false, error: 'Game pak not found on SD card' };
  }

  const validation = validateGamePak(data);
  if (!validation.valid) {
    return { success: false, error: `Invalid game pak: ${validation.errors.join(', ')}` };
  }

  try {
    await saveLocalGamePak(cartId, data);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Upload local game pak to SD card
 */
export async function uploadGamePakToSD(
  sdCardHandle: BrowserSDCard,
  cartId: string,
  gameName: string
): Promise<{ success: boolean; error?: string }> {
  const data = await readLocalGamePak(cartId);

  if (!data) {
    return { success: false, error: 'No local game pak found' };
  }

  const validation = validateGamePak(data);
  if (!validation.valid) {
    return { success: false, error: `Invalid game pak: ${validation.errors.join(', ')}` };
  }

  try {
    await sdCard.writeGamePakToSD(sdCardHandle, cartId, data, gameName);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// =============================================================================
// Import/Export Operations
// =============================================================================

/**
 * Import game pak from a file
 */
export async function importGamePakFromFile(
  cartId: string,
  file: File
): Promise<{ success: boolean; error?: string }> {
  try {
    const buffer = await file.arrayBuffer();
    await saveLocalGamePak(cartId, buffer);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Export game pak to a blob
 */
export async function exportGamePakToBlob(cartId: string): Promise<Blob | null> {
  const data = await readLocalGamePak(cartId);
  if (!data) {
    return null;
  }

  return new Blob([data], { type: 'application/octet-stream' });
}

// =============================================================================
// Backup Operations
// =============================================================================

/**
 * List all backups for a cartridge
 */
export async function listBackups(cartId: string): Promise<GamePakBackup[]> {
  const backups = await storage.getBackupsForCart(cartId);
  return backups.map(b => ({
    id: b.id,
    cartId: b.cartId,
    name: b.name,
    description: b.description,
    createdAt: b.createdAt,
    md5Hash: b.md5Hash,
    size: b.data.byteLength,
  }));
}

/**
 * Create a backup of the current local game pak
 */
export async function createBackup(
  cartId: string,
  name?: string,
  description?: string
): Promise<GamePakBackup> {
  const data = await readLocalGamePak(cartId);
  if (!data) {
    throw new Error('No local game pak to backup');
  }

  const validation = validateGamePak(data);
  if (!validation.valid) {
    throw new Error(`Invalid game pak: ${validation.errors.join(', ')}`);
  }

  const id = crypto.randomUUID();
  const md5Hash = await computeGamePakHash(data);
  const createdAt = new Date().toISOString();

  const backup: storage.GamePakBackup = {
    id,
    cartId: cartId.toLowerCase(),
    name: name || `Backup ${createdAt.split('T')[0]}`,
    description,
    createdAt,
    md5Hash,
    data,
  };

  await storage.createBackup(backup);

  return {
    id: backup.id,
    cartId: backup.cartId,
    name: backup.name,
    description: backup.description,
    createdAt: backup.createdAt,
    md5Hash: backup.md5Hash,
    size: backup.data.byteLength,
  };
}

/**
 * Get a backup's data
 */
export async function getBackupData(backupId: string): Promise<ArrayBuffer | null> {
  const backup = await storage.getBackup(backupId);
  return backup?.data || null;
}

/**
 * Update a backup's metadata
 */
export async function updateBackup(
  backupId: string,
  updates: { name?: string; description?: string }
): Promise<boolean> {
  try {
    await storage.updateBackup(backupId, updates);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a backup
 */
export async function deleteBackup(backupId: string): Promise<boolean> {
  try {
    await storage.deleteBackup(backupId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Restore a backup to local storage
 */
export async function restoreBackup(
  backupId: string,
  sdCardHandle?: BrowserSDCard,
  gameName?: string
): Promise<{ local: boolean; sd: boolean }> {
  const backup = await storage.getBackup(backupId);
  if (!backup) {
    throw new Error('Backup not found');
  }

  const validation = validateGamePak(backup.data);
  if (!validation.valid) {
    throw new Error(`Invalid backup: ${validation.errors.join(', ')}`);
  }

  // Restore to local
  await saveLocalGamePak(backup.cartId, backup.data);
  const result = { local: true, sd: false };

  // Optionally restore to SD card
  if (sdCardHandle && gameName) {
    try {
      await sdCard.writeGamePakToSD(sdCardHandle, backup.cartId, backup.data, gameName);
      result.sd = true;
    } catch {
      // SD restore failed, but local succeeded
    }
  }

  return result;
}

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * Delete all local game paks
 */
export async function deleteAllLocalGamePaks(): Promise<void> {
  await storage.clearAllGamePaks();
}

/**
 * Delete all backups
 */
export async function deleteAllBackups(): Promise<void> {
  await storage.clearAllBackups();
}
