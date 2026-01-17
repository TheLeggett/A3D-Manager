/**
 * SD Card Service (Browser)
 *
 * Uses the File System Access API (Chrome/Chromium only) to access
 * SD card directories directly from the browser.
 *
 * This service handles:
 * - Directory picker for SD card selection
 * - Validating Analogue 3D directory structure
 * - Reading/writing labels.db from SD card
 * - Reading/writing game settings from SD card
 * - Reading/writing game pak files from SD card
 * - Scanning games directory for owned cartridges
 */

import { parseLabelsDb, verifyHeader, DATA_START, IMAGE_SLOT_SIZE } from '../labels/LabelsDbService';

// =============================================================================
// Types
// =============================================================================

/**
 * SD Card information (browser version)
 */
export interface BrowserSDCard {
  /** Display name from directory picker */
  name: string;
  /** Root directory handle */
  handle: FileSystemDirectoryHandle;
  /** Whether this is a valid Analogue 3D SD card */
  isValid: boolean;
  /** Path-like identifier for the directory */
  path: string;
}

/**
 * Game folder information
 */
export interface GameFolder {
  /** Cartridge ID (8-char hex) */
  cartId: string;
  /** Full folder name */
  folderName: string;
  /** Directory handle */
  handle: FileSystemDirectoryHandle;
  /** Whether settings.json exists */
  hasSettings: boolean;
  /** Whether controller_pak.img exists */
  hasGamePak: boolean;
}

/**
 * Progress callback for file operations
 */
export type ProgressCallback = (progress: {
  bytesWritten: number;
  totalBytes: number;
  percentage: number;
}) => void;

// =============================================================================
// File System Access API Support Detection
// =============================================================================

/**
 * Check if File System Access API is supported
 */
export function isFileSystemAccessSupported(): boolean {
  return (
    'showDirectoryPicker' in window &&
    typeof window.showDirectoryPicker === 'function'
  );
}

/**
 * Check if the browser is Chrome/Chromium-based
 */
export function isChromiumBrowser(): boolean {
  const ua = navigator.userAgent;
  return /Chrome|Chromium|Edg|Brave|Arc/.test(ua) && !/Firefox|Safari/.test(ua.replace(/Chrome|Chromium/, ''));
}

// =============================================================================
// Directory Picker
// =============================================================================

/**
 * Open directory picker for user to select SD card root
 */
export async function selectSDCardDirectory(): Promise<BrowserSDCard | null> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API is not supported in this browser. Please use Chrome.');
  }

  try {
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'downloads',
    });

    // Validate that this is an Analogue 3D SD card
    const isValid = await validateAnalogue3DDirectory(handle);

    return {
      name: handle.name,
      handle,
      isValid,
      path: handle.name, // In browser, we just use the name
    };
  } catch (err) {
    // User cancelled or permission denied
    if ((err as Error).name === 'AbortError') {
      return null;
    }
    throw err;
  }
}

/**
 * Validate that a directory handle is an Analogue 3D SD card root
 */
export async function validateAnalogue3DDirectory(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    // Check for Library/N64/library.db
    const library = await handle.getDirectoryHandle('Library', { create: false });
    const n64 = await library.getDirectoryHandle('N64', { create: false });
    await n64.getFileHandle('library.db', { create: false });
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Path Navigation Helpers
// =============================================================================

/**
 * Get a subdirectory handle from a path
 */
export async function getSubdirectory(
  root: FileSystemDirectoryHandle,
  path: string,
  create = false
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const parts = path.split('/').filter(Boolean);
    let current = root;

    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create });
    }

    return current;
  } catch {
    return null;
  }
}

/**
 * Get a file handle from a path
 */
export async function getFile(
  root: FileSystemDirectoryHandle,
  path: string,
  create = false
): Promise<FileSystemFileHandle | null> {
  try {
    const parts = path.split('/').filter(Boolean);
    const filename = parts.pop();

    if (!filename) {
      return null;
    }

    let current = root;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create });
    }

    return await current.getFileHandle(filename, { create });
  } catch {
    return null;
  }
}

/**
 * Check if a file exists at a path
 */
export async function fileExists(root: FileSystemDirectoryHandle, path: string): Promise<boolean> {
  const handle = await getFile(root, path);
  return handle !== null;
}

/**
 * Check if a directory exists at a path
 */
export async function directoryExists(root: FileSystemDirectoryHandle, path: string): Promise<boolean> {
  const handle = await getSubdirectory(root, path);
  return handle !== null;
}

