/**
 * Labels Database Service (Browser)
 *
 * A browser-compatible implementation of the labels.db specification.
 * Uses ArrayBuffer/DataView/Uint8Array instead of Node.js Buffer.
 *
 * This service handles:
 * - Parsing and validating labels.db binary format
 * - Extracting label images as PNG
 * - Adding/updating/deleting label entries
 * - Integration with IndexedDB for persistence
 */

import * as storage from '../storage/IndexedDbStorage';

// =============================================================================
// Constants (matching server/lib/labels-db-core.ts exactly)
// =============================================================================

/** Magic byte at offset 0x00 */
export const MAGIC_BYTE = 0x07;

/** Identifier string at offset 0x01 */
export const IDENTIFIER = 'Analogue-Co';

/** File type string at offset 0x20 */
export const FILE_TYPE = 'Analogue-3D.labels';

/** Version number (2.0) stored as little-endian at offset 0x40 */
export const VERSION = 0x00020000;

/** Header size in bytes */
export const HEADER_SIZE = 0x100; // 256 bytes

/** Start of cartridge ID table */
export const ID_TABLE_START = 0x100; // 256 bytes

/** Start of image data section */
export const DATA_START = 0x4100; // 16,640 bytes

/** Image width in pixels */
export const IMAGE_WIDTH = 74;

/** Image height in pixels */
export const IMAGE_HEIGHT = 86;

/** Bytes per pixel (BGRA) */
export const BYTES_PER_PIXEL = 4;

/** Actual image data size (74 × 86 × 4) */
export const IMAGE_DATA_SIZE = IMAGE_WIDTH * IMAGE_HEIGHT * BYTES_PER_PIXEL; // 25,456

/** Total slot size including padding */
export const IMAGE_SLOT_SIZE = 25600;

/** Padding at end of each image slot */
export const SLOT_PADDING = IMAGE_SLOT_SIZE - IMAGE_DATA_SIZE; // 144 bytes

/** Padding fill value */
export const PADDING_FILL = 0xff;

// =============================================================================
// Types
// =============================================================================

/** A single entry in the labels database */
export interface LabelEntry {
  /** Cartridge ID as a number */
  cartId: number;
  /** Cartridge ID as 8-character hex string */
  cartIdHex: string;
  /** Index position in the sorted ID table (0-based) */
  index: number;
  /** Byte offset to image data in the file */
  imageOffset: number;
}

/** Parsed labels.db structure */
export interface LabelsDatabase {
  /** Number of entries in the database */
  entryCount: number;
  /** All cartridge entries */
  entries: LabelEntry[];
  /** Map from cartridge ID to index for fast lookup */
  idToIndex: Map<number, number>;
}

/** Image data with metadata */
export interface LabelImage {
  /** Cartridge ID as hex string */
  cartIdHex: string;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** Raw RGBA pixel data */
  rgba: Uint8Array;
  /** PNG encoded image as blob */
  png: Blob;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Encode a string to bytes in the ArrayBuffer at the given offset
 */
function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Read a string from the ArrayBuffer at the given offset
 */
function readString(view: DataView, offset: number, length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    const byte = view.getUint8(offset + i);
    if (byte === 0) break; // Null terminator
    result += String.fromCharCode(byte);
  }
  return result;
}

// =============================================================================
// Header Operations
// =============================================================================

/**
 * Create a valid labels.db header
 */
export function createHeader(): ArrayBuffer {
  const header = new ArrayBuffer(HEADER_SIZE);
  const view = new DataView(header);
  const bytes = new Uint8Array(header);

  // Fill with zeros
  bytes.fill(0x00);

  // Magic byte at 0x00
  view.setUint8(0, MAGIC_BYTE);

  // Identifier "Analogue-Co" at 0x01
  writeString(view, 1, IDENTIFIER);

  // File type "Analogue-3D.labels" at 0x20
  writeString(view, 0x20, FILE_TYPE);

  // Version 2.0 at 0x40 (little-endian)
  view.setUint32(0x40, VERSION, true);

  return header;
}

