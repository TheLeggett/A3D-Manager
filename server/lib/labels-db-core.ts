/**
 * labels.db Library
 *
 * A clean, well-documented library for reading, writing, and manipulating
 * Analogue 3D labels.db files.
 *
 * This library is designed to:
 * 1. Serve as a reference implementation of the labels.db specification
 * 2. Provide a foundation for testing and validation
 * 3. Replace existing ad-hoc implementations
 */

import { readFile, writeFile, copyFile, mkdir, access, constants } from 'fs/promises';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import sharp from 'sharp';

// =============================================================================
// Constants
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
  rgba: Buffer;
  /** PNG encoded image */
  png: Buffer;
}

// =============================================================================
// Header Operations
// =============================================================================

/**
 * Create a valid labels.db header
 */
export function createHeader(): Buffer {
  const header = Buffer.alloc(HEADER_SIZE, 0x00);

  // Magic byte at 0x00
  header[0] = MAGIC_BYTE;

  // Identifier "Analogue-Co" at 0x01
  header.write(IDENTIFIER, 1, 'ascii');

  // File type "Analogue-3D.labels" at 0x20
  header.write(FILE_TYPE, 0x20, 'ascii');

  // Version 2.0 at 0x40 (little-endian)
  header.writeUInt32LE(VERSION, 0x40);

  return header;
}

/**
 * Verify a labels.db header is valid
 */