// =============================================================================
// Labels.db Operations
// =============================================================================

/**
 * Get the path to labels.db on the SD card
 */
export function getLabelsDbPath(): string {
  return 'Library/N64/Images/labels.db';
}

/**
 * Check if labels.db exists on the SD card
 */
export async function hasLabelsDbOnSD(sdCard: BrowserSDCard): Promise<boolean> {
  return fileExists(sdCard.handle, getLabelsDbPath());
}

/**
 * Check if labels.db exists given a directory handle
 */
export async function hasLabelsDb(handle: FileSystemDirectoryHandle): Promise<boolean> {
  return fileExists(handle, getLabelsDbPath());
}

/**
 * Get labels.db info from SD card without loading full data
 */
export async function getLabelsDbInfo(sdCard: BrowserSDCard): Promise<{
  exists: boolean;
  size?: number;
  entryCount?: number;
} | null> {
  const fileHandle = await getFile(sdCard.handle, getLabelsDbPath());
  if (!fileHandle) {
    return { exists: false };
  }

  const file = await fileHandle.getFile();
  const size = file.size;

  // Calculate entry count from file size
  const imageDataSize = size - DATA_START;
  const entryCount = imageDataSize > 0 ? Math.floor(imageDataSize / IMAGE_SLOT_SIZE) : 0;

  return {
    exists: true,
    size,
    entryCount,
  };
}

/**
 * Read labels.db from SD card
 */
export async function readLabelsDbFromSD(sdCard: BrowserSDCard): Promise<ArrayBuffer | null> {
  const fileHandle = await getFile(sdCard.handle, getLabelsDbPath());
  if (!fileHandle) {
    return null;
  }

  const file = await fileHandle.getFile();
  return file.arrayBuffer();
}

/**
 * Write labels.db to SD card
 */
export async function writeLabelsDbToSD(
  sdCard: BrowserSDCard,
  data: ArrayBuffer,
  onProgress?: ProgressCallback
): Promise<void> {
  // Validate the data
  const headerCheck = verifyHeader(data);
  if (!headerCheck.valid) {
    throw new Error(`Invalid labels.db data: ${headerCheck.error}`);
  }

  // Ensure directory structure exists
  const imagesDir = await getSubdirectory(sdCard.handle, 'Library/N64/Images', true);
  if (!imagesDir) {
    throw new Error('Could not create Images directory on SD card');
  }

  // Get or create the file
  const fileHandle = await imagesDir.getFileHandle('labels.db', { create: true });

  // Write the data
  const writable = await fileHandle.createWritable();

  try {
    // For progress tracking, we write in chunks
    const chunkSize = 64 * 1024; // 64KB chunks
    const totalBytes = data.byteLength;
    let bytesWritten = 0;

    const bytes = new Uint8Array(data);

    while (bytesWritten < totalBytes) {
      const end = Math.min(bytesWritten + chunkSize, totalBytes);
      const chunk = bytes.slice(bytesWritten, end);
      await writable.write(chunk);
      bytesWritten = end;

      if (onProgress) {
        onProgress({
          bytesWritten,
          totalBytes,
          percentage: Math.round((bytesWritten / totalBytes) * 100),
        });
      }
    }

    await writable.close();
  } catch (err) {
    // Make sure to close the writable on error
    try {
      await writable.abort();
    } catch {
      // Ignore abort errors
    }
    throw err;
  }
}

/**
 * Delete labels.db from SD card
 */
