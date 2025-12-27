/**
 * Build enhanced cart database with rich metadata
 *
 * Extracts from DAT file:
 * - Clean game name
 * - Region (USA, Europe, Japan, etc.)
 * - Languages (En, Fr, De, etc.)
 * - Release type (official, beta, proto, unlicensed, etc.)
 * - Video mode (NTSC/PAL)
 *
 * Usage:
 *   npx tsx scripts/build-cart-db-enhanced.ts
 */

import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

interface EnhancedCartEntry {
  id: string;
  gameCode: string;
  name: string;
  region: string;
  languages: string[];
  videoMode: 'NTSC' | 'PAL' | 'Unknown';
  releaseType: 'official' | 'beta' | 'proto' | 'demo' | 'unlicensed' | 'aftermarket' | 'unknown';
  revision: number | null;
}

interface SimpleCartEntry {
  id: string;
  gameCode: string;
  name: string;
}

interface DatGame {
  '@_name': string;
  rom:
    | { '@_serial'?: string }
    | Array<{ '@_serial'?: string }>;
}

interface DatFile {
  datafile: {
    game: DatGame[];
  };
}

// Region codes and their properties
const REGION_INFO: Record<string, { name: string; videoMode: 'NTSC' | 'PAL' }> = {
  A: { name: 'Asia', videoMode: 'NTSC' },
  B: { name: 'Brazil', videoMode: 'NTSC' },
  C: { name: 'China', videoMode: 'NTSC' },
  D: { name: 'Germany', videoMode: 'PAL' },
  E: { name: 'USA', videoMode: 'NTSC' },
  F: { name: 'France', videoMode: 'PAL' },
  G: { name: 'Gateway 64', videoMode: 'NTSC' },
  H: { name: 'Netherlands', videoMode: 'PAL' },
  I: { name: 'Italy', videoMode: 'PAL' },
  J: { name: 'Japan', videoMode: 'NTSC' },
  K: { name: 'Korea', videoMode: 'NTSC' },
  L: { name: 'Gateway 64', videoMode: 'PAL' },
  N: { name: 'Canada', videoMode: 'NTSC' },
  P: { name: 'Europe', videoMode: 'PAL' },
  S: { name: 'Spain', videoMode: 'PAL' },
  U: { name: 'Australia', videoMode: 'PAL' },
  W: { name: 'Scandinavia', videoMode: 'PAL' },
  X: { name: 'Europe', videoMode: 'PAL' },
  Y: { name: 'Europe', videoMode: 'PAL' },
  Z: { name: 'Europe', videoMode: 'PAL' },
};

// Language code expansions
const LANGUAGE_NAMES: Record<string, string> = {
  En: 'English',
  Fr: 'French',
  De: 'German',
  Es: 'Spanish',
  It: 'Italian',
  Nl: 'Dutch',
  Pt: 'Portuguese',
  Sv: 'Swedish',
  No: 'Norwegian',
  Da: 'Danish',
  Fi: 'Finnish',
  Ja: 'Japanese',
  Ko: 'Korean',
  Zh: 'Chinese',
};

/**
 * Parse region from DAT game name
 */
function parseRegion(name: string): string {
  // Match patterns like (USA), (Europe), (Japan), (USA, Europe), etc.
  const regionMatch = name.match(/\((USA|Europe|Japan|Germany|France|Italy|Spain|Australia|Brazil|Korea|China|Asia|World|Netherlands|Scandinavia)(?:,\s*[^)]+)?\)/i);
  if (regionMatch) {
    return regionMatch[1];
  }
  return 'Unknown';
}

/**
 * Parse languages from DAT game name
 */
function parseLanguages(name: string): string[] {
  // Match patterns like (En,Fr,De) or (En,Fr,De,Es,It)
  const langMatch = name.match(/\((?:En|Fr|De|Es|It|Nl|Pt|Sv|No|Da|Fi|Ja|Ko|Zh)(?:,(?:En|Fr|De|Es|It|Nl|Pt|Sv|No|Da|Fi|Ja|Ko|Zh))*\)/);
  if (langMatch) {
    const langStr = langMatch[0].slice(1, -1); // Remove parentheses
    return langStr.split(',').map(code => LANGUAGE_NAMES[code] || code);
  }

  // Default based on region
  const region = parseRegion(name);
  if (region === 'Japan') return ['Japanese'];
  if (region === 'USA') return ['English'];
  if (region === 'Europe') return ['English'];
  return [];
}

/**
 * Parse release type from DAT game name
 */
function parseReleaseType(name: string): EnhancedCartEntry['releaseType'] {
  const lowerName = name.toLowerCase();

  if (lowerName.includes('(beta)') || /\(v\d+\)\s*\(beta\)/i.test(name)) return 'beta';
  if (lowerName.includes('(proto)') || lowerName.includes('prototype')) return 'proto';
  if (lowerName.includes('(demo)') || lowerName.includes('(kiosk)')) return 'demo';
  if (lowerName.includes('(unl)') || lowerName.includes('unlicensed')) return 'unlicensed';
  if (lowerName.includes('(aftermarket)')) return 'aftermarket';

  return 'official';
}

/**
 * Parse revision number from DAT game name
 */
function parseRevision(name: string): number | null {
  // Match (Rev 1), (Rev 2), etc.
  const revMatch = name.match(/\(Rev\s*(\d+)\)/i);
  if (revMatch) {
    return parseInt(revMatch[1], 10);
  }
  return null;
}

/**
 * Get video mode from region code in game code
 */
function getVideoMode(gameCode: string): 'NTSC' | 'PAL' | 'Unknown' {
  if (gameCode.length < 4) return 'Unknown';
  const regionCode = gameCode[3];
  return REGION_INFO[regionCode]?.videoMode || 'Unknown';
}

