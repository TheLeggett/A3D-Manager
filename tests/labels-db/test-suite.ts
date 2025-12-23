/**
 * Labels.db Test Suite
 *
 * Comprehensive tests for the labels.db library to verify:
 * 1. Round-trip image storage and retrieval
 * 2. CRUD operations (Create, Read, Update, Delete)
 * 3. Edge cases and error handling
 * 4. Binary format compliance
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

import {
  // Constants
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

  // Functions
  createHeader,
  verifyHeader,
  parseLabelsDb,
  bgraToRgba,
  rgbaToBgra,
  extractRawImage,
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const OUTPUT_DIR = path.join(__dirname, 'output');
const TEST_DB_PATH = path.join(OUTPUT_DIR, 'test-labels.db');

// Test results tracking
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void> | void): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, error, duration: Date.now() - start });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertBuffersEqual(actual: Buffer, expected: Buffer, message: string): void {
  if (!actual.equals(expected)) {
    // Find first difference
    let diffIndex = -1;
    const minLen = Math.min(actual.length, expected.length);
    for (let i = 0; i < minLen; i++) {
      if (actual[i] !== expected[i]) {
        diffIndex = i;
        break;
      }
    }
    if (diffIndex === -1 && actual.length !== expected.length) {
      throw new Error(`${message}: length mismatch (${actual.length} vs ${expected.length})`);
    }
    throw new Error(
      `${message}: buffers differ at index ${diffIndex} (0x${actual[diffIndex]?.toString(16)} vs 0x${expected[diffIndex]?.toString(16)})`
    );
  }
}

// =============================================================================
// Test Categories
// =============================================================================

async function testConstants() {
  console.log('\n--- Constants ---');

  await runTest('IMAGE_DATA_SIZE = 74 × 86 × 4', () => {
    assertEqual(IMAGE_DATA_SIZE, 74 * 86 * 4, 'IMAGE_DATA_SIZE');
    assertEqual(IMAGE_DATA_SIZE, 25456, 'IMAGE_DATA_SIZE value');
  });

  await runTest('IMAGE_SLOT_SIZE = 25600', () => {
    assertEqual(IMAGE_SLOT_SIZE, 25600, 'IMAGE_SLOT_SIZE');
  });

  await runTest('SLOT_PADDING = 144', () => {
    assertEqual(SLOT_PADDING, 144, 'SLOT_PADDING');
    assertEqual(IMAGE_SLOT_SIZE - IMAGE_DATA_SIZE, 144, 'Calculated padding');
  });

  await runTest('DATA_START = 0x4100', () => {
    assertEqual(DATA_START, 0x4100, 'DATA_START');
    assertEqual(DATA_START, 16640, 'DATA_START decimal');
  });
}

async function testHeaderOperations() {
  console.log('\n--- Header Operations ---');

  await runTest('createHeader produces valid header', () => {
    const header = createHeader();
    assertEqual(header.length, HEADER_SIZE, 'Header size');
    assertEqual(header[0], MAGIC_BYTE, 'Magic byte');
    assertEqual(header.subarray(1, 12).toString('ascii'), IDENTIFIER, 'Identifier');
    assertEqual(header.subarray(0x20, 0x20 + FILE_TYPE.length).toString('ascii'), FILE_TYPE, 'File type');
    assertEqual(header.readUInt32LE(0x40), VERSION, 'Version');
  });

  await runTest('verifyHeader accepts valid header', () => {
    const header = createHeader();
    const result = verifyHeader(header);
    assert(result.valid, `Header should be valid: ${result.error}`);
  });

  await runTest('verifyHeader rejects invalid magic byte', () => {
    const header = createHeader();
    header[0] = 0x00;
    const result = verifyHeader(header);
    assert(!result.valid, 'Should reject invalid magic byte');
    assert(result.error?.includes('magic'), 'Error should mention magic byte');
  });

  await runTest('verifyHeader rejects invalid identifier', () => {
    const header = createHeader();
    header.write('Invalid-Co!', 1, 'ascii');
    const result = verifyHeader(header);
    assert(!result.valid, 'Should reject invalid identifier');
  });

  await runTest('verifyHeader rejects truncated header', () => {
    const header = Buffer.alloc(100);
    const result = verifyHeader(header);
    assert(!result.valid, 'Should reject truncated header');
  });
}

async function testColorConversion() {
  console.log('\n--- Color Conversion ---');

  await runTest('bgraToRgba converts correctly', () => {
    const bgra = Buffer.from([100, 150, 200, 255]); // B=100, G=150, R=200, A=255
    const rgba = bgraToRgba(bgra);
    assertEqual(rgba[0], 200, 'R channel');
    assertEqual(rgba[1], 150, 'G channel');
    assertEqual(rgba[2], 100, 'B channel');
    assertEqual(rgba[3], 255, 'A channel');
  });

  await runTest('rgbaToBgra converts correctly', () => {
    const rgba = Buffer.from([200, 150, 100, 255]); // R=200, G=150, B=100, A=255
    const bgra = rgbaToBgra(rgba);
    assertEqual(bgra[0], 100, 'B channel');
    assertEqual(bgra[1], 150, 'G channel');
    assertEqual(bgra[2], 200, 'R channel');
    assertEqual(bgra[3], 255, 'A channel');
  });

  await runTest('round-trip color conversion preserves data', () => {
    const original = Buffer.from([10, 20, 30, 40, 50, 60, 70, 80]);
    const converted = rgbaToBgra(bgraToRgba(original));
    assertBuffersEqual(converted, original, 'Round-trip conversion');
  });
}

async function testEmptyDatabase() {
  console.log('\n--- Empty Database ---');

  await runTest('createEmptyLabelsDb produces valid empty database', () => {
    const empty = createEmptyLabelsDb();
    assertEqual(empty.length, DATA_START, 'Empty database size');

    const result = verifyHeader(empty);
    assert(result.valid, `Header should be valid: ${result.error}`);

    // Check padding area is filled with 0xFF
    for (let i = HEADER_SIZE; i < DATA_START; i++) {
      assertEqual(empty[i], PADDING_FILL, `Padding at offset ${i}`);
    }
  });

  await runTest('parseLabelsDb handles empty database', () => {
    const empty = createEmptyLabelsDb();
    const db = parseLabelsDb(empty);
    assertEqual(db.entryCount, 0, 'Entry count');
    assertEqual(db.entries.length, 0, 'Entries array length');
  });
}

async function testRoundTripImageStorage() {
  console.log('\n--- Round-Trip Image Storage ---');

  const mapping = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'cart-ids.json'), 'utf-8'));

  for (const [name, cart] of Object.entries(mapping) as [string, { cartId: number; cartIdHex: string; imageFile: string }][]) {
    await runTest(`Round-trip: ${name}`, async () => {
      // Load original image
      const originalPng = readFileSync(path.join(FIXTURES_DIR, cart.imageFile));

      // Create a database with just this entry
      const db = await createLabelsDb([{ cartId: cart.cartId, imageBuffer: originalPng }]);

      // Extract the image back
      const extracted = await getImageByCartId(db, cart.cartId);
      assert(extracted !== null, 'Image should be found');

      // Convert original to raw RGBA for comparison
      const originalRgba = await sharp(originalPng)
        .resize(IMAGE_WIDTH, IMAGE_HEIGHT, { fit: 'cover', position: 'center' })
        .ensureAlpha()
        .raw()
        .toBuffer();

      // Compare the raw RGBA data
      assertBuffersEqual(extracted!.rgba, originalRgba, 'RGBA data');
    });
  }
}

async function testCRUDOperations() {
  console.log('\n--- CRUD Operations ---');

  const mapping = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'cart-ids.json'), 'utf-8'));
  const cart1 = mapping.test_cart_1; // 0x03cc04ee (lowest)
  const cart2 = mapping.test_cart_2; // 0x53433634 (middle)
  const cart3 = mapping.test_cart_3; // 0xac631da0 (higher)

  const samplePng = readFileSync(path.join(FIXTURES_DIR, 'sample-label.png'));

  await runTest('Create: single entry database', async () => {
    const db = await createLabelsDb([{ cartId: cart1.cartId, imageBuffer: samplePng }]);
    const parsed = parseLabelsDb(db);
    assertEqual(parsed.entryCount, 1, 'Entry count');
    assertEqual(parsed.entries[0].cartId, cart1.cartId, 'Cart ID');
  });

  await runTest('Create: multiple entries are sorted', async () => {
    // Insert in non-sorted order
    const db = await createLabelsDb([
      { cartId: cart3.cartId, imageBuffer: samplePng }, // 0xac631da0
      { cartId: cart1.cartId, imageBuffer: samplePng }, // 0x03cc04ee
      { cartId: cart2.cartId, imageBuffer: samplePng }, // 0x53433634
    ]);

    const parsed = parseLabelsDb(db);
    assertEqual(parsed.entryCount, 3, 'Entry count');

    // Verify sorted order
    assert(parsed.entries[0].cartId < parsed.entries[1].cartId, 'Entry 0 < Entry 1');
    assert(parsed.entries[1].cartId < parsed.entries[2].cartId, 'Entry 1 < Entry 2');

    // Verify specific order
    assertEqual(parsed.entries[0].cartId, cart1.cartId, 'First entry is cart1');
    assertEqual(parsed.entries[1].cartId, cart2.cartId, 'Second entry is cart2');
    assertEqual(parsed.entries[2].cartId, cart3.cartId, 'Third entry is cart3');
  });

  await runTest('Read: getImageByCartId returns correct image', async () => {
    const db = await createLabelsDb([
      { cartId: cart1.cartId, imageBuffer: samplePng },
      { cartId: cart3.cartId, imageBuffer: samplePng },
    ]);

    const image = await getImageByCartId(db, cart3.cartId);
    assert(image !== null, 'Image should be found');
    assertEqual(image!.cartIdHex, cart3.cartIdHex, 'Cart ID hex');
    assertEqual(image!.width, IMAGE_WIDTH, 'Width');
    assertEqual(image!.height, IMAGE_HEIGHT, 'Height');
  });

  await runTest('Read: getImageByCartId returns null for missing ID', async () => {
    const db = await createLabelsDb([{ cartId: cart1.cartId, imageBuffer: samplePng }]);
    const image = await getImageByCartId(db, 0x12345678);
    assert(image === null, 'Should return null for missing ID');
  });

  await runTest('Read: getImageByCartIdHex works with hex string', async () => {
    const db = await createLabelsDb([{ cartId: cart1.cartId, imageBuffer: samplePng }]);
    const image = await getImageByCartIdHex(db, cart1.cartIdHex);
    assert(image !== null, 'Image should be found');
  });

  await runTest('Update: modifies existing entry', async () => {
    const db = await createLabelsDb([{ cartId: cart1.cartId, imageBuffer: samplePng }]);

    // Update with same image (just verifies the operation works)
    const updated = await updateEntry(db, cart1.cartId, samplePng);

    // Verify the update succeeded
    const newImage = await getImageByCartId(updated, cart1.cartId);
    const expectedRgba = await sharp(samplePng)
      .resize(IMAGE_WIDTH, IMAGE_HEIGHT, { fit: 'cover', position: 'center' })
      .ensureAlpha()
      .raw()
      .toBuffer();

    assertBuffersEqual(newImage!.rgba, expectedRgba, 'Updated image data');
  });

  await runTest('Update: throws for missing entry', async () => {
    const db = await createLabelsDb([{ cartId: cart1.cartId, imageBuffer: samplePng }]);

    let threw = false;
    try {
      await updateEntry(db, 0x12345678, samplePng);
    } catch {
      threw = true;
    }
    assert(threw, 'Should throw for missing entry');
  });

  await runTest('Add: inserts entry in sorted position', async () => {
    // Start with two entries
    let db = await createLabelsDb([
      { cartId: cart1.cartId, imageBuffer: samplePng }, // 0x03cc04ee
      { cartId: cart3.cartId, imageBuffer: samplePng }, // 0xac631da0
    ]);

    // Add entry that should go in the middle
    db = await addEntry(db, cart2.cartId, samplePng); // 0x53433634

    const parsed = parseLabelsDb(db);
    assertEqual(parsed.entryCount, 3, 'Entry count');
    assertEqual(parsed.entries[0].cartId, cart1.cartId, 'First entry');
    assertEqual(parsed.entries[1].cartId, cart2.cartId, 'Second entry (newly added)');
    assertEqual(parsed.entries[2].cartId, cart3.cartId, 'Third entry');
  });

  await runTest('Add: throws for duplicate entry', async () => {
    const db = await createLabelsDb([{ cartId: cart1.cartId, imageBuffer: samplePng }]);

    let threw = false;
    try {
      await addEntry(db, cart1.cartId, samplePng);
    } catch {
      threw = true;
    }
    assert(threw, 'Should throw for duplicate entry');
  });

  await runTest('Delete: removes entry', async () => {
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

    // Verify deleted entry is gone
    assert(!parsed.idToIndex.has(cart2.cartId), 'Deleted entry should not exist');
  });

  await runTest('Delete: throws for missing entry', () => {
    const db = createEmptyLabelsDb();

    let threw = false;
    try {
      deleteEntry(db, 0x12345678);
    } catch {
      threw = true;
    }
    assert(threw, 'Should throw for missing entry');
  });
}

async function testImageSlotStructure() {
  console.log('\n--- Image Slot Structure ---');

  await runTest('Image slot has correct padding', async () => {
    const mapping = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'cart-ids.json'), 'utf-8'));
    const cart1 = mapping.test_cart_1;
    const samplePng = readFileSync(path.join(FIXTURES_DIR, 'sample-label.png'));

    const db = await createLabelsDb([{ cartId: cart1.cartId, imageBuffer: samplePng }]);

    // Check the padding at the end of the image slot
    const slotStart = DATA_START;
    const paddingStart = slotStart + IMAGE_DATA_SIZE;

    for (let i = 0; i < SLOT_PADDING; i++) {
      assertEqual(db[paddingStart + i], PADDING_FILL, `Padding byte ${i}`);
    }
  });

  await runTest('prepareImageForStorage produces correct size', async () => {
    const samplePng = readFileSync(path.join(FIXTURES_DIR, 'sample-label.png'));

    const bgra = await prepareImageForStorage(samplePng);
    assertEqual(bgra.length, IMAGE_DATA_SIZE, 'BGRA data size');
  });

  await runTest('createImageSlot produces correct size with padding', async () => {
    const bgra = Buffer.alloc(IMAGE_DATA_SIZE, 0x42);
    const slot = createImageSlot(bgra);

    assertEqual(slot.length, IMAGE_SLOT_SIZE, 'Slot size');

    // Verify image data is preserved
    for (let i = 0; i < IMAGE_DATA_SIZE; i++) {
      assertEqual(slot[i], 0x42, `Image byte ${i}`);
    }

    // Verify padding
    for (let i = IMAGE_DATA_SIZE; i < IMAGE_SLOT_SIZE; i++) {
      assertEqual(slot[i], PADDING_FILL, `Padding byte ${i - IMAGE_DATA_SIZE}`);
    }
  });
}

async function testBinaryFormatCompliance() {
  console.log('\n--- Binary Format Compliance ---');

  await runTest('ID table uses little-endian format', async () => {
    const mapping = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'cart-ids.json'), 'utf-8'));
    const cart1 = mapping.test_cart_1; // 0x03cc04ee
    const samplePng = readFileSync(path.join(FIXTURES_DIR, 'sample-label.png'));

    const db = await createLabelsDb([{ cartId: cart1.cartId, imageBuffer: samplePng }]);

    // Read raw bytes from ID table
    const rawBytes = db.subarray(ID_TABLE_START, ID_TABLE_START + 4);

    // 0x03cc04ee in little-endian is: ee 04 cc 03
    assertEqual(rawBytes[0], 0xee, 'Byte 0');
    assertEqual(rawBytes[1], 0x04, 'Byte 1');
    assertEqual(rawBytes[2], 0xcc, 'Byte 2');
    assertEqual(rawBytes[3], 0x03, 'Byte 3');
  });

  await runTest('File size matches formula', async () => {
    const mapping = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'cart-ids.json'), 'utf-8'));

    for (let n = 1; n <= 4; n++) {
      const entries = Object.entries(mapping)
        .slice(0, n)
        .map(([, cart]: [string, any]) => ({
          cartId: cart.cartId,
          imageBuffer: readFileSync(path.join(FIXTURES_DIR, cart.imageFile)),
        }));

      const db = await createLabelsDb(entries);
      const expectedSize = DATA_START + n * IMAGE_SLOT_SIZE;

      assertEqual(db.length, expectedSize, `Size for ${n} entries`);
    }
  });
}

// =============================================================================
// Main
// =============================================================================

/**
 * Clean the output directory, preserving only .gitignore
 */
