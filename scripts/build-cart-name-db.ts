/**
 * Build a clean cart ID to name mapping database
 *
 * Uses multiple sources for the best possible names:
 * 1. No-Intro DAT file (roms.dat.xml) - Cleanest, most accurate names
 * 2. ROM header metadata - Region code, version, internal name as fallback
 *
 * Usage:
 *   npx tsx scripts/build-cart-name-db.ts
 */

import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

// Region code mapping
const REGION_CODES: Record<string, string> = {
  '7': 'Beta',
  A: 'Asia',
  B: 'Brazil',
  C: 'China',
  D: 'Germany',
  E: 'USA',
  F: 'France',
  G: 'Gateway 64',
  H: 'Netherlands',
  I: 'Italy',
  J: 'Japan',
  K: 'Korea',
  L: 'Gateway 64',
  N: 'Canada',
  P: 'Europe',
  S: 'Spain',
  U: 'Australia',
  W: 'Scandinavia',
  X: 'Europe',
  Y: 'Europe',
  Z: 'Europe',
};

interface RomEntry {
  id: string;
  title: string;
  gameCode: string;
  format: string;
  file: string;
  regionCode?: string;
  version?: number;
}

// Simple entry for distribution
interface SimpleCartEntry {
  id: string;
  gameCode: string;
  name: string;
}

interface DatGame {
  '@_name': string;
  description: string;
  rom: {
    '@_name': string;
    '@_serial'?: string;
    '@_crc'?: string;
  };
}

interface DatFile {
  datafile: {
    header: {
      name: string;
      description: string;
      version: string;
    };
    game: DatGame[];
  };
}

/**
 * Parse No-Intro DAT file to build game code -> name mapping
 */
async function parseDatFile(): Promise<Map<string, string>> {
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
      const rom = game.rom;
      if (!rom || !rom['@_serial']) continue;

      const serial = rom['@_serial'];
      if (serial === '!unknown') continue;

      // Store the clean game name
      // DAT names include region/version info, we want those for disambiguation
      const name = game['@_name'];

      // Map the full 4-char serial (e.g., "NKTE") to the name
      if (!gameCodeToName.has(serial)) {
        gameCodeToName.set(serial, name);
      }
    }

    console.log(`Parsed ${gameCodeToName.size} game codes from DAT file`);
    return gameCodeToName;
  } catch {
    console.log(`
No roms.dat.xml found in project root.

To get clean game names, download a No-Intro N64 DAT file:
  - From: https://github.com/mroach/rom64
  - Or: No-Intro website

Place it as 'roms.dat.xml' in the project root and run this script again.

Falling back to ROM internal names with basic cleaning...
`);
    return new Map();
  }
}

/**
 * Clean up ROM internal name (fallback when DAT doesn't have entry)
 */
function cleanInternalName(title: string): string {
  // Replace underscores with spaces
  let name = title.replace(/_/g, ' ');

  // Convert ALL CAPS to Title Case
  if (name === name.toUpperCase() && name.length > 3) {
    name = toTitleCase(name);
  }

  return name.trim();
}

/**
 * Convert string to Title Case
 */