/**
 * Verify a labels.db header is valid
 */
export function verifyHeader(data: ArrayBuffer): { valid: boolean; error?: string } {
  if (data.byteLength < HEADER_SIZE) {
    return { valid: false, error: `File too small: ${data.byteLength} bytes, need at least ${HEADER_SIZE}` };
  }

  const view = new DataView(data);

  const magic = view.getUint8(0);
  if (magic !== MAGIC_BYTE) {
    return { valid: false, error: `Invalid magic byte: 0x${magic.toString(16)}, expected 0x${MAGIC_BYTE.toString(16)}` };
  }

  const identifier = readString(view, 1, IDENTIFIER.length);
  if (identifier !== IDENTIFIER) {
    return { valid: false, error: `Invalid identifier: "${identifier}", expected "${IDENTIFIER}"` };
  }

  const fileType = readString(view, 0x20, FILE_TYPE.length);
  if (fileType !== FILE_TYPE) {
    return { valid: false, error: `Invalid file type: "${fileType}", expected "${FILE_TYPE}"` };
  }

  return { valid: true };
}

// =============================================================================
// Parsing Operations
// =============================================================================

/**
 * Parse a labels.db buffer and return its structure
 */
export function parseLabelsDb(data: ArrayBuffer): LabelsDatabase {
  const verification = verifyHeader(data);
  if (!verification.valid) {
    throw new Error(`Invalid labels.db: ${verification.error}`);
  }

  const view = new DataView(data);

  // Calculate entry count from file size
  const imageDataSize = data.byteLength - DATA_START;
  if (imageDataSize < 0) {
    throw new Error(`File too small: ${data.byteLength} bytes, minimum is ${DATA_START}`);
  }

  const entryCount = Math.floor(imageDataSize / IMAGE_SLOT_SIZE);

  // Parse ID table
  const entries: LabelEntry[] = [];
  const idToIndex = new Map<number, number>();

  for (let i = 0; i < entryCount; i++) {
    const offset = ID_TABLE_START + i * 4;
    const cartId = view.getUint32(offset, true); // little-endian

    // Stop if we hit padding (0xFFFFFFFF)
    if (cartId === 0xffffffff) {
      break;
    }

    const entry: LabelEntry = {
      cartId,
      cartIdHex: cartId.toString(16).padStart(8, '0'),
      index: i,
      imageOffset: DATA_START + i * IMAGE_SLOT_SIZE,
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

// =============================================================================
// Image Operations
// =============================================================================

/**
 * Convert BGRA array to RGBA array
 */
export function bgraToRgba(bgra: Uint8Array): Uint8Array {
  const rgba = new Uint8Array(bgra.length);
  const pixelCount = bgra.length / BYTES_PER_PIXEL;

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * BYTES_PER_PIXEL;
    rgba[offset + 0] = bgra[offset + 2]; // R from B
    rgba[offset + 1] = bgra[offset + 1]; // G stays
    rgba[offset + 2] = bgra[offset + 0]; // B from R
    rgba[offset + 3] = bgra[offset + 3]; // A stays
  }

  return rgba;
}

/**
 * Convert RGBA array to BGRA array
 */
export function rgbaToBgra(rgba: Uint8Array): Uint8Array {
  const bgra = new Uint8Array(rgba.length);
  const pixelCount = rgba.length / BYTES_PER_PIXEL;

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * BYTES_PER_PIXEL;
    bgra[offset + 0] = rgba[offset + 2]; // B from R
    bgra[offset + 1] = rgba[offset + 1]; // G stays
    bgra[offset + 2] = rgba[offset + 0]; // R from B
    bgra[offset + 3] = rgba[offset + 3]; // A stays
  }

  return bgra;
}

/**
 * Extract raw BGRA image data from a labels.db buffer at a given index
 */
export function extractRawImage(data: ArrayBuffer, index: number): Uint8Array {
  const offset = DATA_START + index * IMAGE_SLOT_SIZE;
  return new Uint8Array(data, offset, IMAGE_DATA_SIZE);
}

/**
 * Convert RGBA pixel data to PNG blob using Canvas API
 */
export async function rgbaToPng(rgba: Uint8Array, width: number, height: number): Promise<Blob> {
  // Create canvas and put image data
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Create ImageData from RGBA
  const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
  ctx.putImageData(imageData, 0, 0);

  // Convert to PNG blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      },
      'image/png'
    );
  });
}

