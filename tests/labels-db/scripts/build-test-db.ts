/**
 * Build Test Database
 *
 * This script creates a fresh labels.db from scratch using the test fixtures.
 * It serves as both a test of the createLabelsDb function and produces a
 * known-good test database for further testing.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  createLabelsDb,
  parseLabelsDb,
  verifyHeader,
  DATA_START,
  IMAGE_SLOT_SIZE,
} from '../../../server/lib/labels-db-core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, '../fixtures');
const OUTPUT_DIR = path.join(__dirname, '../output');

interface CartMapping {
  cartId: number;
  cartIdHex: string;
  imageFile: string;
}

async function main() {
  console.log('=== Building Test Database ===\n');

  // Load cart ID mapping
  const mappingPath = path.join(FIXTURES_DIR, 'cart-ids.json');
  const mapping: Record<string, CartMapping> = JSON.parse(readFileSync(mappingPath, 'utf-8'));

  console.log('Cart ID Mapping:');
  for (const [name, cart] of Object.entries(mapping)) {
    console.log(`  ${name}: 0x${cart.cartIdHex}`);
  }
  console.log();

  // Load images and prepare entries
  const entries: Array<{ cartId: number; imageBuffer: Buffer }> = [];

  for (const [name, cart] of Object.entries(mapping)) {
    const imagePath = path.join(FIXTURES_DIR, cart.imageFile);
    console.log(`Loading ${name} from ${cart.imageFile}...`);

    const imageBuffer = readFileSync(imagePath);
    entries.push({
      cartId: cart.cartId,
      imageBuffer,
    });
  }

  console.log(`\nCreating labels.db with ${entries.length} entries...`);

  // Create the database
  const labelsDb = await createLabelsDb(entries);

  // Verify the created database
  console.log('\nVerifying created database...');

  const headerCheck = verifyHeader(labelsDb);
  if (!headerCheck.valid) {
    console.error(`Header verification failed: ${headerCheck.error}`);
    process.exit(1);
  }
  console.log('  Header: OK');

  const db = parseLabelsDb(labelsDb);
  console.log(`  Entry count: ${db.entryCount}`);

  // Verify entries are sorted
  let sorted = true;
  for (let i = 1; i < db.entries.length; i++) {
    if (db.entries[i].cartId < db.entries[i - 1].cartId) {
      sorted = false;
      break;
    }
  }
  console.log(`  Sorted: ${sorted ? 'OK' : 'FAILED'}`);

  // Verify file size
  const expectedSize = DATA_START + db.entryCount * IMAGE_SLOT_SIZE;
  console.log(`  File size: ${labelsDb.length} bytes (expected ${expectedSize})`);
  if (labelsDb.length !== expectedSize) {
    console.error('  Size mismatch!');
    process.exit(1);
  }
  console.log('  Size: OK');

  // List entries
  console.log('\nEntries in database:');
  for (const entry of db.entries) {
    console.log(`  [${entry.index}] 0x${entry.cartIdHex} at offset 0x${entry.imageOffset.toString(16)}`);
  }

  // Save the database
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, 'test-labels.db');
  writeFileSync(outputPath, labelsDb);
  console.log(`\nSaved: ${outputPath}`);

  // Also create an empty database for edge case testing
  const { createEmptyLabelsDb } = await import('../../../server/lib/labels-db-core.js');
  const emptyDb = createEmptyLabelsDb();
  const emptyPath = path.join(OUTPUT_DIR, 'empty-labels.db');
  writeFileSync(emptyPath, emptyDb);
  console.log(`Saved: ${emptyPath} (empty database for edge case testing)`);

  console.log('\n=== Done ===');
}

main().catch(console.error);
