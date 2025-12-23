import { readFile, writeFile, copyFile, mkdir, access, constants, readdir } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

// labels.db constants
const ID_TABLE_START = 0x100;
const ID_COUNT = 901;
const DATA_START = 0x4100;
const IMAGE_WIDTH = 74;
const IMAGE_HEIGHT = 86;
const BYTES_PER_PIXEL = 4; // RGBA
const IMAGE_DATA_SIZE = IMAGE_WIDTH * IMAGE_HEIGHT * BYTES_PER_PIXEL; // 25456
const IMAGE_SLOT_SIZE = 25600; // Each image slot has 144 bytes padding

export interface LabelEntry {
  cartId: number;
  cartIdHex: string;
  index: number;
  imageOffset: number;
}

export interface LabelsDb {
  path: string;
  entries: LabelEntry[];
  idToIndex: Map<number, number>;
}

/**
 * Parse a labels.db file and return its structure
 */
export async function parseLabelsDb(labelsPath: string): Promise<LabelsDb> {
  const data = await readFile(labelsPath);

  // Verify header
  const magic = data[0];
  const identifier = data.subarray(1, 12).toString('utf8');
  if (magic !== 0x07 || identifier !== 'Analogue-Co') {
    throw new Error('Invalid labels.db header');
  }

  // Parse cartridge ID table
  const entries: LabelEntry[] = [];
  const idToIndex = new Map<number, number>();

  for (let i = 0; i < ID_COUNT; i++) {
    const offset = ID_TABLE_START + i * 4;
    const cartId = data.readUInt32LE(offset);

    const entry: LabelEntry = {
      cartId,
      cartIdHex: cartId.toString(16).padStart(8, '0'),
      index: i,
      imageOffset: DATA_START + i * IMAGE_SLOT_SIZE,
    };

    entries.push(entry);
    idToIndex.set(cartId, i);
  }

  return { path: labelsPath, entries, idToIndex };
}

/**
 * Get a label image as PNG buffer
 */
export async function getLabelImage(
  labelsPath: string,
  cartId: number
): Promise<Buffer | null> {
  const db = await parseLabelsDb(labelsPath);
  const index = db.idToIndex.get(cartId);

  if (index === undefined) {
    return null;
  }

  const data = await readFile(labelsPath);
  const imageOffset = DATA_START + index * IMAGE_SLOT_SIZE;
  const rawData = data.subarray(imageOffset, imageOffset + IMAGE_DATA_SIZE);

  // Convert BGRA to RGBA
  const rgbaData = Buffer.alloc(IMAGE_DATA_SIZE);
  for (let i = 0; i < IMAGE_WIDTH * IMAGE_HEIGHT; i++) {
    rgbaData[i * 4 + 0] = rawData[i * 4 + 2]; // R from B
    rgbaData[i * 4 + 1] = rawData[i * 4 + 1]; // G stays
    rgbaData[i * 4 + 2] = rawData[i * 4 + 0]; // B from R
    rgbaData[i * 4 + 3] = rawData[i * 4 + 3]; // A stays
  }

  // Convert to PNG
  const pngBuffer = await sharp(rgbaData, {
    raw: {
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      channels: 4,
    },
  })
    .png()
    .toBuffer();

  return pngBuffer;
}

/**
 * Get a label image as PNG buffer by hex ID string
 */
export async function getLabelImageByHex(
  labelsPath: string,
  cartIdHex: string
): Promise<Buffer | null> {
  const cartId = parseInt(cartIdHex, 16);
  return getLabelImage(labelsPath, cartId);
}

/**
 * Update a label image in labels.db
 * @param labelsPath Path to labels.db
 * @param cartId Cartridge ID (number)
 * @param imageBuffer PNG/JPG/etc image buffer to convert and store
 */
export async function updateLabelImage(
  labelsPath: string,
  cartId: number,
  imageBuffer: Buffer
): Promise<void> {
  const db = await parseLabelsDb(labelsPath);
  const index = db.idToIndex.get(cartId);

  if (index === undefined) {
    throw new Error(`Cartridge ID 0x${cartId.toString(16)} not found in labels.db`);
  }

  // Convert input image to 74x86 RGBA
  const rawRgba = await sharp(imageBuffer)
    .resize(IMAGE_WIDTH, IMAGE_HEIGHT, {
      fit: 'cover',
      position: 'center',
    })
    .ensureAlpha()
    .raw()
    .toBuffer();

  if (rawRgba.length !== IMAGE_DATA_SIZE) {
    throw new Error(
      `Converted image size mismatch: got ${rawRgba.length}, expected ${IMAGE_DATA_SIZE}`
    );
  }

  // Convert RGBA to BGRA for labels.db format
  const bgraData = Buffer.alloc(IMAGE_DATA_SIZE);
  for (let i = 0; i < IMAGE_WIDTH * IMAGE_HEIGHT; i++) {
    bgraData[i * 4 + 0] = rawRgba[i * 4 + 2]; // B from R
    bgraData[i * 4 + 1] = rawRgba[i * 4 + 1]; // G stays
    bgraData[i * 4 + 2] = rawRgba[i * 4 + 0]; // R from B
    bgraData[i * 4 + 3] = rawRgba[i * 4 + 3]; // A stays
  }

  // Read the entire labels.db
  const data = await readFile(labelsPath);

  // Calculate image offset and update (write to start of slot, padding remains)
  const imageOffset = DATA_START + index * IMAGE_SLOT_SIZE;
  bgraData.copy(data, imageOffset);

  // Write back
  await writeFile(labelsPath, data);
}

