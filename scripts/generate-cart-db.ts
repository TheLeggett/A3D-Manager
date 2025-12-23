/**
 * Generates the N64 cart database from labels.db and Games folder
 *
 * Usage: npx tsx scripts/generate-cart-db.ts [path-to-sd-card]
 *
 * This extracts all cart IDs from labels.db and matches them with
 * game names from the Games folder (e.g., "Super Mario 64 b393776d").
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import path from 'path';

// labels.db constants
const ID_TABLE_START = 0x100;
const ID_COUNT = 901;

interface CartEntry {
  id: string;        // 8-char hex ID
  name: string;      // Game name (empty if unknown)
  official: boolean; // true if from labels.db
}

interface CartDatabase {
  version: number;
  generatedAt: string;
  source: string;
  totalEntries: number;
  namedEntries: number;
  carts: CartEntry[];
}

async function extractCartIds(labelsPath: string): Promise<string[]> {
  const data = await readFile(labelsPath);

  // Verify header
  const magic = data[0];
  const identifier = data.subarray(1, 12).toString('utf8');
  if (magic !== 0x07 || identifier !== 'Analogue-Co') {
    throw new Error('Invalid labels.db header');
  }

  const cartIds: string[] = [];

  for (let i = 0; i < ID_COUNT; i++) {
    const offset = ID_TABLE_START + i * 4;
    const cartId = data.readUInt32LE(offset);
    const hexId = cartId.toString(16).padStart(8, '0');
    cartIds.push(hexId);
  }

  return cartIds;
}

async function scanGamesFolder(gamesPath: string): Promise<Map<string, string>> {
  const idToName = new Map<string, string>();

  try {
    const folders = await readdir(gamesPath);

    for (const folder of folders) {
      // Skip hidden folders
      if (folder.startsWith('.')) continue;

      // Skip "Unknown Cartridge" entries - those need renaming
      if (folder.includes('Unknown Cartridge')) {
        console.log(`  Skipping: ${folder} (needs rename)`);
        continue;
      }

      // Extract hex ID from end of folder name
      // Format: "Game Title hexid" e.g., "Super Mario 64 b393776d"
      const match = folder.match(/^(.+)\s+([0-9a-fA-F]{8})$/);
      if (match) {
        const title = match[1].trim();
        const hexId = match[2].toLowerCase();
        idToName.set(hexId, title);
        console.log(`  Found: ${hexId} -> ${title}`);
      } else {
        console.log(`  Skipping: ${folder} (no hex ID found)`);
      }
    }
  } catch (err) {
    console.log('  No Games folder found or not readable');
  }

  return idToName;
}

async function main() {
  const sdCardPath = process.argv[2] || path.join(process.cwd(), 'sd-card-example');

  const labelsPath = path.join(sdCardPath, 'Library', 'N64', 'Images', 'labels.db');
  const gamesPath = path.join(sdCardPath, 'Library', 'N64', 'Games');

  console.log(`Reading labels.db from: ${labelsPath}`);
  const cartIds = await extractCartIds(labelsPath);
  console.log(`Extracted ${cartIds.length} cart IDs\n`);

  console.log('Scanning Games folder for names:');
  const idToName = await scanGamesFolder(gamesPath);
  console.log(`\nFound ${idToName.size} named games\n`);

  // Build the database
  const carts: CartEntry[] = cartIds.map(id => ({
    id,
    name: idToName.get(id) || '',
    official: true,
  }));

  const namedEntries = carts.filter(c => c.name).length;

  const database: CartDatabase = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: path.basename(sdCardPath),
    totalEntries: carts.length,
    namedEntries,
    carts,
  };

  // Write to data directory
  const outputPath = path.join(process.cwd(), 'data', 'n64-carts.json');
  await writeFile(outputPath, JSON.stringify(database, null, 2));
  console.log(`Wrote database to: ${outputPath}`);
  console.log(`  Total entries: ${carts.length}`);
  console.log(`  Named entries: ${namedEntries}`);
  console.log(`  Unnamed entries: ${carts.length - namedEntries}`);
}

main().catch(console.error);