/**
 * Extract clean title (without region/language/version info)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _extractCleanTitle(name: string): string {
  // Remove parenthetical info but keep the base title
  let clean = name
    .replace(/\s*\([^)]*\)/g, '') // Remove all parenthetical content
    .trim();

  // Handle "Title, The" -> "The Title" format
  if (clean.includes(', The')) {
    clean = 'The ' + clean.replace(', The', '');
  }
  if (clean.includes(', A ')) {
    clean = 'A ' + clean.replace(', A ', ' ');
  }

  return clean;
}

/**
 * Parse DAT file and build enhanced metadata map
 */
async function parseDatFile(): Promise<Map<string, Omit<EnhancedCartEntry, 'id'>> | null> {
  const datPath = path.join(process.cwd(), 'roms.dat.xml');
  const gameCodeToMeta = new Map<string, Omit<EnhancedCartEntry, 'id'>>();

  try {
    const xmlData = await readFile(datPath, 'utf-8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });

    const dat = parser.parse(xmlData) as DatFile;
    const games = dat.datafile.game;

    for (const game of games) {
      const roms = Array.isArray(game.rom) ? game.rom : [game.rom];

      for (const rom of roms) {
        if (!rom || !rom['@_serial'] || rom['@_serial'] === '!unknown') continue;

        const serial = rom['@_serial'];
        const name = game['@_name'];

        // Skip if we already have this game code (prefer first/USA versions)
        if (gameCodeToMeta.has(serial)) continue;

        const region = parseRegion(name);
        const languages = parseLanguages(name);
        const releaseType = parseReleaseType(name);
        const revision = parseRevision(name);
        const videoMode = getVideoMode(serial);

        gameCodeToMeta.set(serial, {
          gameCode: serial,
          name,
          region,
          languages,
          videoMode,
          releaseType,
          revision,
        });
      }
    }

    console.log(`Parsed ${gameCodeToMeta.size} game codes from DAT file`);
    return gameCodeToMeta;
  } catch {
    console.log(`
No roms.dat.xml found. Download from:
  https://github.com/mroach/rom64

Enhanced metadata will not be available.
`);
    return null;
  }
}

async function main() {
  const dataDir = path.join(process.cwd(), 'data');

  // Parse DAT file
  console.log('Parsing DAT file for enhanced metadata...\n');
  const datMeta = await parseDatFile();

  if (!datMeta) {
    console.log('Cannot build enhanced database without DAT file.');
    process.exit(1);
  }

  // Read existing cart-names.json
  const cartNamesPath = path.join(dataDir, 'cart-names.json');
  const cartNames = JSON.parse(await readFile(cartNamesPath, 'utf-8')) as SimpleCartEntry[];
  console.log(`Read ${cartNames.length} entries from cart-names.json\n`);

  // Build enhanced entries
  const enhanced: EnhancedCartEntry[] = [];
  let matched = 0;
  let unmatched = 0;

  for (const entry of cartNames) {
    const meta = datMeta.get(entry.gameCode);

    if (meta) {
      enhanced.push({
        id: entry.id,
        ...meta,
      });
      matched++;
    } else {
      // Fallback with minimal metadata
      const regionCode = entry.gameCode.length >= 4 ? entry.gameCode[3] : '';
      const regionInfo = REGION_INFO[regionCode];

      enhanced.push({
        id: entry.id,
        gameCode: entry.gameCode,
        name: entry.name,
        region: regionInfo?.name || 'Unknown',
        languages: [],
        videoMode: regionInfo?.videoMode || 'Unknown',
        releaseType: 'unknown',
        revision: null,
      });
      unmatched++;
    }
  }

  // Sort by name
  enhanced.sort((a, b) => a.name.localeCompare(b.name));

  // Write enhanced database (replaces cart-names.json)
  const outputPath = path.join(dataDir, 'cart-names.json');
  await writeFile(outputPath, JSON.stringify(enhanced, null, 2));

  console.log(`Results:`);
  console.log(`  - With full metadata: ${matched}`);
  console.log(`  - Minimal metadata: ${unmatched}`);
  console.log(`\nWrote ${enhanced.length} entries to cart-names.json`);

  // Show stats
  const regions = new Map<string, number>();
  const videoModes = new Map<string, number>();
  const releaseTypes = new Map<string, number>();

  for (const e of enhanced) {
    regions.set(e.region, (regions.get(e.region) || 0) + 1);
    videoModes.set(e.videoMode, (videoModes.get(e.videoMode) || 0) + 1);
    releaseTypes.set(e.releaseType, (releaseTypes.get(e.releaseType) || 0) + 1);
  }

  console.log('\n--- Statistics ---');
  console.log('\nBy Region:');
  [...regions.entries()].sort((a, b) => b[1] - a[1]).forEach(([r, c]) => {
    console.log(`  ${r}: ${c}`);
  });

  console.log('\nBy Video Mode:');
  [...videoModes.entries()].sort((a, b) => b[1] - a[1]).forEach(([v, c]) => {
    console.log(`  ${v}: ${c}`);
  });

  console.log('\nBy Release Type:');
  [...releaseTypes.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, c]) => {
    console.log(`  ${t}: ${c}`);
  });

  // Sample entries
  console.log('\n--- Sample Entries ---');
  enhanced.slice(0, 5).forEach(e => {
    console.log(`\n${e.id}:`);
    console.log(`  Name: ${e.name}`);
    console.log(`  Region: ${e.region} (${e.videoMode})`);
    console.log(`  Languages: ${e.languages.join(', ') || 'Unknown'}`);
    console.log(`  Type: ${e.releaseType}${e.revision !== null ? `, Rev ${e.revision}` : ''}`);
  });
}

main().catch(console.error);