/**
 * Add a new cartridge to labels.db (for unknown carts)
 * Note: This requires inserting into the sorted ID table and shifting image data
 */
export async function addCartridge(
  labelsPath: string,
  cartId: number,
  imageBuffer: Buffer
): Promise<void> {
  const db = await parseLabelsDb(labelsPath);

  // Check if already exists
  if (db.idToIndex.has(cartId)) {
    throw new Error(`Cartridge ID 0x${cartId.toString(16)} already exists`);
  }

  // Find insertion point (table is sorted)
  let insertIndex = 0;
  for (let i = 0; i < db.entries.length; i++) {
    if (db.entries[i].cartId > cartId) {
      break;
    }
    insertIndex = i + 1;
  }

  // Convert input image to 74x86 RGBA
  const rawRgba = await sharp(imageBuffer)
    .resize(IMAGE_WIDTH, IMAGE_HEIGHT, {
      fit: 'cover',
      position: 'center',
    })
    .ensureAlpha()
    .raw()
    .toBuffer();

  // Convert RGBA to BGRA for labels.db format
  const bgraData = Buffer.alloc(IMAGE_DATA_SIZE);
  for (let i = 0; i < IMAGE_WIDTH * IMAGE_HEIGHT; i++) {
    bgraData[i * 4 + 0] = rawRgba[i * 4 + 2]; // B from R
    bgraData[i * 4 + 1] = rawRgba[i * 4 + 1]; // G stays
    bgraData[i * 4 + 2] = rawRgba[i * 4 + 0]; // R from B
    bgraData[i * 4 + 3] = rawRgba[i * 4 + 3]; // A stays
  }

  // Read the entire labels.db
  const data = await readFile(labelsPath);

  // Create new buffer with space for one more entry
  const newIdTableSize = (ID_COUNT + 1) * 4;
  const newDataStart = DATA_START; // Keep same for simplicity (there's padding)
  const newSize = data.length + IMAGE_SLOT_SIZE;
  const newData = Buffer.alloc(newSize);

  // Copy header
  data.copy(newData, 0, 0, ID_TABLE_START);

  // Copy ID table with new entry inserted
  for (let i = 0; i < insertIndex; i++) {
    newData.writeUInt32LE(db.entries[i].cartId, ID_TABLE_START + i * 4);
  }
  newData.writeUInt32LE(cartId, ID_TABLE_START + insertIndex * 4);
  for (let i = insertIndex; i < db.entries.length; i++) {
    newData.writeUInt32LE(db.entries[i].cartId, ID_TABLE_START + (i + 1) * 4);
  }

  // Fill padding with 0xFF
  const paddingStart = ID_TABLE_START + (ID_COUNT + 1) * 4;
  for (let i = paddingStart; i < DATA_START; i++) {
    newData[i] = 0xff;
  }

  // Copy image data with new image inserted
  const oldImageDataStart = DATA_START;
  for (let i = 0; i < insertIndex; i++) {
    const oldOffset = oldImageDataStart + i * IMAGE_SLOT_SIZE;
    const newOffset = DATA_START + i * IMAGE_SLOT_SIZE;
    data.copy(newData, newOffset, oldOffset, oldOffset + IMAGE_SLOT_SIZE);
  }

  // Insert new image (write BGRA data, leave padding zeroed)
  const newImageOffset = DATA_START + insertIndex * IMAGE_SLOT_SIZE;
  bgraData.copy(newData, newImageOffset);

  // Copy remaining images
  for (let i = insertIndex; i < db.entries.length; i++) {
    const oldOffset = oldImageDataStart + i * IMAGE_SLOT_SIZE;
    const newOffset = DATA_START + (i + 1) * IMAGE_SLOT_SIZE;
    data.copy(newData, newOffset, oldOffset, oldOffset + IMAGE_SLOT_SIZE);
  }

  // Write back
  await writeFile(labelsPath, newData);
}

/**
 * Get all entries with their basic info (without loading images)
 */
