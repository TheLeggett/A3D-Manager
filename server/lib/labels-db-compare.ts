/**
 * Fast comparison utilities for labels.db files
 */

import { createHash } from 'crypto';
import { open, stat, type FileHandle } from 'fs/promises';
import {
  ID_TABLE_START,
  DATA_START,
  IMAGE_SLOT_SIZE,
  IMAGE_DATA_SIZE,
} from './labels-db-core.js';

export interface CompareQuickResult {
  identical: boolean;
  reason?: 'size_mismatch' | 'entry_count_mismatch' | 'id_table_mismatch' | 'unknown';
  localSize: number;
  otherSize: number;
  localEntryCount: number;
  otherEntryCount: number;
  durationMs: number;
}

export interface CompareDetailedResult {
  identical: boolean;
  onlyInLocal: string[];      // Cart IDs only in local
  onlyInOther: string[];      // Cart IDs only in other (SD)
  modified: string[];         // Cart IDs with different image data
  totalCompared: number;
  durationMs: number;
  breakdown: {
    idTableReadMs: number;
    idCompareMs: number;
    imageCompareMs: number;
  };
}

/**
 * Read the ID table from a labels.db file
 * Returns array of cart IDs as hex strings, sorted
 */
async function readIdTable(filePath: string): Promise<{ ids: Map<number, number>; entryCount: number }> {
  const fileHandle = await open(filePath, 'r');
  try {
    const stats = await stat(filePath);
    const fileSize = stats.size;

    // Calculate entry count from file size
    const imageDataSize = fileSize - DATA_START;
    if (imageDataSize < 0) {
      return { ids: new Map(), entryCount: 0 };
    }
    const entryCount = Math.floor(imageDataSize / IMAGE_SLOT_SIZE);

    // Read the ID table (4 bytes per entry)
    const idTableSize = entryCount * 4;
    const buffer = Buffer.alloc(idTableSize);
    await fileHandle.read(buffer, 0, idTableSize, ID_TABLE_START);

    // Parse IDs into a map of cartId -> index
    const ids = new Map<number, number>();
    for (let i = 0; i < entryCount; i++) {
      const cartId = buffer.readUInt32LE(i * 4);
      if (cartId === 0xffffffff) break; // End of table
      ids.set(cartId, i);
    }

    return { ids, entryCount: ids.size };
  } finally {
    await fileHandle.close();
  }
}

/**
 * Compute a quick hash of the ID table for fast comparison
 */
async function hashIdTable(filePath: string): Promise<string> {
  const fileHandle = await open(filePath, 'r');
  try {
    const stats = await stat(filePath);
    const fileSize = stats.size;

    const imageDataSize = fileSize - DATA_START;
    const entryCount = Math.floor(imageDataSize / IMAGE_SLOT_SIZE);
    const idTableSize = entryCount * 4;

    const buffer = Buffer.alloc(idTableSize);
    await fileHandle.read(buffer, 0, idTableSize, ID_TABLE_START);

    return createHash('md5').update(buffer).digest('hex');
  } finally {
    await fileHandle.close();
  }
}

/**
 * Compute a quick hash of a single image slot
 * Uses first 1KB + last 1KB for speed while still being reliable
 */
async function hashImageSlot(fileHandle: FileHandle, index: number): Promise<string> {
  const offset = DATA_START + index * IMAGE_SLOT_SIZE;

  // Read first 1KB and last 1KB of actual image data (not padding)
  const sampleSize = 1024;
  const buffer = Buffer.alloc(sampleSize * 2);

  // First 1KB
  await fileHandle.read(buffer, 0, sampleSize, offset);
  // Last 1KB of image data (before padding)
  await fileHandle.read(buffer, sampleSize, sampleSize, offset + IMAGE_DATA_SIZE - sampleSize);

  return createHash('md5').update(buffer).digest('hex');
}

/**
 * Compute full hash of an image slot (more accurate but slower)
 */
async function hashImageSlotFull(fileHandle: FileHandle, index: number): Promise<string> {
  const offset = DATA_START + index * IMAGE_SLOT_SIZE;
  const buffer = Buffer.alloc(IMAGE_DATA_SIZE);
  await fileHandle.read(buffer, 0, IMAGE_DATA_SIZE, offset);
  return createHash('md5').update(buffer).digest('hex');
}

/**
 * Quick check if two labels.db files are different
 * Fast: only reads file sizes and ID tables (~4KB each)
 */