/**
 * Extract an image from labels.db by index
 */
export async function getImageByIndex(data: ArrayBuffer, index: number): Promise<LabelImage> {
  const db = parseLabelsDb(data);

  if (index < 0 || index >= db.entryCount) {
    throw new Error(`Index ${index} out of range (0-${db.entryCount - 1})`);
  }

  const entry = db.entries[index];
  const rawBgra = extractRawImage(data, index);
  const rgba = bgraToRgba(rawBgra);

  const png = await rgbaToPng(rgba, IMAGE_WIDTH, IMAGE_HEIGHT);

  return {
    cartIdHex: entry.cartIdHex,
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    rgba,
    png,
  };
}

/**
 * Extract an image from labels.db by cartridge ID
 */
export async function getImageByCartId(data: ArrayBuffer, cartId: number): Promise<LabelImage | null> {
  const db = parseLabelsDb(data);
  const index = db.idToIndex.get(cartId);

  if (index === undefined) {
    return null;
  }

  return getImageByIndex(data, index);
}

/**
 * Extract an image from labels.db by hex string cartridge ID
 */
export async function getImageByCartIdHex(data: ArrayBuffer, cartIdHex: string): Promise<LabelImage | null> {
  const cartId = parseInt(cartIdHex, 16);
  return getImageByCartId(data, cartId);
}

// =============================================================================
// Creation Operations
// =============================================================================

/**
 * Create an empty labels.db with no entries
 */
export function createEmptyLabelsDb(): ArrayBuffer {
  const buffer = new ArrayBuffer(DATA_START);
  const bytes = new Uint8Array(buffer);
  bytes.fill(PADDING_FILL);

  // Write header (overwrites padding in header region)
  const header = createHeader();
  bytes.set(new Uint8Array(header), 0);

  return buffer;
}

/**
 * Create a complete image slot with BGRA data and padding
 */
export function createImageSlot(bgraData: Uint8Array): Uint8Array {
  if (bgraData.length !== IMAGE_DATA_SIZE) {
    throw new Error(`Invalid BGRA data size: ${bgraData.length}, expected ${IMAGE_DATA_SIZE}`);
  }

  const slot = new Uint8Array(IMAGE_SLOT_SIZE);
  slot.fill(PADDING_FILL);
  slot.set(bgraData, 0);
  return slot;
}

// =============================================================================
// Modification Operations
// =============================================================================

/**
 * Update an existing entry's image in labels.db
 *
 * @param data Existing labels.db buffer
 * @param cartId Cartridge ID to update
 * @param bgraData New BGRA image data (must be IMAGE_DATA_SIZE bytes)
 * @returns Updated labels.db buffer (new buffer, original unchanged)
 */
export function updateEntry(
  data: ArrayBuffer,
  cartId: number,
  bgraData: Uint8Array
): ArrayBuffer {
  const db = parseLabelsDb(data);
  const index = db.idToIndex.get(cartId);

  if (index === undefined) {
    throw new Error(`Cartridge ID 0x${cartId.toString(16)} not found`);
  }

  // Create a copy of the buffer
  const newData = new ArrayBuffer(data.byteLength);
  new Uint8Array(newData).set(new Uint8Array(data));

  // Write new image slot
  const slot = createImageSlot(bgraData);
  new Uint8Array(newData).set(slot, DATA_START + index * IMAGE_SLOT_SIZE);

  return newData;
}

/**
 * Add a new entry to labels.db
 *
 * @param data Existing labels.db buffer
 * @param cartId New cartridge ID
 * @param bgraData BGRA image data for new entry
 * @returns Updated labels.db buffer (new buffer, original unchanged)
 */
