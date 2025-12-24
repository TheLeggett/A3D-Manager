/**
 * Update cart-names.json with cleaner names from No-Intro DAT file
 *
 * This script takes the existing cart-names.json and replaces names
 * with cleaner versions from roms.dat.xml based on game code matching.
 *
 * Usage:
 *   npx tsx scripts/update-cart-names-from-dat.ts
 */

import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

interface SimpleCartEntry {
  id: string;
  gameCode: string;
  name: string;
}

interface DatGame {
  '@_name': string;
  description: string;
  rom:
    | {
        '@_name': string;
        '@_serial'?: string;
      }
    | Array<{
        '@_name': string;
        '@_serial'?: string;
      }>;
}

interface DatFile {
  datafile: {
    game: DatGame[];
  };
}

/**
 * Parse No-Intro DAT file to build game code -> name mapping
 * Prefers USA versions when available
 */
async function parseDatFile(): Promise<Map<string, string> | null> {
  const datPath = path.join(process.cwd(), 'roms.dat.xml');
  const gameCodeToName = new Map<string, string>();

  try {
    const xmlData = await readFile(datPath, 'utf-8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });

    const dat = parser.parse(xmlData) as DatFile;
    const games = dat.datafile.game;

    for (const game of games) {
      // Handle both single rom and array of roms
      const roms = Array.isArray(game.rom) ? game.rom : [game.rom];

      for (const rom of roms) {
        if (!rom || !rom['@_serial']) continue;

        const serial = rom['@_serial'];
        if (serial === '!unknown') continue;

        const name = game['@_name'];

        // Store the name, preferring USA versions (serial ends with 'E')
        const existing = gameCodeToName.get(serial);
        if (!existing) {
          gameCodeToName.set(serial, name);
        } else if (serial.endsWith('E') && !name.includes('(Beta)')) {
          // Prefer USA non-beta versions
          gameCodeToName.set(serial, name);
        }
      }
    }

    console.log(`Parsed ${gameCodeToName.size} game codes from DAT file`);
    return gameCodeToName;
  } catch (err) {
    return null;
  }
}

/**
 * Clean up internal ROM name (fallback)
 */
function cleanInternalName(name: string): string {
  // Replace underscores with spaces
  let cleaned = name.replace(/_/g, ' ');

  // Convert ALL CAPS to Title Case
  if (cleaned === cleaned.toUpperCase() && cleaned.length > 3) {
    const lowercase = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'of', 'in'];
    const uppercase = ['64', 'II', 'III', 'IV', '3D', 'DX', 'NFL', 'NBA', 'NHL', 'WWF'];

    cleaned = cleaned
      .toLowerCase()
      .split(/\s+/)
      .map((word, index) => {
        const upper = word.toUpperCase();
        if (uppercase.includes(upper)) return upper;
        if (index > 0 && lowercase.includes(word)) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  return cleaned.trim();
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data');

  // Parse DAT file
  console.log('Looking for roms.dat.xml...');
  const datNames = await parseDatFile();

  if (!datNames) {
    console.log(`
No roms.dat.xml found in project root.

To get clean game names, download a No-Intro N64 DAT file:
  - From: https://github.com/mroach/rom64
  - Or: No-Intro website

Place it as 'roms.dat.xml' in the project root and run this script again.

Falling back to basic name cleaning (underscores → spaces, Title Case)...
`);
  }

  // Read existing cart-names.json
  const cartNamesPath = path.join(dataDir, 'cart-names.json');
  const cartNames = JSON.parse(await readFile(cartNamesPath, 'utf-8')) as SimpleCartEntry[];
  console.log(`Read ${cartNames.length} entries from cart-names.json`);

  // Update names
  let datMatches = 0;
  let cleaned = 0;
  let unchanged = 0;

  for (const entry of cartNames) {
    const datName = datNames?.get(entry.gameCode);

    if (datName) {
      if (entry.name !== datName) {
        console.log(`  ${entry.id}: "${entry.name}" -> "${datName}"`);
        entry.name = datName;
        datMatches++;
      } else {
        unchanged++;
      }
    } else {
      // No DAT match - clean up existing name
      const cleanedName = cleanInternalName(entry.name);
      if (cleanedName !== entry.name) {
        console.log(`  ${entry.id}: "${entry.name}" -> "${cleanedName}" (cleaned)`);
        entry.name = cleanedName;
        cleaned++;
      } else {
        unchanged++;
      }
    }
  }

  // Sort by name
  cartNames.sort((a, b) => a.name.localeCompare(b.name));

  // Write updated file
  await writeFile(cartNamesPath, JSON.stringify(cartNames, null, 2));

  console.log(`\nResults:`);
  if (datNames) {
    console.log(`  - Updated from DAT: ${datMatches}`);
  }
  console.log(`  - Cleaned (fallback): ${cleaned}`);
  console.log(`  - Unchanged: ${unchanged}`);
  console.log(`\nWrote updated cart-names.json`);
}

main().catch(console.error);