function toTitleCase(str: string): string {
  const lowercase = [
    'a',
    'an',
    'the',
    'and',
    'but',
    'or',
    'for',
    'nor',
    'on',
    'at',
    'to',
    'by',
    'of',
    'in',
  ];
  const uppercase = [
    'USA',
    'NFL',
    'NBA',
    'NHL',
    'MLB',
    'WWF',
    'WCW',
    'ECW',
    'NASCAR',
    'FIFA',
    'PGA',
    'NCAA',
    'II',
    'III',
    'IV',
    'DX',
    '3D',
    '64',
    'XG2',
    'GT',
    'RPG',
  ];

  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      const upperWord = word.toUpperCase();
      if (uppercase.includes(upperWord)) {
        return upperWord;
      }
      if (index > 0 && lowercase.includes(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Get display name for a ROM entry
 */
function getDisplayName(
  entry: RomEntry,
  datNames: Map<string, string>
): string {
  // First, try to get name from DAT file using game code
  const datName = datNames.get(entry.gameCode);
  if (datName) {
    return datName;
  }

  // Fallback: clean up the internal ROM name and add region/version
  let name = cleanInternalName(entry.title);

  // Add region if available and not USA (most common)
  if (entry.regionCode && entry.regionCode !== 'E') {
    const regionName = REGION_CODES[entry.regionCode];
    if (regionName) {
      name = `${name} (${regionName})`;
    }
  }

  // Add version if not v1.0
  if (entry.version !== undefined && entry.version > 0) {
    name = `${name} (Rev ${entry.version})`;
  }

  return name;
}

/**
 * Choose the best entry when there are duplicates for the same cart ID
 */
function chooseBestEntry(entries: RomEntry[]): RomEntry {
  return entries.sort((a, b) => {
    // Prefer USA region
    const aIsUSA = a.gameCode.endsWith('E') || a.file.includes('(U)');
    const bIsUSA = b.gameCode.endsWith('E') || b.file.includes('(U)');
    if (aIsUSA && !bIsUSA) return -1;
    if (!aIsUSA && bIsUSA) return 1;

    // Prefer verified dumps
    const aVerified = a.file.includes('[!]');
    const bVerified = b.file.includes('[!]');
    if (aVerified && !bVerified) return -1;
    if (!aVerified && bVerified) return 1;

    // Prefer z64 format
    if (a.format === 'z64' && b.format !== 'z64') return -1;
    if (a.format !== 'z64' && b.format === 'z64') return 1;

    return 0;
  })[0];
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data');

  // Parse DAT file for clean names
  const datNames = await parseDatFile();

  // Read raw ROM mappings
  const rawPath = path.join(dataDir, 'rom-id-mappings.json');
  let rawData: RomEntry[];

  try {
    rawData = JSON.parse(await readFile(rawPath, 'utf-8')) as RomEntry[];
  } catch {
    console.error(
      'Error: rom-id-mappings.json not found. Run compute-a3d-id.ts --batch first.'
    );
    process.exit(1);
  }

  console.log(`Read ${rawData.length} raw ROM entries`);

  // Group by cart ID
  const byId = new Map<string, RomEntry[]>();
  for (const entry of rawData) {
    const existing = byId.get(entry.id) || [];
    existing.push(entry);
    byId.set(entry.id, existing);
  }

  console.log(`Found ${byId.size} unique cart IDs`);

  // Build clean entries
  const entries: SimpleCartEntry[] = [];
  let datMatches = 0;
  let fallbackNames = 0;

  for (const [id, romEntries] of byId) {
    const best = chooseBestEntry(romEntries);
    const name = getDisplayName(best, datNames);

    if (datNames.has(best.gameCode)) {
      datMatches++;
    } else {
      fallbackNames++;
    }

    entries.push({
      id,
      gameCode: best.gameCode,
      name,
    });
  }

  // Sort by name for easier browsing
  entries.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`\nName sources:`);
  console.log(`  - From DAT file: ${datMatches}`);
  console.log(`  - From ROM header (fallback): ${fallbackNames}`);

  // Write output
  const outputPath = path.join(dataDir, 'cart-names.json');
  await writeFile(outputPath, JSON.stringify(entries, null, 2));
  console.log(`\nWrote ${entries.length} entries to ${outputPath}`);

  // Show some examples
  console.log('\nSample entries:');
  entries.slice(0, 10).forEach((e) => {
    console.log(`  ${e.id} -> ${e.name}`);
  });

  // Show the problematic ones we were looking at
  console.log('\nPreviously problematic entries:');
  const check = ['2e74de9c', '7021064b', 'fcf7ff34', '9ebbf464'];
  for (const id of check) {
    const entry = entries.find((e) => e.id === id);
    if (entry) {
      console.log(`  ${id} -> ${entry.name}`);
    }
  }
}

main().catch(console.error);