export function addEntry(
  data: ArrayBuffer,
  cartId: number,
  bgraData: Uint8Array
): ArrayBuffer {
  const db = parseLabelsDb(data);

  // Check if already exists
  if (db.idToIndex.has(cartId)) {
    throw new Error(`Cartridge ID 0x${cartId.toString(16)} already exists`);
  }

  // Find insertion point in sorted table
  let insertIndex = 0;
  for (let i = 0; i < db.entries.length; i++) {
    if (db.entries[i].cartId > cartId) {
      break;
    }
    insertIndex = i + 1;
  }

  // Allocate new buffer
  const newSize = data.byteLength + IMAGE_SLOT_SIZE;
  const newData = new ArrayBuffer(newSize);
  const newBytes = new Uint8Array(newData);
  const newView = new DataView(newData);
  const oldBytes = new Uint8Array(data);

  // Fill with padding
  newBytes.fill(PADDING_FILL);

  // Copy header
  newBytes.set(oldBytes.subarray(0, HEADER_SIZE), 0);

  // Write ID table with new entry inserted
  for (let i = 0; i < insertIndex; i++) {
    newView.setUint32(ID_TABLE_START + i * 4, db.entries[i].cartId, true);
  }
  newView.setUint32(ID_TABLE_START + insertIndex * 4, cartId, true);
  for (let i = insertIndex; i < db.entries.length; i++) {
    newView.setUint32(ID_TABLE_START + (i + 1) * 4, db.entries[i].cartId, true);
  }

  // Copy image data with new image inserted
  for (let i = 0; i < insertIndex; i++) {
    const srcOffset = DATA_START + i * IMAGE_SLOT_SIZE;
    const dstOffset = DATA_START + i * IMAGE_SLOT_SIZE;
    newBytes.set(oldBytes.subarray(srcOffset, srcOffset + IMAGE_SLOT_SIZE), dstOffset);
  }

  // Insert new image
  const slot = createImageSlot(bgraData);
  newBytes.set(slot, DATA_START + insertIndex * IMAGE_SLOT_SIZE);

  // Copy remaining images
  for (let i = insertIndex; i < db.entries.length; i++) {
    const srcOffset = DATA_START + i * IMAGE_SLOT_SIZE;
    const dstOffset = DATA_START + (i + 1) * IMAGE_SLOT_SIZE;
    newBytes.set(oldBytes.subarray(srcOffset, srcOffset + IMAGE_SLOT_SIZE), dstOffset);
  }

  return newData;
}

/**
 * Delete an entry from labels.db
 *
 * @param data Existing labels.db buffer
 * @param cartId Cartridge ID to delete
 * @returns Updated labels.db buffer (new buffer, original unchanged)
 */
export function deleteEntry(data: ArrayBuffer, cartId: number): ArrayBuffer {
  const db = parseLabelsDb(data);
  const index = db.idToIndex.get(cartId);

  if (index === undefined) {
    throw new Error(`Cartridge ID 0x${cartId.toString(16)} not found`);
  }

  // Allocate new buffer (smaller)
  const newSize = data.byteLength - IMAGE_SLOT_SIZE;
  const newData = new ArrayBuffer(newSize);
  const newBytes = new Uint8Array(newData);
  const newView = new DataView(newData);
  const oldBytes = new Uint8Array(data);

  // Fill with padding
  newBytes.fill(PADDING_FILL);

  // Copy header
  newBytes.set(oldBytes.subarray(0, HEADER_SIZE), 0);

  // Write ID table without deleted entry
  let newIndex = 0;
  for (let i = 0; i < db.entries.length; i++) {
    if (i === index) continue;
    newView.setUint32(ID_TABLE_START + newIndex * 4, db.entries[i].cartId, true);
    newIndex++;
  }

  // Copy image data without deleted image
  newIndex = 0;
  for (let i = 0; i < db.entries.length; i++) {
    if (i === index) continue;
    const srcOffset = DATA_START + i * IMAGE_SLOT_SIZE;
    const dstOffset = DATA_START + newIndex * IMAGE_SLOT_SIZE;
    newBytes.set(oldBytes.subarray(srcOffset, srcOffset + IMAGE_SLOT_SIZE), dstOffset);
    newIndex++;
  }

  return newData;
}

