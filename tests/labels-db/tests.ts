/**
 * Labels.db Library Tests
 *
 * Tests for server/lib/labels-db-core.ts - the labels.db file format
 * used by the Analogue 3D for cartridge artwork.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import sharp from 'sharp';
import { test, assert, assertEqual, assertBuffersEqual, TestSuite } from '../utils.js';

import {
  MAGIC_BYTE,
  IDENTIFIER,
  FILE_TYPE,
  VERSION,
  HEADER_SIZE,
  ID_TABLE_START,
  DATA_START,
  IMAGE_WIDTH,
  IMAGE_HEIGHT,
  IMAGE_DATA_SIZE,
  IMAGE_SLOT_SIZE,
  SLOT_PADDING,
  PADDING_FILL,
  createHeader,
  verifyHeader,
  parseLabelsDb,
  bgraToRgba,
  rgbaToBgra,
  getImageByIndex,
  getImageByCartId,
  getImageByCartIdHex,
  createEmptyLabelsDb,
  prepareImageForStorage,
  createImageSlot,
  createLabelsDb,
  updateEntry,
  addEntry,
  deleteEntry,
} from '../../server/lib/labels-db-core.js';

// Type for cart-ids.json mapping entries
interface CartMapping {
  cartId: string;
  imageFile: string;
}

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const OUTPUT_DIR = path.join(__dirname, 'output');

export function cleanOutput(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const files = readdirSync(OUTPUT_DIR);
  for (const file of files) {
    if (file === '.gitignore') continue;
    rmSync(path.join(OUTPUT_DIR, file), { recursive: true, force: true });
  }
}

// =============================================================================
// Constants Tests
// =============================================================================

const constantsTests = [
  test('IMAGE_DATA_SIZE = 74 x 86 x 4', () => {
    assertEqual(IMAGE_DATA_SIZE, 74 * 86 * 4, 'IMAGE_DATA_SIZE');
    assertEqual(IMAGE_DATA_SIZE, 25456, 'IMAGE_DATA_SIZE value');
  }),

  test('IMAGE_SLOT_SIZE = 25600', () => {
    assertEqual(IMAGE_SLOT_SIZE, 25600, 'IMAGE_SLOT_SIZE');
  }),

  test('SLOT_PADDING = 144', () => {
    assertEqual(SLOT_PADDING, 144, 'SLOT_PADDING');
    assertEqual(IMAGE_SLOT_SIZE - IMAGE_DATA_SIZE, 144, 'Calculated padding');
  }),

  test('DATA_START = 0x4100', () => {
    assertEqual(DATA_START, 0x4100, 'DATA_START');
    assertEqual(DATA_START, 16640, 'DATA_START decimal');
  }),
];

// =============================================================================
// Header Tests
// =============================================================================

const headerTests = [
  test('createHeader produces valid header', () => {
    const header = createHeader();
    assertEqual(header.length, HEADER_SIZE, 'Header size');
    assertEqual(header[0], MAGIC_BYTE, 'Magic byte');
    assertEqual(header.subarray(1, 12).toString('ascii'), IDENTIFIER, 'Identifier');
    assertEqual(header.subarray(0x20, 0x20 + FILE_TYPE.length).toString('ascii'), FILE_TYPE, 'File type');
    assertEqual(header.readUInt32LE(0x40), VERSION, 'Version');
  }),

  test('verifyHeader accepts valid header', () => {
    const header = createHeader();
    const result = verifyHeader(header);
    assert(result.valid, `Header should be valid: ${result.error}`);
  }),

  test('verifyHeader rejects invalid magic byte', () => {
    const header = createHeader();
    header[0] = 0x00;
    const result = verifyHeader(header);
    assert(!result.valid, 'Should reject invalid magic byte');
    assert(result.error?.includes('magic'), 'Error should mention magic byte');
  }),

  test('verifyHeader rejects invalid identifier', () => {
    const header = createHeader();
    header.write('Invalid-Co!', 1, 'ascii');
    const result = verifyHeader(header);
    assert(!result.valid, 'Should reject invalid identifier');
  }),

  test('verifyHeader rejects truncated header', () => {
    const header = Buffer.alloc(100);
    const result = verifyHeader(header);
    assert(!result.valid, 'Should reject truncated header');
  }),
];

// =============================================================================
// Color Conversion Tests
// =============================================================================

const colorTests = [
  test('bgraToRgba converts correctly', () => {
    const bgra = Buffer.from([100, 150, 200, 255]); // B=100, G=150, R=200, A=255
    const rgba = bgraToRgba(bgra);
    assertEqual(rgba[0], 200, 'R channel');
    assertEqual(rgba[1], 150, 'G channel');
    assertEqual(rgba[2], 100, 'B channel');
    assertEqual(rgba[3], 255, 'A channel');
  }),

  test('rgbaToBgra converts correctly', () => {
    const rgba = Buffer.from([200, 150, 100, 255]); // R=200, G=150, B=100, A=255
    const bgra = rgbaToBgra(rgba);
    assertEqual(bgra[0], 100, 'B channel');
    assertEqual(bgra[1], 150, 'G channel');
    assertEqual(bgra[2], 200, 'R channel');
    assertEqual(bgra[3], 255, 'A channel');
  }),

  test('round-trip color conversion preserves data', () => {
    const original = Buffer.from([10, 20, 30, 40, 50, 60, 70, 80]);
    const converted = rgbaToBgra(bgraToRgba(original));
    assertBuffersEqual(converted, original, 'Round-trip conversion');
  }),
];

// =============================================================================
// Empty Database Tests
// =============================================================================

const emptyDbTests = [
  test('createEmptyLabelsDb produces valid empty database', () => {
    const empty = createEmptyLabelsDb();
    assertEqual(empty.length, DATA_START, 'Empty database size');

    const result = verifyHeader(empty);
    assert(result.valid, `Header should be valid: ${result.error}`);

    for (let i = HEADER_SIZE; i < DATA_START; i++) {
      assertEqual(empty[i], PADDING_FILL, `Padding at offset ${i}`);
    }
  }),

  test('parseLabelsDb handles empty database', () => {
    const empty = createEmptyLabelsDb();
    const db = parseLabelsDb(empty);
    assertEqual(db.entryCount, 0, 'Entry count');
    assertEqual(db.entries.length, 0, 'Entries array length');
  }),
];

// =============================================================================
// Round-Trip Tests
// =============================================================================

function createRoundTripTests(): ReturnType<typeof test>[] {
  const mapping = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'cart-ids.json'), 'utf-8'));

  return Object.entries(mapping).map(([name, cart]: [string, CartMapping]) =>
    test(`Round-trip: ${name}`, async () => {
      const originalPng = readFileSync(path.join(FIXTURES_DIR, cart.imageFile));
      const db = await createLabelsDb([{ cartId: cart.cartId, imageBuffer: originalPng }]);

      const extracted = await getImageByCartId(db, cart.cartId);
      assert(extracted !== null, 'Image should be found');

      const originalRgba = await sharp(originalPng)
        .resize(IMAGE_WIDTH, IMAGE_HEIGHT, { fit: 'cover', position: 'center' })
        .ensureAlpha()
        .raw()
        .toBuffer();

      assertBuffersEqual(extracted!.rgba, originalRgba, 'RGBA data');
    })
  );
}

// =============================================================================
// CRUD Tests
// =============================================================================

function createCrudTests(): ReturnType<typeof test>[] {
  const mapping = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'cart-ids.json'), 'utf-8'));
  const cart1 = mapping.test_cart_1;
  const cart2 = mapping.test_cart_2;
  const cart3 = mapping.test_cart_3;
  const samplePng = readFileSync(path.join(FIXTURES_DIR, 'sample-label.png'));

  return [
    test('Create: single entry database', async () => {
      const db = await createLabelsDb([{ cartId: cart1.cartId, imageBuffer: samplePng }]);
      const parsed = parseLabelsDb(db);
      assertEqual(parsed.entryCount, 1, 'Entry count');
      assertEqual(parsed.entries[0].cartId, cart1.cartId, 'Cart ID');
    }),

    test('Create: multiple entries are sorted', async () => {
      const db = await createLabelsDb([
        { cartId: cart3.cartId, imageBuffer: samplePng },
        { cartId: cart1.cartId, imageBuffer: samplePng },
        { cartId: cart2.cartId, imageBuffer: samplePng },
      ]);

      const parsed = parseLabelsDb(db);
      assertEqual(parsed.entryCount, 3, 'Entry count');
      assert(parsed.entries[0].cartId < parsed.entries[1].cartId, 'Entry 0 < Entry 1');
      assert(parsed.entries[1].cartId < parsed.entries[2].cartId, 'Entry 1 < Entry 2');
      assertEqual(parsed.entries[0].cartId, cart1.cartId, 'First entry is cart1');
      assertEqual(parsed.entries[1].cartId, cart2.cartId, 'Second entry is cart2');
      assertEqual(parsed.entries[2].cartId, cart3.cartId, 'Third entry is cart3');
    }),

    test('Read: getImageByCartId returns correct image', async () => {
      const db = await createLabelsDb([
        { cartId: cart1.cartId, imageBuffer: samplePng },
        { cartId: cart3.cartId, imageBuffer: samplePng },
      ]);

      const image = await getImageByCartId(db, cart3.cartId);
      assert(image !== null, 'Image should be found');
      assertEqual(image!.cartIdHex, cart3.cartIdHex, 'Cart ID hex');
      assertEqual(image!.width, IMAGE_WIDTH, 'Width');
      assertEqual(image!.height, IMAGE_HEIGHT, 'Height');
    }),

    test('Read: getImageByCartId returns null for missing ID', async () => {
      const db = await createLabelsDb([{ cartId: cart1.cartId, imageBuffer: samplePng }]);
      const image = await getImageByCartId(db, 0x12345678);
      assert(image === null, 'Should return null for missing ID');
    }),

    test('Read: getImageByCartIdHex works with hex string', async () => {
      const db = await createLabelsDb([{ cartId: cart1.cartId, imageBuffer: samplePng }]);
      const image = await getImageByCartIdHex(db, cart1.cartIdHex);
      assert(image !== null, 'Image should be found');
    }),

    test('Update: modifies existing entry', async () => {
      const db = await createLabelsDb([{ cartId: cart1.cartId, imageBuffer: samplePng }]);
      const updated = await updateEntry(db, cart1.cartId, samplePng);

      const newImage = await getImageByCartId(updated, cart1.cartId);
      const expectedRgba = await sharp(samplePng)
        .resize(IMAGE_WIDTH, IMAGE_HEIGHT, { fit: 'cover', position: 'center' })
        .ensureAlpha()
        .raw()
        .toBuffer();

      assertBuffersEqual(newImage!.rgba, expectedRgba, 'Updated image data');
    }),

    test('Update: throws for missing entry', async () => {
      const db = await createLabelsDb([{ cartId: cart1.cartId, imageBuffer: samplePng }]);

      let threw = false;
      try {
        await updateEntry(db, 0x12345678, samplePng);
      } catch {
        threw = true;
      }
      assert(threw, 'Should throw for missing entry');
    }),

    test('Add: inserts entry in sorted position', async () => {
      let db = await createLabelsDb([
        { cartId: cart1.cartId, imageBuffer: samplePng },
        { cartId: cart3.cartId, imageBuffer: samplePng },
      ]);

      db = await addEntry(db, cart2.cartId, samplePng);

      const parsed = parseLabelsDb(db);
      assertEqual(parsed.entryCount, 3, 'Entry count');
      assertEqual(parsed.entries[0].cartId, cart1.cartId, 'First entry');
      assertEqual(parsed.entries[1].cartId, cart2.cartId, 'Second entry (newly added)');
      assertEqual(parsed.entries[2].cartId, cart3.cartId, 'Third entry');
    }),

    test('Add: throws for duplicate entry', async () => {
      const db = await createLabelsDb([{ cartId: cart1.cartId, imageBuffer: samplePng }]);

      let threw = false;
      try {
        await addEntry(db, cart1.cartId, samplePng);
      } catch {
        threw = true;
      }
      assert(threw, 'Should throw for duplicate entry');
    }),

    test('Delete: removes entry', async () => {
      const db = await createLabelsDb([
        { cartId: cart1.cartId, imageBuffer: samplePng },
        { cartId: cart2.cartId, imageBuffer: samplePng },
        { cartId: cart3.cartId, imageBuffer: samplePng },
      ]);

      const deleted = deleteEntry(db, cart2.cartId);
      const parsed = parseLabelsDb(deleted);

      assertEqual(parsed.entryCount, 2, 'Entry count');
      assertEqual(parsed.entries[0].cartId, cart1.cartId, 'First entry');
      assertEqual(parsed.entries[1].cartId, cart3.cartId, 'Second entry');
      assert(!parsed.idToIndex.has(cart2.cartId), 'Deleted entry should not exist');
    }),

    test('Delete: throws for missing entry', () => {
      const db = createEmptyLabelsDb();

      let threw = false;
      try {
        deleteEntry(db, 0x12345678);
      } catch {
        threw = true;
      }
      assert(threw, 'Should throw for missing entry');
    }),
  ];
}

// =============================================================================
// Image Slot Structure Tests
// =============================================================================

function createSlotTests(): ReturnType<typeof test>[] {
  const mapping = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'cart-ids.json'), 'utf-8'));
  const cart1 = mapping.test_cart_1;
  const samplePng = readFileSync(path.join(FIXTURES_DIR, 'sample-label.png'));

  return [
    test('Image slot has correct padding', async () => {
      const db = await createLabelsDb([{ cartId: cart1.cartId, imageBuffer: samplePng }]);

      const slotStart = DATA_START;
      const paddingStart = slotStart + IMAGE_DATA_SIZE;

      for (let i = 0; i < SLOT_PADDING; i++) {
        assertEqual(db[paddingStart + i], PADDING_FILL, `Padding byte ${i}`);
      }
    }),

    test('prepareImageForStorage produces correct size', async () => {
      const bgra = await prepareImageForStorage(samplePng);
      assertEqual(bgra.length, IMAGE_DATA_SIZE, 'BGRA data size');
    }),

    test('createImageSlot produces correct size with padding', () => {
      const bgra = Buffer.alloc(IMAGE_DATA_SIZE, 0x42);
      const slot = createImageSlot(bgra);

      assertEqual(slot.length, IMAGE_SLOT_SIZE, 'Slot size');

      for (let i = 0; i < IMAGE_DATA_SIZE; i++) {
        assertEqual(slot[i], 0x42, `Image byte ${i}`);
      }

      for (let i = IMAGE_DATA_SIZE; i < IMAGE_SLOT_SIZE; i++) {
        assertEqual(slot[i], PADDING_FILL, `Padding byte ${i - IMAGE_DATA_SIZE}`);
      }
    }),
  ];
}

// =============================================================================
// Binary Format Compliance Tests
// =============================================================================

function createBinaryTests(): ReturnType<typeof test>[] {
  const mapping = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'cart-ids.json'), 'utf-8'));
  const cart1 = mapping.test_cart_1;
  const samplePng = readFileSync(path.join(FIXTURES_DIR, 'sample-label.png'));

  return [
    test('ID table uses little-endian format', async () => {
      const db = await createLabelsDb([{ cartId: cart1.cartId, imageBuffer: samplePng }]);

      const rawBytes = db.subarray(ID_TABLE_START, ID_TABLE_START + 4);

      // 0x03cc04ee in little-endian is: ee 04 cc 03
      assertEqual(rawBytes[0], 0xee, 'Byte 0');
      assertEqual(rawBytes[1], 0x04, 'Byte 1');
      assertEqual(rawBytes[2], 0xcc, 'Byte 2');
      assertEqual(rawBytes[3], 0x03, 'Byte 3');
    }),

    test('File size matches formula', async () => {
      for (let n = 1; n <= 4; n++) {
        const entries = Object.entries(mapping)
          .slice(0, n)
          .map(([, cart]: [string, CartMapping]) => ({
            cartId: cart.cartId,
            imageBuffer: readFileSync(path.join(FIXTURES_DIR, cart.imageFile)),
          }));

        const db = await createLabelsDb(entries);
        const expectedSize = DATA_START + n * IMAGE_SLOT_SIZE;

        assertEqual(db.length, expectedSize, `Size for ${n} entries`);
      }
    }),
  ];
}

// =============================================================================
// Artifact Writing (for inspection)
// =============================================================================

export async function writeTestArtifacts(): Promise<void> {
  console.log('\n--- Writing Test Artifacts ---');

  const mapping = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'cart-ids.json'), 'utf-8'));
  const samplePng = readFileSync(path.join(FIXTURES_DIR, 'sample-label.png'));

  const entries = Object.entries(mapping).map(([, cart]: [string, CartMapping]) => ({
    cartId: cart.cartId,
    imageBuffer: samplePng,
  }));

  const db = await createLabelsDb(entries);

  const dbPath = path.join(OUTPUT_DIR, 'test-labels.db');
  writeFileSync(dbPath, db);
  console.log(`  ${dbPath}`);

  const parsed = parseLabelsDb(db);
  for (const entry of parsed.entries) {
    const image = await getImageByIndex(db, entry.index);
    const pngPath = path.join(OUTPUT_DIR, `extracted-${entry.cartIdHex}.png`);
    writeFileSync(pngPath, image.png);
    console.log(`  ${pngPath}`);
  }

  const emptyDb = createEmptyLabelsDb();
  const emptyPath = path.join(OUTPUT_DIR, 'empty-labels.db');
  writeFileSync(emptyPath, emptyDb);
  console.log(`  ${emptyPath}`);

  console.log(`\nArtifacts written to: ${OUTPUT_DIR}`);
}

// =============================================================================
// Export Test Suite
// =============================================================================

export const labelsDbSuite: TestSuite = {
  name: 'Labels Database',
  tests: [
    ...constantsTests,
    ...headerTests,
    ...colorTests,
    ...emptyDbTests,
    ...createRoundTripTests(),
    ...createCrudTests(),
    ...createSlotTests(),
    ...createBinaryTests(),
  ],
};