function cleanOutputDir(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = readdirSync(OUTPUT_DIR);
  for (const file of files) {
    if (file === '.gitignore') continue;
    rmSync(path.join(OUTPUT_DIR, file), { recursive: true, force: true });
  }
}

async function main() {
  console.log('=== Labels.db Test Suite ===');
  console.log(`Image Dimensions: ${IMAGE_WIDTH}×${IMAGE_HEIGHT}`);
  console.log(`Image Data Size: ${IMAGE_DATA_SIZE} bytes`);
  console.log(`Slot Size: ${IMAGE_SLOT_SIZE} bytes (${SLOT_PADDING} bytes padding)`);

  // Clean output directory before running tests
  cleanOutputDir();
  console.log('Output directory cleaned.\n');

  await testConstants();
  await testHeaderOperations();
  await testColorConversion();
  await testEmptyDatabase();
  await testRoundTripImageStorage();
  await testCRUDOperations();
  await testImageSlotStructure();
  await testBinaryFormatCompliance();

  // Summary
  console.log('\n=== Summary ===');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${results.length}`);
  console.log(`Time:   ${totalTime}ms`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }

  console.log('\n✓ All tests passed!');

  // Write test artifacts for inspection
  await writeTestArtifacts();
}

/**
 * Write test artifacts to the output directory for manual inspection
 */
async function writeTestArtifacts(): Promise<void> {
  console.log('\n--- Writing Test Artifacts ---');

  const mapping = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'cart-ids.json'), 'utf-8'));
  const samplePng = readFileSync(path.join(FIXTURES_DIR, 'sample-label.png'));

  // Create a test database with all fixtures
  const entries = Object.entries(mapping).map(([, cart]: [string, any]) => ({
    cartId: cart.cartId,
    imageBuffer: samplePng,
  }));

  const db = await createLabelsDb(entries);

  // Write the database
  const dbPath = path.join(OUTPUT_DIR, 'test-labels.db');
  writeFileSync(dbPath, db);
  console.log(`  ${dbPath}`);

  // Extract and write each image as PNG for visual inspection
  const parsed = parseLabelsDb(db);
  for (const entry of parsed.entries) {
    const image = await getImageByIndex(db, entry.index);
    const pngPath = path.join(OUTPUT_DIR, `extracted-${entry.cartIdHex}.png`);
    writeFileSync(pngPath, image.png);
    console.log(`  ${pngPath}`);
  }

  // Write an empty database for reference
  const emptyDb = createEmptyLabelsDb();
  const emptyPath = path.join(OUTPUT_DIR, 'empty-labels.db');
  writeFileSync(emptyPath, emptyDb);
  console.log(`  ${emptyPath}`);

  console.log(`\nArtifacts written to: ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