export function verifyHeader(data: Buffer): { valid: boolean; error?: string } {
  if (data.length < HEADER_SIZE) {
    return { valid: false, error: `File too small: ${data.length} bytes, need at least ${HEADER_SIZE}` };
  }

  const magic = data[0];
  if (magic !== MAGIC_BYTE) {
    return { valid: false, error: `Invalid magic byte: 0x${magic.toString(16)}, expected 0x${MAGIC_BYTE.toString(16)}` };
  }

  const identifier = data.subarray(1, 12).toString('ascii');
  if (identifier !== IDENTIFIER) {
    return { valid: false, error: `Invalid identifier: "${identifier}", expected "${IDENTIFIER}"` };
  }

  const fileType = data.subarray(0x20, 0x20 + FILE_TYPE.length).toString('ascii');
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
export function parseLabelsDb(data: Buffer): LabelsDatabase {
  const verification = verifyHeader(data);
  if (!verification.valid) {
    throw new Error(`Invalid labels.db: ${verification.error}`);
  }

  // Calculate entry count from file size
  const imageDataSize = data.length - DATA_START;
  if (imageDataSize < 0) {
    throw new Error(`File too small: ${data.length} bytes, minimum is ${DATA_START}`);
  }

  const entryCount = Math.floor(imageDataSize / IMAGE_SLOT_SIZE);

  // Parse ID table
  const entries: LabelEntry[] = [];
  const idToIndex = new Map<number, number>();

  for (let i = 0; i < entryCount; i++) {
    const offset = ID_TABLE_START + i * 4;
    const cartId = data.readUInt32LE(offset);

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

/**
 * Parse a labels.db file from disk
 */
export async function parseLabelsDbFile(filePath: string): Promise<LabelsDatabase> {
  const data = await readFile(filePath);
  return parseLabelsDb(data);
}

/**
 * Parse a labels.db file synchronously
 */
export function parseLabelsDbFileSync(filePath: string): LabelsDatabase {
  const data = readFileSync(filePath);
  return parseLabelsDb(data);
}

// =============================================================================
// Image Operations
// =============================================================================

/**
 * Convert BGRA buffer to RGBA buffer
 */
export function bgraToRgba(bgra: Buffer): Buffer {
  const rgba = Buffer.alloc(bgra.length);
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
 * Convert RGBA buffer to BGRA buffer
 */
export function rgbaToBgra(rgba: Buffer): Buffer {
  const bgra = Buffer.alloc(rgba.length);
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
export function extractRawImage(data: Buffer, index: number): Buffer {
  const offset = DATA_START + index * IMAGE_SLOT_SIZE;
  return data.subarray(offset, offset + IMAGE_DATA_SIZE);
}

/**
 * Extract an image from labels.db by index
 */
export async function getImageByIndex(data: Buffer, index: number): Promise<LabelImage> {
  const db = parseLabelsDb(data);

  if (index < 0 || index >= db.entryCount) {
    throw new Error(`Index ${index} out of range (0-${db.entryCount - 1})`);
  }

  const entry = db.entries[index];
  const rawBgra = extractRawImage(data, index);
  const rgba = bgraToRgba(rawBgra);

  const png = await sharp(rgba, {
    raw: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT, channels: 4 },
  })
    .png()
    .toBuffer();

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
export async function getImageByCartId(data: Buffer, cartId: number): Promise<LabelImage | null> {
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
export async function getImageByCartIdHex(data: Buffer, cartIdHex: string): Promise<LabelImage | null> {
  const cartId = parseInt(cartIdHex, 16);
  return getImageByCartId(data, cartId);
}

// =============================================================================
// Creation Operations
// =============================================================================

/**
 * Create an empty labels.db with no entries
 */
export function createEmptyLabelsDb(): Buffer {
  const buffer = Buffer.alloc(DATA_START, PADDING_FILL);

  // Write header (overwrites padding in header region)
  const header = createHeader();
  header.copy(buffer, 0);

  return buffer;
}

/**
 * Prepare an image for storage in labels.db
 * Resizes to 74x86 and converts to BGRA format
 */
export async function prepareImageForStorage(imageBuffer: Buffer): Promise<Buffer> {
  // Resize to 74x86 and get raw RGBA
  const rgba = await sharp(imageBuffer)
    .resize(IMAGE_WIDTH, IMAGE_HEIGHT, {
      fit: 'cover',
      position: 'center',
    })
    .ensureAlpha()
    .raw()
    .toBuffer();

  if (rgba.length !== IMAGE_DATA_SIZE) {
    throw new Error(`Unexpected image size: ${rgba.length}, expected ${IMAGE_DATA_SIZE}`);
  }

  // Convert RGBA to BGRA
  return rgbaToBgra(rgba);
}

/**
 * Create a complete image slot with BGRA data and padding
 */
export function createImageSlot(bgraData: Buffer): Buffer {
  if (bgraData.length !== IMAGE_DATA_SIZE) {
    throw new Error(`Invalid BGRA data size: ${bgraData.length}, expected ${IMAGE_DATA_SIZE}`);
  }

  const slot = Buffer.alloc(IMAGE_SLOT_SIZE, PADDING_FILL);
  bgraData.copy(slot, 0);
  return slot;
}

/**
 * Create a new labels.db with the specified entries
 *
 * @param entries Array of { cartId, imageBuffer } objects
 * @returns Complete labels.db buffer
 */
export async function createLabelsDb(
  entries: Array<{ cartId: number; imageBuffer: Buffer }>
): Promise<Buffer> {
  // Sort entries by cartridge ID (required for binary search)
  const sortedEntries = [...entries].sort((a, b) => a.cartId - b.cartId);

  // Calculate total size
  const totalSize = DATA_START + sortedEntries.length * IMAGE_SLOT_SIZE;
  const buffer = Buffer.alloc(totalSize, PADDING_FILL);

  // Write header
  const header = createHeader();
  header.copy(buffer, 0);

  // Write ID table
  for (let i = 0; i < sortedEntries.length; i++) {
    buffer.writeUInt32LE(sortedEntries[i].cartId, ID_TABLE_START + i * 4);
  }

  // Write image data
  for (let i = 0; i < sortedEntries.length; i++) {
    const bgraData = await prepareImageForStorage(sortedEntries[i].imageBuffer);
    const slot = createImageSlot(bgraData);
    slot.copy(buffer, DATA_START + i * IMAGE_SLOT_SIZE);
  }

  return buffer;
}

// =============================================================================
// Modification Operations
// =============================================================================

/**
 * Update an existing entry's image in labels.db
 *
 * @param data Existing labels.db buffer
 * @param cartId Cartridge ID to update
 * @param imageBuffer New image data
 * @returns Updated labels.db buffer (new buffer, original unchanged)
 */
export async function updateEntry(
  data: Buffer,
  cartId: number,
  imageBuffer: Buffer
): Promise<Buffer> {
  const db = parseLabelsDb(data);
  const index = db.idToIndex.get(cartId);

  if (index === undefined) {
    throw new Error(`Cartridge ID 0x${cartId.toString(16)} not found`);
  }

  // Create a copy of the buffer
  const newData = Buffer.from(data);

  // Prepare and write new image
  const bgraData = await prepareImageForStorage(imageBuffer);
  const slot = createImageSlot(bgraData);
  slot.copy(newData, DATA_START + index * IMAGE_SLOT_SIZE);

  return newData;
}

/**
 * Add a new entry to labels.db
 *
 * @param data Existing labels.db buffer
 * @param cartId New cartridge ID
 * @param imageBuffer Image data for new entry
 * @returns Updated labels.db buffer (new buffer, original unchanged)
 */
export async function addEntry(
  data: Buffer,
  cartId: number,
  imageBuffer: Buffer
): Promise<Buffer> {
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
  const newSize = data.length + IMAGE_SLOT_SIZE;
  const newData = Buffer.alloc(newSize, PADDING_FILL);

  // Copy header
  data.copy(newData, 0, 0, HEADER_SIZE);

  // Write ID table with new entry inserted
  for (let i = 0; i < insertIndex; i++) {
    newData.writeUInt32LE(db.entries[i].cartId, ID_TABLE_START + i * 4);
  }
  newData.writeUInt32LE(cartId, ID_TABLE_START + insertIndex * 4);
  for (let i = insertIndex; i < db.entries.length; i++) {
    newData.writeUInt32LE(db.entries[i].cartId, ID_TABLE_START + (i + 1) * 4);
  }

  // Copy image data with new image inserted
  for (let i = 0; i < insertIndex; i++) {
    const srcOffset = DATA_START + i * IMAGE_SLOT_SIZE;
    const dstOffset = DATA_START + i * IMAGE_SLOT_SIZE;
    data.copy(newData, dstOffset, srcOffset, srcOffset + IMAGE_SLOT_SIZE);
  }

  // Insert new image
  const bgraData = await prepareImageForStorage(imageBuffer);
  const slot = createImageSlot(bgraData);
  slot.copy(newData, DATA_START + insertIndex * IMAGE_SLOT_SIZE);

  // Copy remaining images
  for (let i = insertIndex; i < db.entries.length; i++) {
    const srcOffset = DATA_START + i * IMAGE_SLOT_SIZE;
    const dstOffset = DATA_START + (i + 1) * IMAGE_SLOT_SIZE;
    data.copy(newData, dstOffset, srcOffset, srcOffset + IMAGE_SLOT_SIZE);
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
export function deleteEntry(data: Buffer, cartId: number): Buffer {
  const db = parseLabelsDb(data);
  const index = db.idToIndex.get(cartId);

  if (index === undefined) {
    throw new Error(`Cartridge ID 0x${cartId.toString(16)} not found`);
  }

  // Allocate new buffer (smaller)
  const newSize = data.length - IMAGE_SLOT_SIZE;
  const newData = Buffer.alloc(newSize, PADDING_FILL);

  // Copy header
  data.copy(newData, 0, 0, HEADER_SIZE);

  // Write ID table without deleted entry
  let newIndex = 0;
  for (let i = 0; i < db.entries.length; i++) {
    if (i === index) continue;
    newData.writeUInt32LE(db.entries[i].cartId, ID_TABLE_START + newIndex * 4);
    newIndex++;
  }

  // Copy image data without deleted image
  newIndex = 0;
  for (let i = 0; i < db.entries.length; i++) {
    if (i === index) continue;
    const srcOffset = DATA_START + i * IMAGE_SLOT_SIZE;
    const dstOffset = DATA_START + newIndex * IMAGE_SLOT_SIZE;
    data.copy(newData, dstOffset, srcOffset, srcOffset + IMAGE_SLOT_SIZE);
    newIndex++;
  }

  return newData;
}

// =============================================================================
// File Operations
// =============================================================================

/**
 * Read a labels.db file from disk
 */
export async function readLabelsDbFile(filePath: string): Promise<Buffer> {
  return readFile(filePath);
}

/**
 * Write a labels.db buffer to disk
 */
export async function writeLabelsDbFile(filePath: string, data: Buffer): Promise<void> {
  await writeFile(filePath, data);
}

/**
 * Write a labels.db buffer to disk synchronously
 */
export function writeLabelsDbFileSync(filePath: string, data: Buffer): void {
  writeFileSync(filePath, data);
}

// =============================================================================
// File-Path Based Operations (Convenience Wrappers)
// =============================================================================

/**
 * Get a label image as PNG buffer by cartridge ID (file-path based)
 */
export async function getLabelImage(
  labelsPath: string,
  cartId: number
): Promise<Buffer | null> {
  const data = await readFile(labelsPath);
  const image = await getImageByCartId(data, cartId);
  return image?.png || null;
}

/**
 * Get a label image as PNG buffer by hex string cartridge ID (file-path based)
 */
export async function getLabelImageByHex(
  labelsPath: string,
  cartIdHex: string
): Promise<Buffer | null> {
  const cartId = parseInt(cartIdHex, 16);
  return getLabelImage(labelsPath, cartId);
}

/**
 * Update a label image in labels.db file
 */
export async function updateLabelImage(
  labelsPath: string,
  cartId: number,
  imageBuffer: Buffer
): Promise<void> {
  const data = await readFile(labelsPath);
  const updatedData = await updateEntry(data, cartId, imageBuffer);
  await writeFile(labelsPath, updatedData);
}

/**
 * Add a new cartridge to labels.db file
 */
export async function addCartridge(
  labelsPath: string,
  cartId: number,
  imageBuffer: Buffer
): Promise<void> {
  const data = await readFile(labelsPath);
  const updatedData = await addEntry(data, cartId, imageBuffer);
  await writeFile(labelsPath, updatedData);
}

/**
 * Get all entries from a labels.db file
 */
export async function getAllEntries(labelsPath: string): Promise<LabelEntry[]> {
  const data = await readFile(labelsPath);
  const db = parseLabelsDb(data);
  return db.entries;
}

// =============================================================================
// Export to SD Card
// =============================================================================

/**
 * Export local labels.db to SD card by copying the file
 */
export async function exportLabelsToSD(sdLabelsPath: string): Promise<{ entryCount: number }> {
  // Check if local labels.db exists
  const hasLocal = await hasLocalLabelsDb();
  if (!hasLocal) {
    throw new Error('No local labels.db found. Import labels first.');
  }

  // Read local labels.db
  const data = await readFile(LOCAL_LABELS_DB_PATH);
  const db = parseLabelsDb(data);

  // Ensure target directory exists
  await mkdir(path.dirname(sdLabelsPath), { recursive: true });

  // Copy to SD card
  await copyFile(LOCAL_LABELS_DB_PATH, sdLabelsPath);

  return { entryCount: db.entryCount };
}

// =============================================================================
// Direct labels.db Storage (Experimental v2 API)
// =============================================================================

const LOCAL_LABELS_DB_PATH = path.join(process.cwd(), '.local', 'labels.db');

/**
 * Check if a local labels.db file exists
 */
export async function hasLocalLabelsDb(): Promise<boolean> {
  try {
    await access(LOCAL_LABELS_DB_PATH, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the path to the local labels.db file
 */
export function getLocalLabelsDbPath(): string {
  return LOCAL_LABELS_DB_PATH;
}

/**
 * Import a labels.db file by copying it to local storage
 * Returns metadata about the imported file
 */
export async function importLabelsDbFile(sourcePath: string): Promise<{
  success: boolean;
  entryCount: number;
  fileSize: number;
  importedAt: string;
}> {
  // Ensure parent directory exists
  await mkdir(path.dirname(LOCAL_LABELS_DB_PATH), { recursive: true });

  // Copy the file
  await copyFile(sourcePath, LOCAL_LABELS_DB_PATH);

  // Parse to get entry count
  const data = await readFile(LOCAL_LABELS_DB_PATH);
  const db = parseLabelsDb(data);

  return {
    success: true,
    entryCount: db.entryCount,
    fileSize: data.length,
    importedAt: new Date().toISOString(),
  };
}

/**
 * Import a labels.db file from a buffer (for file uploads)
 * Returns metadata about the imported file
 */
export async function importLabelsDbFileFromBuffer(buffer: Buffer): Promise<{
  success: boolean;
  entryCount: number;
  fileSize: number;
  importedAt: string;
}> {
  // Verify header before saving
  const headerCheck = verifyHeader(buffer);
  if (!headerCheck.valid) {
    throw new Error(`Invalid labels.db file: ${headerCheck.error}`);
  }

  // Ensure parent directory exists
  await mkdir(path.dirname(LOCAL_LABELS_DB_PATH), { recursive: true });

  // Write the buffer to disk
  await writeFile(LOCAL_LABELS_DB_PATH, buffer);

  // Parse to get entry count
  const db = parseLabelsDb(buffer);

  return {
    success: true,
    entryCount: db.entryCount,
    fileSize: buffer.length,
    importedAt: new Date().toISOString(),
  };
}

/**
 * Get labels.db status - entry count and metadata without loading all entries
 */
export async function getLabelsDbStatus(): Promise<{
  exists: boolean;
  entryCount: number;
  fileSize: number;
} | null> {
  try {
    const data = await readFile(LOCAL_LABELS_DB_PATH);
    const db = parseLabelsDb(data);
    return {
      exists: true,
      entryCount: db.entryCount,
      fileSize: data.length,
    };
  } catch {
    return null;
  }
}

/**
 * Read and parse the local labels.db file
 */
async function readLocalLabelsDb(): Promise<{ data: Buffer; db: LabelsDatabase } | null> {
  try {
    const data = await readFile(LOCAL_LABELS_DB_PATH);
    const db = parseLabelsDb(data);
    return { data, db };
  } catch {
    return null;
  }
}

/**
 * Get all entries from local labels.db (metadata only, no images)
 */
export async function getAllLocalLabelsDbEntries(): Promise<Array<{ cartId: string; index: number }> | null> {
  const result = await readLocalLabelsDb();
  if (!result) return null;

  return result.db.entries.map(e => ({
    cartId: e.cartIdHex,
    index: e.index,
  }));
}

/**
 * Get paginated entries from labels.db (metadata only, no images)
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
  const result = await readLocalLabelsDb();
  if (!result) return null;

  const { db } = result;
  const start = page * pageSize;
  const end = Math.min(start + pageSize, db.entryCount);

  const entries = db.entries.slice(start, end).map(e => ({
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
 * Get a label image directly from local labels.db by cart ID hex
 */
export async function getLabelsDbImage(cartIdHex: string): Promise<Buffer | null> {
  const result = await readLocalLabelsDb();
  if (!result) return null;

  const { data, db } = result;
  const cartId = parseInt(cartIdHex, 16);
  const index = db.idToIndex.get(cartId);

  if (index === undefined) return null;

  // Extract raw BGRA data
  const offset = DATA_START + index * IMAGE_SLOT_SIZE;
  const rawBgra = data.subarray(offset, offset + IMAGE_DATA_SIZE);

  // Convert BGRA to RGBA
  const rgba = bgraToRgba(rawBgra);

  // Encode as PNG
  const png = await sharp(rgba, {
    raw: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT, channels: 4 },
  })
    .png()
    .toBuffer();

  return png;
}

/**
 * Get a label image from any labels.db file by cart ID hex
 * Used for reading directly from SD card
 */
export async function getLabelsDbImageFromPath(labelsDbPath: string, cartIdHex: string): Promise<Buffer | null> {
  try {
    const data = await readFile(labelsDbPath);
    const db = parseLabelsDb(data);

    const cartId = parseInt(cartIdHex, 16);
    const index = db.idToIndex.get(cartId);

    if (index === undefined) return null;

    // Extract raw BGRA data
    const offset = DATA_START + index * IMAGE_SLOT_SIZE;
    const rawBgra = data.subarray(offset, offset + IMAGE_DATA_SIZE);

    // Convert BGRA to RGBA
    const rgba = bgraToRgba(rawBgra);

    // Encode as PNG
    const png = await sharp(rgba, {
      raw: { width: IMAGE_WIDTH, height: IMAGE_HEIGHT, channels: 4 },
    })
      .png()
      .toBuffer();

    return png;
  } catch {
    return null;
  }
}

/**
 * Search entries in labels.db by cart ID
 */
export async function searchLabelsDb(
  query: string,
  limit: number = 50
): Promise<Array<{ cartId: string; index: number }>> {
  const result = await readLocalLabelsDb();
  if (!result) return [];

  const { db } = result;
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
 * Add a new entry to the local labels.db file
 * Creates an empty labels.db if one doesn't exist yet
 */
export async function addEntryToLabelsDb(
  cartId: number,
  imageBuffer: Buffer
): Promise<void> {
  // Ensure parent directory exists
  await mkdir(path.dirname(LOCAL_LABELS_DB_PATH), { recursive: true });

  let data: Buffer;

  // Check if labels.db exists
  try {
    await access(LOCAL_LABELS_DB_PATH, constants.R_OK);
    data = await readFile(LOCAL_LABELS_DB_PATH);
  } catch {
    // Create empty labels.db
    data = createEmptyLabelsDb();
  }

  // Add the entry
  const updatedData = await addEntry(data, cartId, imageBuffer);

  // Write back to disk
  await writeFile(LOCAL_LABELS_DB_PATH, updatedData);
}

/**
 * Delete an entry from the local labels.db file
 */
export async function deleteEntryFromLabelsDb(cartId: number): Promise<void> {
  // Read existing labels.db
  const data = await readFile(LOCAL_LABELS_DB_PATH);

  // Delete the entry
  const updatedData = deleteEntry(data, cartId);

  // Write back to disk
  await writeFile(LOCAL_LABELS_DB_PATH, updatedData);
}

/**
 * Update an existing entry in the local labels.db file
 */
export async function updateEntryInLabelsDb(
  cartId: number,
  imageBuffer: Buffer
): Promise<void> {
  // Read existing labels.db
  const data = await readFile(LOCAL_LABELS_DB_PATH);

  // Update the entry
  const updatedData = await updateEntry(data, cartId, imageBuffer);

  // Write back to disk
  await writeFile(LOCAL_LABELS_DB_PATH, updatedData);
}

/**
 * Merge an imported labels.db with the existing local one
 * @param buffer - The incoming labels.db buffer to merge
 * @param mode - 'merge-overwrite' to update existing entries, 'merge-skip' to only add new
 */
export async function mergeLabelsDbFromBuffer(
  buffer: Buffer,
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
  // Verify incoming file is valid
  const headerCheck = verifyHeader(buffer);
  if (!headerCheck.valid) {
    throw new Error(`Invalid labels.db file: ${headerCheck.error}`);
  }

  // Parse the incoming database
  const incomingDb = parseLabelsDb(buffer);

  // Check if local labels.db exists
  let localData: Buffer;
  let localDb: LabelsDatabase;

  try {
    await access(LOCAL_LABELS_DB_PATH, constants.R_OK);
    localData = await readFile(LOCAL_LABELS_DB_PATH);
    localDb = parseLabelsDb(localData);
  } catch {
    // No existing labels.db - just do a straight import
    await mkdir(path.dirname(LOCAL_LABELS_DB_PATH), { recursive: true });
    await writeFile(LOCAL_LABELS_DB_PATH, buffer);
    return {
      success: true,
      entryCount: incomingDb.entryCount,
      fileSize: buffer.length,
      importedAt: new Date().toISOString(),
      added: incomingDb.entryCount,
      updated: 0,
      skipped: 0,
    };
  }

  // Merge the databases
  let resultData = localData;
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const entry of incomingDb.entries) {
    const existsInLocal = localDb.idToIndex.has(entry.cartId);

    if (existsInLocal) {
      if (mode === 'merge-overwrite') {
        // Extract raw image from incoming buffer and update
        const rawBgra = extractRawImage(buffer, entry.index);
        const slot = createImageSlot(rawBgra);

        // Find the index in local and update
        const localIndex = localDb.idToIndex.get(entry.cartId)!;
        slot.copy(resultData, DATA_START + localIndex * IMAGE_SLOT_SIZE);
        updated++;
      } else {
        // merge-skip: don't update existing
        skipped++;
      }
    } else {
      // Entry doesn't exist - add it
      const rawBgra = extractRawImage(buffer, entry.index);
      // Need to convert to a format addEntry can use - addEntry expects an image buffer
      // Create a minimal image buffer from the raw BGRA
      const slot = createImageSlot(rawBgra);

      // We need to add this entry to the result
      // Unfortunately addEntry expects a PNG/image buffer, not raw BGRA
      // Let's work directly with the buffer instead

      // Re-parse current state
      const currentDb = parseLabelsDb(resultData);

      // Find insertion point
      let insertIndex = 0;
      for (let i = 0; i < currentDb.entries.length; i++) {
        if (currentDb.entries[i].cartId > entry.cartId) {
          break;
        }
        insertIndex = i + 1;
      }

      // Allocate new buffer
      const newSize = resultData.length + IMAGE_SLOT_SIZE;
      const newData = Buffer.alloc(newSize, PADDING_FILL);

      // Copy header
      resultData.copy(newData, 0, 0, HEADER_SIZE);

      // Write ID table with new entry inserted
      for (let i = 0; i < insertIndex; i++) {
        newData.writeUInt32LE(currentDb.entries[i].cartId, ID_TABLE_START + i * 4);
      }
      newData.writeUInt32LE(entry.cartId, ID_TABLE_START + insertIndex * 4);
      for (let i = insertIndex; i < currentDb.entries.length; i++) {
        newData.writeUInt32LE(currentDb.entries[i].cartId, ID_TABLE_START + (i + 1) * 4);
      }

      // Copy image data with new image inserted
      for (let i = 0; i < insertIndex; i++) {
        const srcOffset = DATA_START + i * IMAGE_SLOT_SIZE;
        const dstOffset = DATA_START + i * IMAGE_SLOT_SIZE;
        resultData.copy(newData, dstOffset, srcOffset, srcOffset + IMAGE_SLOT_SIZE);
      }

      // Insert new image
      slot.copy(newData, DATA_START + insertIndex * IMAGE_SLOT_SIZE);

      // Copy remaining images
      for (let i = insertIndex; i < currentDb.entries.length; i++) {
        const srcOffset = DATA_START + i * IMAGE_SLOT_SIZE;
        const dstOffset = DATA_START + (i + 1) * IMAGE_SLOT_SIZE;
        resultData.copy(newData, dstOffset, srcOffset, srcOffset + IMAGE_SLOT_SIZE);
      }

      resultData = newData;
      added++;
    }
  }

  // Write result to disk
  await mkdir(path.dirname(LOCAL_LABELS_DB_PATH), { recursive: true });
  await writeFile(LOCAL_LABELS_DB_PATH, resultData);

  const finalDb = parseLabelsDb(resultData);

  return {
    success: true,
    entryCount: finalDb.entryCount,
    fileSize: resultData.length,
    importedAt: new Date().toISOString(),
    added,
    updated,
    skipped,
  };
}