// =============================================================================
// IndexedDB Integration
// =============================================================================

/**
 * Check if labels.db exists in storage
 */
export async function hasLocalLabelsDb(): Promise<boolean> {
  return storage.hasLabelsDb();
}

/**
 * Get labels.db status
 */
export async function getLabelsDbStatus(): Promise<{
  exists: boolean;
  entryCount: number;
} | null> {
  const meta = await storage.getLabelsDbMeta();
  if (!meta) {
    return null;
  }
  return {
    exists: true,
    entryCount: meta.entryCount,
  };
}

/**
 * Import a labels.db file from buffer
 */
export async function importLabelsDbFromBuffer(buffer: ArrayBuffer): Promise<{
  success: boolean;
  entryCount: number;
  fileSize: number;
  importedAt: string;
}> {
  const headerCheck = verifyHeader(buffer);
  if (!headerCheck.valid) {
    throw new Error(`Invalid labels.db file: ${headerCheck.error}`);
  }

  const db = parseLabelsDb(buffer);

  await storage.setLabelsDb(buffer, db.entryCount);

  return {
    success: true,
    entryCount: db.entryCount,
    fileSize: buffer.byteLength,
    importedAt: new Date().toISOString(),
  };
}

/**
 * Merge an imported labels.db with the existing local one
 */
export async function mergeLabelsDbFromBuffer(
  buffer: ArrayBuffer,
  mode: 'merge-overwrite' | 'merge-skip'
): Promise<{
  success: boolean;
  entryCount: number;
  fileSize: number;
  importedAt: string;
  added: number;
  updated: number;
  skipped: number;
}> {
  const headerCheck = verifyHeader(buffer);
  if (!headerCheck.valid) {
    throw new Error(`Invalid labels.db file: ${headerCheck.error}`);
  }

  const incomingDb = parseLabelsDb(buffer);

  // Check if local labels.db exists
  const localData = await storage.getLabelsDb();

  if (!localData) {
    // No existing labels.db - just do a straight import
    await storage.setLabelsDb(buffer, incomingDb.entryCount);
    return {
      success: true,
      entryCount: incomingDb.entryCount,
      fileSize: buffer.byteLength,
      importedAt: new Date().toISOString(),
      added: incomingDb.entryCount,
      updated: 0,
      skipped: 0,
    };
  }

  // Merge the databases
  let resultData = localData;
  let localDb = parseLabelsDb(localData);
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const entry of incomingDb.entries) {
    const existsInLocal = localDb.idToIndex.has(entry.cartId);

    if (existsInLocal) {
      if (mode === 'merge-overwrite') {
        // Extract raw image from incoming buffer and update
        const rawBgra = extractRawImage(buffer, entry.index);
        resultData = updateEntry(resultData, entry.cartId, rawBgra);
        updated++;
      } else {
        // merge-skip: don't update existing
        skipped++;
      }
    } else {
      // Entry doesn't exist - add it
      const rawBgra = extractRawImage(buffer, entry.index);
      resultData = addEntry(resultData, entry.cartId, rawBgra);
      // Re-parse to update the idToIndex map for next iteration
      localDb = parseLabelsDb(resultData);
      added++;
    }
  }

  const finalDb = parseLabelsDb(resultData);
  await storage.setLabelsDb(resultData, finalDb.entryCount);

  return {
    success: true,
    entryCount: finalDb.entryCount,
    fileSize: resultData.byteLength,
    importedAt: new Date().toISOString(),
    added,
    updated,
    skipped,
  };
}

/**
 * Get all entries from local labels.db
 */
export async function getAllLocalLabelsDbEntries(): Promise<Array<{ cartId: string; index: number }> | null> {
  const data = await storage.getLabelsDb();
  if (!data) return null;

  const db = parseLabelsDb(data);
  return db.entries.map((e) => ({
    cartId: e.cartIdHex,
    index: e.index,
  }));
}

