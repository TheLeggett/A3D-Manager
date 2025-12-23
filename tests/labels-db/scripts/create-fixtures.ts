/**
 * Verify Test Fixtures
 *
 * This script verifies that test fixtures are present and valid.
 * The sample-label.png is used as the test image for all cart IDs.
 */

import { readFileSync, existsSync } from 'fs';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

import { IMAGE_WIDTH, IMAGE_HEIGHT } from '../../../server/lib/labels-db-core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, '../fixtures');

async function main() {
  console.log('=== Verifying Test Fixtures ===\n');

  // Check sample-label.png exists
  const sampleLabelPath = path.join(FIXTURES_DIR, 'sample-label.png');
  if (!existsSync(sampleLabelPath)) {
    console.error('ERROR: sample-label.png not found in fixtures directory');
    process.exit(1);
  }
  console.log('✓ sample-label.png exists');

  // Verify image dimensions
  const imageBuffer = readFileSync(sampleLabelPath);
  const metadata = await sharp(imageBuffer).metadata();
  console.log(`  Dimensions: ${metadata.width}×${metadata.height}`);
  console.log(`  Format: ${metadata.format}`);
  console.log(`  Target: ${IMAGE_WIDTH}×${IMAGE_HEIGHT} (will be resized if needed)`);

  // Check cart-ids.json exists
  const cartIdsPath = path.join(FIXTURES_DIR, 'cart-ids.json');
  if (!existsSync(cartIdsPath)) {
    console.error('ERROR: cart-ids.json not found in fixtures directory');
    process.exit(1);
  }
  console.log('✓ cart-ids.json exists');

  // Parse and display cart IDs
  const mapping = JSON.parse(readFileSync(cartIdsPath, 'utf-8'));
  console.log('\nTest Cart IDs:');
  for (const [name, cart] of Object.entries(mapping) as [string, { cartId: number; cartIdHex: string; imageFile: string }][]) {
    console.log(`  ${name}: 0x${cart.cartIdHex} -> ${cart.imageFile}`);
  }

  console.log('\n=== Fixtures OK ===');
}

main().catch(console.error);