export async function deleteLabelsDbFromSD(sdCard: BrowserSDCard): Promise<boolean> {
  try {
    const imagesDir = await getSubdirectory(sdCard.handle, 'Library/N64/Images');
    if (!imagesDir) {
      return false;
    }

    await imagesDir.removeEntry('labels.db');
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Games Directory Operations
// =============================================================================

/**
 * Get the Games directory handle
 */
export async function getGamesDirectory(
  sdCard: BrowserSDCard,
  create = false
): Promise<FileSystemDirectoryHandle | null> {
  return getSubdirectory(sdCard.handle, 'Library/N64/Games', create);
}

/**
 * List all game folders on the SD card
 */
export async function listGameFolders(sdCard: BrowserSDCard): Promise<GameFolder[]> {
  const gamesDir = await getGamesDirectory(sdCard);
  if (!gamesDir) {
    return [];
  }

  const folders: GameFolder[] = [];

  for await (const entry of gamesDir.values()) {
    if (entry.kind !== 'directory') continue;

    // Extract cart ID from folder name (last 8 hex chars)
    const match = entry.name.match(/([0-9a-fA-F]{8})$/);
    if (!match) continue;

    const cartId = match[1].toLowerCase();
    const folderHandle = await gamesDir.getDirectoryHandle(entry.name);

    // Check for settings.json and controller_pak.img
    let hasSettings = false;
    let hasGamePak = false;

    try {
      await folderHandle.getFileHandle('settings.json');
      hasSettings = true;
    } catch {
      // File doesn't exist
    }

    try {
      await folderHandle.getFileHandle('controller_pak.img');
      hasGamePak = true;
    } catch {
      // File doesn't exist
    }

    folders.push({
      cartId,
      folderName: entry.name,
      handle: folderHandle,
      hasSettings,
      hasGamePak,
    });
  }

  return folders;
}

/**
 * Find a game folder by cart ID
 */
export async function findGameFolder(
  sdCard: BrowserSDCard,
  cartId: string
): Promise<GameFolder | null> {
  const folders = await listGameFolders(sdCard);
  return folders.find((f) => f.cartId === cartId.toLowerCase()) || null;
}

/**
 * Get cart IDs from all game folders (for owned carts detection)
 */
export async function getCartIdsFromSD(sdCard: BrowserSDCard): Promise<string[]> {
  const folders = await listGameFolders(sdCard);
  return folders.map((f) => f.cartId);
}

// =============================================================================
// Settings Operations
// =============================================================================

/**
 * Read settings.json from a game folder on SD card
 */
export async function readSettingsFromSD(
  sdCard: BrowserSDCard,
  cartId: string
): Promise<unknown | null> {
  const folder = await findGameFolder(sdCard, cartId);
  if (!folder) {
    return null;
  }

  try {
    const fileHandle = await folder.handle.getFileHandle('settings.json');
    const file = await fileHandle.getFile();
    const text = await file.text();

    // Handle Analogue 3D's invalid JSON with trailing commas
    const sanitized = text.replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(sanitized);
  } catch {
    return null;
  }
}

/**
 * Write settings.json to a game folder on SD card
 */
export async function writeSettingsToSD(
  sdCard: BrowserSDCard,
  cartId: string,
  settings: unknown,
  gameName: string
): Promise<void> {
  // Find or create the game folder
  const gamesDir = await getGamesDirectory(sdCard, true);
  if (!gamesDir) {
    throw new Error('Could not access Games directory on SD card');
  }

  // Find existing folder or determine new folder name
  let folder = await findGameFolder(sdCard, cartId);
  let folderHandle: FileSystemDirectoryHandle;

  if (folder) {
    folderHandle = folder.handle;
  } else {
    // Create new folder
    const normalizedId = cartId.toLowerCase();
    const folderName = `${gameName} ${normalizedId}`;
    folderHandle = await gamesDir.getDirectoryHandle(folderName, { create: true });
  }

  // Write settings.json
  const fileHandle = await folderHandle.getFileHandle('settings.json', { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(settings, null, 2));
  await writable.close();
}

// =============================================================================
// Game Pak Operations
// =============================================================================

/** Controller pak size: 32KB */
export const CONTROLLER_PAK_SIZE = 32768;

/**
 * Read controller_pak.img from a game folder on SD card
 */
export async function readGamePakFromSD(
  sdCard: BrowserSDCard,
  cartId: string
): Promise<ArrayBuffer | null> {
  const folder = await findGameFolder(sdCard, cartId);
  if (!folder) {
    return null;
  }

  try {
    const fileHandle = await folder.handle.getFileHandle('controller_pak.img');
    const file = await fileHandle.getFile();

    if (file.size !== CONTROLLER_PAK_SIZE) {
      console.warn(`Invalid game pak size: ${file.size} bytes (expected ${CONTROLLER_PAK_SIZE})`);
    }

    return file.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Write controller_pak.img to a game folder on SD card
 */
export async function writeGamePakToSD(
  sdCard: BrowserSDCard,
  cartId: string,
  data: ArrayBuffer,
  gameName: string
): Promise<void> {
  if (data.byteLength !== CONTROLLER_PAK_SIZE) {
    throw new Error(`Invalid game pak size: ${data.byteLength} bytes (expected ${CONTROLLER_PAK_SIZE})`);
  }

  // Find or create the game folder
  const gamesDir = await getGamesDirectory(sdCard, true);
  if (!gamesDir) {
    throw new Error('Could not access Games directory on SD card');
  }

  // Find existing folder or determine new folder name
  let folder = await findGameFolder(sdCard, cartId);
  let folderHandle: FileSystemDirectoryHandle;

  if (folder) {
    folderHandle = folder.handle;
  } else {
    // Create new folder
    const normalizedId = cartId.toLowerCase();
    const folderName = `${gameName} ${normalizedId}`;
    folderHandle = await gamesDir.getDirectoryHandle(folderName, { create: true });
  }

  // Write controller_pak.img
  const fileHandle = await folderHandle.getFileHandle('controller_pak.img', { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

// =============================================================================
// Comparison Operations
// =============================================================================

/**
 * Quick comparison of local and SD labels.db (by entry count)
 */
export async function compareLabelsDbQuick(
  sdCard: BrowserSDCard,
  localData: ArrayBuffer
): Promise<{
  localEntryCount: number;
  sdEntryCount: number;
  match: boolean;
}> {
  const localDb = parseLabelsDb(localData);

  const sdInfo = await getLabelsDbInfo(sdCard);
  const sdEntryCount = sdInfo?.entryCount || 0;

  return {
    localEntryCount: localDb.entryCount,
    sdEntryCount,
    match: localDb.entryCount === sdEntryCount,
  };
}

/**
 * Detailed comparison of local and SD labels.db
 */
export async function compareLabelsDbDetailed(
  sdCard: BrowserSDCard,
  localData: ArrayBuffer
): Promise<{
  localOnly: string[];
  sdOnly: string[];
  common: string[];
  different: string[];
}> {
  const localDb = parseLabelsDb(localData);
  const localIds = new Set(localDb.entries.map((e) => e.cartIdHex));

  const sdData = await readLabelsDbFromSD(sdCard);
  if (!sdData) {
    return {
      localOnly: Array.from(localIds),
      sdOnly: [],
      common: [],
      different: [],
    };
  }

  const sdDb = parseLabelsDb(sdData);
  const sdIds = new Set(sdDb.entries.map((e) => e.cartIdHex));

  const localOnly: string[] = [];
  const sdOnly: string[] = [];
  const common: string[] = [];
  const different: string[] = [];

  // Find local-only and common entries
  for (const cartIdHex of localIds) {
    if (sdIds.has(cartIdHex)) {
      common.push(cartIdHex);
    } else {
      localOnly.push(cartIdHex);
    }
  }

  // Find SD-only entries
  for (const cartIdHex of sdIds) {
    if (!localIds.has(cartIdHex)) {
      sdOnly.push(cartIdHex);
    }
  }

  // TODO: For 'different', we'd need to compare actual image data
  // This requires loading and hashing each image, which is expensive
  // For now, we assume common entries are the same

  return {
    localOnly,
    sdOnly,
    common,
    different,
  };
}

// =============================================================================
// Permission Persistence
// =============================================================================

// Store the last selected directory handle for quick re-access
let lastSelectedHandle: FileSystemDirectoryHandle | null = null;

/**
 * Get the last selected SD card directory (if still accessible)
 */
export async function getLastSelectedSDCard(): Promise<BrowserSDCard | null> {
  if (!lastSelectedHandle) {
    return null;
  }

  try {
    // Check if we still have permission
    const permission = await lastSelectedHandle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      lastSelectedHandle = null;
      return null;
    }

    const isValid = await validateAnalogue3DDirectory(lastSelectedHandle);

    return {
      name: lastSelectedHandle.name,
      handle: lastSelectedHandle,
      isValid,
      path: lastSelectedHandle.name,
    };
  } catch {
    lastSelectedHandle = null;
    return null;
  }
}

/**
 * Request permission to access the last selected directory
 */
export async function requestLastSelectedPermission(): Promise<BrowserSDCard | null> {
  if (!lastSelectedHandle) {
    return null;
  }

  try {
    const permission = await lastSelectedHandle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      return null;
    }

    const isValid = await validateAnalogue3DDirectory(lastSelectedHandle);

    return {
      name: lastSelectedHandle.name,
      handle: lastSelectedHandle,
      isValid,
      path: lastSelectedHandle.name,
    };
  } catch {
    return null;
  }
}

/**
 * Store a directory handle for later access
 */
export function setLastSelectedHandle(handle: FileSystemDirectoryHandle): void {
  lastSelectedHandle = handle;
}

/**
 * Clear the stored directory handle
 */
export function clearLastSelectedHandle(): void {
  lastSelectedHandle = null;
}
