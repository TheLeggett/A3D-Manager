/**
 * Extract Labels Script
 *
 * Extracts label images from a labels.db file to PNG files.
 * Uses the labels-db-core library for correct handling.
 */

import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import {
  parseLabelsDb,
  getImageByIndex,
  IMAGE_WIDTH,
  IMAGE_HEIGHT,
} from '../server/lib/labels-db-core.js';

const LABELS_PATH = './sd-card-example/Library/N64/Images/labels.db';
const OUTPUT_DIR = './.local/extracted-labels';

// Known cart IDs for verification
const knownIds: Record<number, string> = {
  0xac631da0: 'GoldenEye_007',
  0xe5240d18: 'Zelda_OoT',
  0x03cc04ee: 'Mario_Kart_64',
  0xb04b4109: 'Star_Fox_64',
  0xb393776d: 'Super_Mario_64',
  0x04079b93: 'Super_Smash_Bros',
};

async function main() {
  console.log(`Image dimensions: ${IMAGE_WIDTH}x${IMAGE_HEIGHT}`);

  // Read labels.db
  const labelsData = readFileSync(LABELS_PATH);
  const db = parseLabelsDb(labelsData);

  console.log(`Found ${db.entryCount} cartridge entries`);

  // Create output directory
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Extract images for known cart IDs
  console.log('\nExtracting label images for known games...');

  for (const [cartIdStr, name] of Object.entries(knownIds)) {
    const cartId = parseInt(cartIdStr);
    const index = db.idToIndex.get(cartId);

    if (index === undefined) {
      console.log(`  ${name}: Cart ID 0x${cartId.toString(16)} not found`);
      continue;
    }

    const image = await getImageByIndex(labelsData, index);
    const outputPath = `${OUTPUT_DIR}/${name}.png`;
    writeFileSync(outputPath, image.png);
    console.log(`  Saved: ${name}.png (index ${index})`);
  }

  // Also extract first 10 images to verify format
  console.log('\nExtracting first 10 images...');
  const extractCount = Math.min(10, db.entryCount);

  for (let i = 0; i < extractCount; i++) {
    const entry = db.entries[i];
    const image = await getImageByIndex(labelsData, i);
    const outputPath = `${OUTPUT_DIR}/label_${i.toString().padStart(3, '0')}_${entry.cartIdHex}.png`;
    writeFileSync(outputPath, image.png);
    console.log(`  Saved: label_${i.toString().padStart(3, '0')}_${entry.cartIdHex}.png`);
  }

  console.log(`\nDone! Check ${OUTPUT_DIR}/ for extracted images.`);
}

main().catch(console.error);
