/**
 * Analyze N64 ROM header to see all available metadata
 *
 * N64 ROM Header Structure (64 bytes):
 * 0x00-0x03: PI BSD DOM1 config
 * 0x04-0x07: Clock rate override
 * 0x08-0x0B: Program Counter (entry point)
 * 0x0C-0x0F: Release address
 * 0x10-0x13: CRC1 (checksum 1)
 * 0x14-0x17: CRC2 (checksum 2)
 * 0x18-0x1F: Reserved (zeros)
 * 0x20-0x33: Internal Name (20 bytes, ASCII)
 * 0x34-0x37: Reserved
 * 0x38-0x3A: Reserved
 * 0x3B:      Media format ('N' = cartridge)
 * 0x3C-0x3D: Cartridge ID (2 ASCII chars)
 * 0x3E:      Country/Region code
 * 0x3F:      Version/Revision
 */

import { readFile, readdir } from 'fs/promises';
import path from 'path';

// Region code mapping
const REGION_CODES: Record<string, string> = {
  '7': 'Beta',
  'A': 'Asian (NTSC)',
  'B': 'Brazilian',
  'C': 'Chinese',
  'D': 'German',
  'E': 'North America',
  'F': 'French',
  'G': 'Gateway 64 (NTSC)',
  'H': 'Dutch',
  'I': 'Italian',
  'J': 'Japanese',
  'K': 'Korean',
  'L': 'Gateway 64 (PAL)',
  'N': 'Canadian',
  'P': 'European (PAL)',
  'S': 'Spanish',
  'U': 'Australian',
  'W': 'Scandinavian',
  'X': 'European (PAL)',
  'Y': 'European (PAL)',
  'Z': 'European (PAL)',
};

function detectRomFormat(data: Buffer): 'z64' | 'v64' | 'n64' | 'unknown' {
  if (data.length < 4) return 'unknown';
  const first4 = data.readUInt32BE(0);
  if (first4 === 0x80371240) return 'z64';
  if (first4 === 0x37804012) return 'v64';
  if (first4 === 0x40123780) return 'n64';
  return 'unknown';
}

function convertToZ64(data: Buffer, format: 'z64' | 'v64' | 'n64' | 'unknown'): Buffer {
  if (format === 'z64') return data;
  const result = Buffer.alloc(data.length);
  if (format === 'v64') {
    for (let i = 0; i < data.length; i += 2) {
      result[i] = data[i + 1];
      result[i + 1] = data[i];
    }
  } else if (format === 'n64') {
    for (let i = 0; i < data.length; i += 4) {
      result[i] = data[i + 3];
      result[i + 1] = data[i + 2];
      result[i + 2] = data[i + 1];
      result[i + 3] = data[i];
    }
  } else {
    return data;
  }
  return result;
}

// CRC32 for A3D ID
const CRC32_TABLE = (() => {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? 0xEDB88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

interface RomInfo {
  file: string;
  a3dId: string;
  format: string;

  // Header fields
  internalName: string;
  internalNameRaw: string;
  mediaFormat: string;
  cartridgeId: string;
  regionCode: string;
  region: string;
  version: number;

  // Checksums from header
  crc1: string;
  crc2: string;

  // Full game code (4 chars: media + cartId + region)
  gameCode: string;
}

async function analyzeRom(romPath: string): Promise<RomInfo> {
  const fd = await readFile(romPath);
  const data = fd.subarray(0, Math.min(8192 + 0x40, fd.length));

  const format = detectRomFormat(data);
  const z64Data = convertToZ64(data, format);

  // A3D ID (CRC32 of first 8KB)
  const a3dId = crc32(z64Data.subarray(0, 8192)).toString(16).padStart(8, '0');

  // Extract header fields
  const internalNameRaw = z64Data.subarray(0x20, 0x34).toString('ascii');
  const internalName = internalNameRaw.replace(/\0/g, '').trim();

  const mediaFormat = String.fromCharCode(z64Data[0x3B]);
  const cartridgeId = z64Data.subarray(0x3C, 0x3E).toString('ascii');
  const regionCode = String.fromCharCode(z64Data[0x3E]);
  const version = z64Data[0x3F];

  const gameCode = mediaFormat + cartridgeId + regionCode;

  // CRC values from header
  const crc1 = z64Data.readUInt32BE(0x10).toString(16).padStart(8, '0').toUpperCase();
  const crc2 = z64Data.readUInt32BE(0x14).toString(16).padStart(8, '0').toUpperCase();

  return {
    file: path.basename(romPath),
    a3dId,
    format,
    internalName,
    internalNameRaw,
    mediaFormat,
    cartridgeId,
    regionCode,
    region: REGION_CODES[regionCode] || 'Unknown',
    version,
    crc1,
    crc2,
    gameCode,
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
N64 ROM Header Analyzer

Usage:
  npx tsx scripts/analyze-rom-header.ts <rom-file>
  npx tsx scripts/analyze-rom-header.ts <rom-folder> --batch

Shows all metadata available in the ROM header including:
- Internal name, region, version
- Cartridge ID, game code
- CRC1/CRC2 checksums
- A3D cart ID
`);
    process.exit(0);
  }

  const inputPath = args[0];
  const isBatch = args.includes('--batch');
  const isJson = args.includes('--json');

  const { stat } = await import('fs/promises');
  const pathStat = await stat(inputPath);

  let roms: RomInfo[] = [];

  if (pathStat.isFile()) {
    roms.push(await analyzeRom(inputPath));
  } else if (pathStat.isDirectory() && isBatch) {
    const files = await readdir(inputPath);
    const romFiles = files.filter(f => /\.(z64|v64|n64)$/i.test(f));

    for (const file of romFiles) {
      try {
        roms.push(await analyzeRom(path.join(inputPath, file)));
      } catch (err) {
        console.error(`Error processing ${file}:`, err);
      }
    }
  }

  if (isJson) {
    console.log(JSON.stringify(roms, null, 2));
  } else {
    for (const rom of roms) {
      console.log(`
${'='.repeat(60)}
File:          ${rom.file}
A3D Cart ID:   ${rom.a3dId}
${'─'.repeat(60)}
Internal Name: "${rom.internalName}"
Game Code:     ${rom.gameCode}
  - Media:     ${rom.mediaFormat} (${rom.mediaFormat === 'N' ? 'Cartridge' : 'Unknown'})
  - Cart ID:   ${rom.cartridgeId}
  - Region:    ${rom.regionCode} (${rom.region})
Version:       ${rom.version} (v1.${rom.version})
${'─'.repeat(60)}
Header CRC1:   ${rom.crc1}
Header CRC2:   ${rom.crc2}
`);
    }

    if (roms.length > 1) {
      console.log(`\nProcessed ${roms.length} ROMs`);
    }
  }
}

main().catch(console.error);