export async function getAllEntries(labelsPath: string): Promise<LabelEntry[]> {
  const db = await parseLabelsDb(labelsPath);
  return db.entries;
}

/**
 * Create a backup of labels.db
 */
export async function backupLabelsDb(labelsPath: string): Promise<string> {
  const backupPath = labelsPath + '.bak';
  await copyFile(labelsPath, backupPath);
  return backupPath;
}

// ============================================
// Local Labels Storage
// ============================================

const LOCAL_LABELS_DIR = path.join(process.cwd(), '.local', 'Library', 'N64', 'Labels');
const LOCAL_INDEX_PATH = path.join(LOCAL_LABELS_DIR, 'index.json');

export interface LocalLabelsIndex {
  sourceLabelsDb: string;
  importedAt: string;
  entries: Array<{ cartId: string; index: number }>;
}

/**
 * Ensure local labels directory exists
 */
export async function ensureLocalLabelsDir(): Promise<void> {
  await mkdir(LOCAL_LABELS_DIR, { recursive: true });
}

/**
 * Get path to local label PNG
 */
export function getLocalLabelPath(cartIdHex: string): string {
  return path.join(LOCAL_LABELS_DIR, `${cartIdHex}.png`);
}

/**
 * Check if a local label exists
 */
export async function hasLocalLabel(cartIdHex: string): Promise<boolean> {
  try {
    await access(getLocalLabelPath(cartIdHex), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read local label as PNG buffer
 */
export async function getLocalLabel(cartIdHex: string): Promise<Buffer | null> {
  try {
    const labelPath = getLocalLabelPath(cartIdHex);
    return await readFile(labelPath);
  } catch {
    return null;
  }
}

/**
 * Save label to local storage
 */
export async function saveLocalLabel(cartIdHex: string, pngBuffer: Buffer): Promise<void> {
  await ensureLocalLabelsDir();
  const labelPath = getLocalLabelPath(cartIdHex);
  await writeFile(labelPath, pngBuffer);
}

/**
 * Get local labels index
 */
export async function getLocalIndex(): Promise<LocalLabelsIndex | null> {
  try {
    const data = await readFile(LOCAL_INDEX_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Save local labels index
 */
export async function saveLocalIndex(index: LocalLabelsIndex): Promise<void> {
  await ensureLocalLabelsDir();
  await writeFile(LOCAL_INDEX_PATH, JSON.stringify(index, null, 2));
}

/**
 * Import a single label from SD card labels.db to local storage
 */
export async function importSingleLabel(
  labelsPath: string,
  cartIdHex: string
): Promise<{ success: boolean; message: string }> {
  const cartId = parseInt(cartIdHex, 16);
  const pngBuffer = await getLabelImage(labelsPath, cartId);

  if (!pngBuffer) {
    return { success: false, message: `Cart ID ${cartIdHex} not found in labels.db` };
  }

  await saveLocalLabel(cartIdHex, pngBuffer);
  return { success: true, message: `Imported label for ${cartIdHex}` };
}

/**
 * Import all labels from SD card labels.db to local PNG files
 * Returns progress callback for streaming updates
 */
export async function importAllLabels(
  labelsPath: string,
  onProgress?: (current: number, total: number, cartId: string) => void
): Promise<{ imported: number; total: number }> {
  await ensureLocalLabelsDir();

  const db = await parseLabelsDb(labelsPath);
  const data = await readFile(labelsPath);

  let imported = 0;
  const total = db.entries.length;

  for (const entry of db.entries) {
    const imageOffset = DATA_START + entry.index * IMAGE_SLOT_SIZE;
    const rawData = data.subarray(imageOffset, imageOffset + IMAGE_DATA_SIZE);

    // Convert BGRA to RGBA
    const rgbaData = Buffer.alloc(IMAGE_DATA_SIZE);
    for (let i = 0; i < IMAGE_WIDTH * IMAGE_HEIGHT; i++) {
      rgbaData[i * 4 + 0] = rawData[i * 4 + 2]; // R from B
      rgbaData[i * 4 + 1] = rawData[i * 4 + 1]; // G stays
      rgbaData[i * 4 + 2] = rawData[i * 4 + 0]; // B from R
      rgbaData[i * 4 + 3] = rawData[i * 4 + 3]; // A stays
    }

    // Convert RGBA to PNG
    const pngBuffer = await sharp(rgbaData, {
      raw: {
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        channels: 4,
      },
    })
      .png()
      .toBuffer();

    // Save to local file
    await saveLocalLabel(entry.cartIdHex, pngBuffer);

    imported++;
    if (onProgress) {
      onProgress(imported, total, entry.cartIdHex);
    }
  }

  // Save index
  const index: LocalLabelsIndex = {
    sourceLabelsDb: labelsPath,
    importedAt: new Date().toISOString(),
    entries: db.entries.map(e => ({ cartId: e.cartIdHex, index: e.index })),
  };
  await saveLocalIndex(index);

  return { imported, total };
}

/**
 * Update a label in local storage
 */
export async function updateLocalLabel(
  cartIdHex: string,
  imageBuffer: Buffer
): Promise<void> {
  // Convert input image to 80x80 PNG for local storage
  const pngBuffer = await sharp(imageBuffer)
    .resize(IMAGE_WIDTH, IMAGE_HEIGHT, {
      fit: 'cover',
      position: 'center',
    })
    .png()
    .toBuffer();

  await saveLocalLabel(cartIdHex, pngBuffer);
}

/**
 * Export local labels back to SD card labels.db
 * Also adds new cart entries for homebrew/custom carts not in the original labels.db
 */
export async function exportLabelsToSD(
  labelsPath: string,
  onProgress?: (current: number, total: number, cartId: string) => void
): Promise<{ exported: number; added: number; total: number }> {
  const index = await getLocalIndex();
  if (!index) {
    throw new Error('No local labels index found. Import labels first.');
  }

  // Create backup before modifying
  await backupLabelsDb(labelsPath);

  // First pass: find local labels that need to be added (not in labels.db)
  let db = await parseLabelsDb(labelsPath);
  const cartsToAdd: Array<{ cartId: number; cartIdHex: string; pngBuffer: Buffer }> = [];

  // Also check for user-added carts in local storage that aren't in the index
  const localLabelFiles = await getLocalLabelsList();

  for (const cartIdHex of localLabelFiles) {
    const cartId = parseInt(cartIdHex, 16);
    if (!db.idToIndex.has(cartId)) {
      const localPng = await getLocalLabel(cartIdHex);
      if (localPng) {
        cartsToAdd.push({ cartId, cartIdHex, pngBuffer: localPng });
      }
    }
  }

  // Add new carts to labels.db (one at a time since each modifies the file)
  let added = 0;
  for (const cart of cartsToAdd) {
    try {
      await addCartridge(labelsPath, cart.cartId, cart.pngBuffer);
      added++;
      console.log(`Added new cart ${cart.cartIdHex} to labels.db`);
    } catch (err) {
      console.warn(`Could not add cart ${cart.cartIdHex}: ${err}`);
    }
  }

  // Re-parse after adding new carts
  if (added > 0) {
    db = await parseLabelsDb(labelsPath);
  }

  // Read the entire labels.db for updating existing entries
  const data = await readFile(labelsPath);

  let exported = 0;
  const total = index.entries.length;

  for (const entry of index.entries) {
    const localPng = await getLocalLabel(entry.cartId);
    if (!localPng) {
      continue; // Skip if local file doesn't exist
    }

    const cartId = parseInt(entry.cartId, 16);
    const idx = db.idToIndex.get(cartId);
    if (idx === undefined) {
      continue; // Cart ID not in labels.db (shouldn't happen after adding)
    }

    // Convert PNG to raw RGBA
    const rawRgba = await sharp(localPng)
      .resize(IMAGE_WIDTH, IMAGE_HEIGHT, {
        fit: 'cover',
        position: 'center',
      })
      .ensureAlpha()
      .raw()
      .toBuffer();

    // Convert RGBA to BGRA for labels.db format
    const bgraData = Buffer.alloc(IMAGE_DATA_SIZE);
    for (let j = 0; j < IMAGE_WIDTH * IMAGE_HEIGHT; j++) {
      bgraData[j * 4 + 0] = rawRgba[j * 4 + 2]; // B from R
      bgraData[j * 4 + 1] = rawRgba[j * 4 + 1]; // G stays
      bgraData[j * 4 + 2] = rawRgba[j * 4 + 0]; // R from B
      bgraData[j * 4 + 3] = rawRgba[j * 4 + 3]; // A stays
    }

    // Update in buffer (write BGRA to start of slot)
    const imageOffset = DATA_START + idx * IMAGE_SLOT_SIZE;
    bgraData.copy(data, imageOffset);

    exported++;
    if (onProgress) {
      onProgress(exported, total, entry.cartId);
    }
  }

  // Write back
  await writeFile(labelsPath, data);

  return { exported, added, total };
}

/**
 * Get list of all local label files
 */
export async function getLocalLabelsList(): Promise<string[]> {
  try {
    const files = await readdir(LOCAL_LABELS_DIR);
    return files
      .filter(f => f.endsWith('.png'))
      .map(f => f.replace('.png', ''));
  } catch {
    return [];
  }
}

/**
 * Check if local labels are imported
 */
export async function hasLocalLabels(): Promise<boolean> {
  const index = await getLocalIndex();
  return index !== null && index.entries.length > 0;
}
