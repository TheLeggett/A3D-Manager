import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import sharp from 'sharp';

const LABELS_PATH = './sd-card-example/Library/N64/Images/labels.db';
const OUTPUT_DIR = './.local/extracted-labels';

// Image parameters
const IMAGE_WIDTH = 80;
const IMAGE_HEIGHT = 80;
const BYTES_PER_PIXEL = 4; // RGBA
const IMAGE_SIZE = IMAGE_WIDTH * IMAGE_HEIGHT * BYTES_PER_PIXEL; // 25600
const DATA_START = 0x4100;
const ID_TABLE_START = 0x100;

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
  // Read labels.db
  const labelsData = readFileSync(LABELS_PATH);

  // Parse cartridge ID table
  const idTable: number[] = [];
  for (let i = 0; i < 901; i++) {
    const offset = ID_TABLE_START + i * 4;
    const cartId = labelsData.readUInt32LE(offset);
    idTable.push(cartId);
  }

  console.log(`Found ${idTable.length} cartridge IDs in table`);

  // Create output directory
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Extract images for known cart IDs
  console.log('\nExtracting label images...');

  for (const [cartIdStr, name] of Object.entries(knownIds)) {
    const cartId = parseInt(cartIdStr);
    const index = idTable.indexOf(cartId);

    if (index === -1) {
      console.log(`  ${name}: Cart ID 0x${cartId.toString(16)} not found`);
      continue;
    }

    const imageOffset = DATA_START + index * IMAGE_SIZE;
    const rawData = labelsData.subarray(imageOffset, imageOffset + IMAGE_SIZE);

    // Convert RGBA raw data to PNG using sharp
    const pngBuffer = await sharp(rawData, {
      raw: {
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        channels: 4,
      },
    })
      .png()
      .toBuffer();

    const outputPath = `${OUTPUT_DIR}/${name}.png`;
    writeFileSync(outputPath, pngBuffer);
    console.log(`  Saved: ${name}.png (index ${index}, offset 0x${imageOffset.toString(16)})`);
  }

  // Also extract first 10 images to verify format
  console.log('\nExtracting first 10 images...');
  for (let i = 0; i < 10; i++) {
    const cartId = idTable[i];
    const imageOffset = DATA_START + i * IMAGE_SIZE;
    const rawData = labelsData.subarray(imageOffset, imageOffset + IMAGE_SIZE);

    const pngBuffer = await sharp(rawData, {
      raw: {
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        channels: 4,
      },
    })
      .png()
      .toBuffer();

    const outputPath = `${OUTPUT_DIR}/label_${i.toString().padStart(3, '0')}_${cartId.toString(16)}.png`;
    writeFileSync(outputPath, pngBuffer);
    console.log(`  Saved: label_${i.toString().padStart(3, '0')}_${cartId.toString(16)}.png`);
  }

  console.log(`\nDone! Check ${OUTPUT_DIR}/ for extracted images.`);
}

main().catch(console.error);