/**
 * Get paginated entries from labels.db
 */
export async function getLabelsDbPage(
  page: number,
  pageSize: number
): Promise<{
  page: number;
  pageSize: number;
  totalPages: number;
  totalEntries: number;
  entries: Array<{ cartId: string; index: number }>;
} | null> {
  const data = await storage.getLabelsDb();
  if (!data) return null;

  const db = parseLabelsDb(data);
  const start = page * pageSize;
  const end = Math.min(start + pageSize, db.entryCount);

  const entries = db.entries.slice(start, end).map((e) => ({
    cartId: e.cartIdHex,
    index: e.index,
  }));

  return {
    page,
    pageSize,
    totalPages: Math.ceil(db.entryCount / pageSize),
    totalEntries: db.entryCount,
    entries,
  };
}

/**
 * Get a label image as PNG blob from local labels.db
 */
export async function getLabelsDbImage(cartIdHex: string): Promise<Blob | null> {
  const data = await storage.getLabelsDb();
  if (!data) return null;

  const image = await getImageByCartIdHex(data, cartIdHex);
  return image?.png || null;
}

/**
 * Get a label image URL (object URL) from local labels.db
 */
export async function getLabelsDbImageUrl(cartIdHex: string): Promise<string | null> {
  const blob = await getLabelsDbImage(cartIdHex);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

/**
 * Add a new entry to the local labels.db
 */
export async function addEntryToLabelsDb(
  cartId: number,
  bgraData: Uint8Array
): Promise<void> {
  let data = await storage.getLabelsDb();

  if (!data) {
    // Create empty labels.db
    data = createEmptyLabelsDb();
  }

  const updatedData = addEntry(data, cartId, bgraData);
  const db = parseLabelsDb(updatedData);
  await storage.setLabelsDb(updatedData, db.entryCount);
}

/**
 * Update an entry in the local labels.db (or add if not exists)
 */
export async function updateEntryInLabelsDb(
  cartId: number,
  bgraData: Uint8Array
): Promise<void> {
  let data = await storage.getLabelsDb();

  if (!data) {
    // Create empty labels.db
    data = createEmptyLabelsDb();
  }

  const db = parseLabelsDb(data);
  const exists = db.idToIndex.has(cartId);

  let updatedData: ArrayBuffer;
  if (exists) {
    updatedData = updateEntry(data, cartId, bgraData);
  } else {
    updatedData = addEntry(data, cartId, bgraData);
  }

  const finalDb = parseLabelsDb(updatedData);
  await storage.setLabelsDb(updatedData, finalDb.entryCount);
}

/**
 * Delete an entry from the local labels.db
 */
export async function deleteEntryFromLabelsDb(cartId: number): Promise<void> {
  const data = await storage.getLabelsDb();
  if (!data) {
    throw new Error('No labels.db found');
  }

  const updatedData = deleteEntry(data, cartId);
  const db = parseLabelsDb(updatedData);
  await storage.setLabelsDb(updatedData, db.entryCount);
}

/**
 * Search entries in labels.db by cart ID
 */
export async function searchLabelsDb(
  query: string,
  limit: number = 50
): Promise<Array<{ cartId: string; index: number }>> {
  const data = await storage.getLabelsDb();
  if (!data) return [];

  const db = parseLabelsDb(data);
  const queryLower = query.toLowerCase();
  const matches: Array<{ cartId: string; index: number }> = [];

  for (const entry of db.entries) {
    if (entry.cartIdHex.includes(queryLower)) {
      matches.push({ cartId: entry.cartIdHex, index: entry.index });
      if (matches.length >= limit) break;
    }
  }

  return matches;
}

/**
 * Export the local labels.db as ArrayBuffer
 */
export async function exportLabelsDb(): Promise<ArrayBuffer | null> {
  return storage.getLabelsDb();
}

/**
 * Delete the local labels.db
 */
export async function deleteLabelsDb(): Promise<void> {
  await storage.deleteLabelsDb();
}