export async function compareQuick(localPath: string, otherPath: string): Promise<CompareQuickResult> {
  const startTime = performance.now();

  try {
    // Step 1: Compare file sizes (instant)
    const [localStats, otherStats] = await Promise.all([
      stat(localPath),
      stat(otherPath),
    ]);

    const localSize = localStats.size;
    const otherSize = otherStats.size;

    // Calculate entry counts
    const localEntryCount = Math.floor((localSize - DATA_START) / IMAGE_SLOT_SIZE);
    const otherEntryCount = Math.floor((otherSize - DATA_START) / IMAGE_SLOT_SIZE);

    if (localSize !== otherSize) {
      return {
        identical: false,
        reason: 'size_mismatch',
        localSize,
        otherSize,
        localEntryCount,
        otherEntryCount,
        durationMs: performance.now() - startTime,
      };
    }

    // Step 2: Compare ID table hashes
    const [localIdHash, otherIdHash] = await Promise.all([
      hashIdTable(localPath),
      hashIdTable(otherPath),
    ]);

    if (localIdHash !== otherIdHash) {
      return {
        identical: false,
        reason: 'id_table_mismatch',
        localSize,
        otherSize,
        localEntryCount,
        otherEntryCount,
        durationMs: performance.now() - startTime,
      };
    }

    // Files appear identical (same size, same IDs)
    // Note: Images could still differ, but this is a "quick" check
    return {
      identical: true,
      localSize,
      otherSize,
      localEntryCount,
      otherEntryCount,
      durationMs: performance.now() - startTime,
    };
  } catch {
    return {
      identical: false,
      reason: 'unknown',
      localSize: 0,
      otherSize: 0,
      localEntryCount: 0,
      otherEntryCount: 0,
      durationMs: performance.now() - startTime,
    };
  }
}

/**
 * Detailed comparison finding exactly which entries differ
 * Slower but comprehensive
 */
export async function compareDetailed(
  localPath: string,
  otherPath: string,
  options: { fullImageHash?: boolean } = {}
): Promise<CompareDetailedResult> {
  const startTime = performance.now();
  const breakdown = { idTableReadMs: 0, idCompareMs: 0, imageCompareMs: 0 };

  // Step 1: Read both ID tables
  const idTableStart = performance.now();
  const [localTable, otherTable] = await Promise.all([
    readIdTable(localPath),
    readIdTable(otherPath),
  ]);
  breakdown.idTableReadMs = performance.now() - idTableStart;

  // Step 2: Find differences in cart IDs
  const idCompareStart = performance.now();
  const onlyInLocal: string[] = [];
  const onlyInOther: string[] = [];
  const inBoth: Array<{ cartId: number; localIndex: number; otherIndex: number }> = [];

  // Find IDs only in local
  for (const [cartId, localIndex] of localTable.ids) {
    const otherIndex = otherTable.ids.get(cartId);
    if (otherIndex === undefined) {
      onlyInLocal.push(cartId.toString(16).padStart(8, '0'));
    } else {
      inBoth.push({ cartId, localIndex, otherIndex });
    }
  }

  // Find IDs only in other
  for (const [cartId] of otherTable.ids) {
    if (!localTable.ids.has(cartId)) {
      onlyInOther.push(cartId.toString(16).padStart(8, '0'));
    }
  }
  breakdown.idCompareMs = performance.now() - idCompareStart;

  // Step 3: Compare image data for entries in both
  const imageCompareStart = performance.now();
  const modified: string[] = [];

  if (inBoth.length > 0) {
    const [localHandle, otherHandle] = await Promise.all([
      open(localPath, 'r'),
      open(otherPath, 'r'),
    ]);

    try {
      const hashFn = options.fullImageHash ? hashImageSlotFull : hashImageSlot;

      // Process in batches for better performance
      const batchSize = 50;
      for (let i = 0; i < inBoth.length; i += batchSize) {
        const batch = inBoth.slice(i, i + batchSize);

        const results = await Promise.all(
          batch.map(async ({ cartId, localIndex, otherIndex }) => {
            const [localHash, otherHash] = await Promise.all([
              hashFn(localHandle, localIndex),
              hashFn(otherHandle, otherIndex),
            ]);
            return { cartId, same: localHash === otherHash };
          })
        );

        for (const { cartId, same } of results) {
          if (!same) {
            modified.push(cartId.toString(16).padStart(8, '0'));
          }
        }
      }
    } finally {
      await Promise.all([localHandle.close(), otherHandle.close()]);
    }
  }
  breakdown.imageCompareMs = performance.now() - imageCompareStart;

  const identical = onlyInLocal.length === 0 && onlyInOther.length === 0 && modified.length === 0;

  return {
    identical,
    onlyInLocal,
    onlyInOther,
    modified,
    totalCompared: inBoth.length,
    durationMs: performance.now() - startTime,
    breakdown,
  };
}
