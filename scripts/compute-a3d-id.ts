/**
 * Compute Analogue 3D Cart ID from N64 ROM files
 *
 * The Analogue 3D identifies cartridges by computing a CRC32 checksum
 * of the first 8 KiB (8192 bytes) of the ROM.
 *
 * Usage:
 *   npx tsx scripts/compute-a3d-id.ts <rom-file>
 *   npx tsx scripts/compute-a3d-id.ts <rom-folder> --batch
 *
 * Output:
 *   Prints the A3D cart ID (8-character hex) for each ROM
 */

import { readFile, readdir, stat } from 'fs/promises';
import path from 'path';

// Size of data to hash for A3D cart ID
const A3D_HASH_SIZE = 8192; // 8 KiB

// Standard IEEE CRC32 polynomial table
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

/**
 * Compute CRC32 checksum using standard IEEE polynomial
 */
function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Extract ROM title from N64 header (offset 0x20, 20 bytes)
 */
function extractRomTitle(data: Buffer): string {
  // N64 ROM header has title at offset 0x20 (32 bytes in)
  const titleBytes = data.subarray(0x20, 0x34);
  return titleBytes.toString('ascii').trim().replace(/\0/g, '');
}

/**
 * Extract game code from N64 header (offset 0x3B-0x3E)
 */
function extractGameCode(data: Buffer): string {
  const codeBytes = data.subarray(0x3B, 0x3F);
  return codeBytes.toString('ascii');
}

/**
 * Extract region code from N64 header (offset 0x3E)
 */
function extractRegionCode(data: Buffer): string {
  return String.fromCharCode(data[0x3E]);
}

/**
 * Extract version/revision from N64 header (offset 0x3F)
 */
function extractVersion(data: Buffer): number {
  return data[0x3F];
}

/**
 * Detect ROM byte order format based on first 4 bytes
 */
function detectRomFormat(data: Buffer): 'z64' | 'v64' | 'n64' | 'unknown' {
  if (data.length < 4) return 'unknown';

  const first4 = data.readUInt32BE(0);

  // Z64 (big-endian): 0x80371240
  if (first4 === 0x80371240) return 'z64';

  // V64 (byte-swapped): 0x37804012
  if (first4 === 0x37804012) return 'v64';

  // N64 (little-endian/word-swapped): 0x40123780
  if (first4 === 0x40123780) return 'n64';

  return 'unknown';
}

/**
 * Convert ROM to Z64 (big-endian) format if needed
 */
function convertToZ64(data: Buffer, format: 'z64' | 'v64' | 'n64' | 'unknown'): Buffer {
  if (format === 'z64') return data;

  const result = Buffer.alloc(data.length);

  if (format === 'v64') {
    // Byte-swap: AB CD -> BA DC
    for (let i = 0; i < data.length; i += 2) {
      result[i] = data[i + 1];
      result[i + 1] = data[i];
    }
  } else if (format === 'n64') {
    // Word-swap: AB CD EF GH -> GH EF CD AB
    for (let i = 0; i < data.length; i += 4) {
      result[i] = data[i + 3];
      result[i + 1] = data[i + 2];
      result[i + 2] = data[i + 1];
      result[i + 3] = data[i];
    }
  } else {
    // Unknown format, return as-is
    return data;
  }

  return result;
}

/**
 * Compute A3D cart ID from ROM file
 */
async function computeA3DId(romPath: string): Promise<{
  id: string;
  title: string;
  gameCode: string;
  regionCode: string;
  version: number;
  format: string;
  file: string;
}> {
  // Read first 8KB + enough for header parsing
  const fd = await readFile(romPath);
  const data = fd.subarray(0, Math.min(A3D_HASH_SIZE + 0x40, fd.length));

  if (data.length < A3D_HASH_SIZE) {
    throw new Error(`ROM file too small: ${data.length} bytes, need at least ${A3D_HASH_SIZE}`);
  }

  // Detect and convert format
  const format = detectRomFormat(data);
  const z64Data = convertToZ64(data, format);

  // Extract header info (from Z64 format)
  const title = extractRomTitle(z64Data);
  const gameCode = extractGameCode(z64Data);
  const regionCode = extractRegionCode(z64Data);
  const version = extractVersion(z64Data);

  // Compute CRC32 of first 8KB
  const hashData = z64Data.subarray(0, A3D_HASH_SIZE);
  const crc = crc32(hashData);
  const id = crc.toString(16).padStart(8, '0');

  return {
    id,
    title,
    gameCode,
    regionCode,
    version,
    format,
    file: path.basename(romPath),
  };
}

/**
 * Process a single ROM or directory of ROMs
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Analogue 3D Cart ID Calculator

The A3D identifies N64 cartridges using CRC32 of the first 8 KiB of ROM data.

Usage:
  npx tsx scripts/compute-a3d-id.ts <rom-file>
  npx tsx scripts/compute-a3d-id.ts <rom-folder> --batch
  npx tsx scripts/compute-a3d-id.ts <rom-folder> --json > output.json

Options:
  --batch   Process all .z64, .v64, .n64 files in folder
  --json    Output as JSON (for piping to file)

Examples:
  npx tsx scripts/compute-a3d-id.ts "Mario Kart 64.z64"
  npx tsx scripts/compute-a3d-id.ts ~/ROMs/N64 --batch
  npx tsx scripts/compute-a3d-id.ts ~/ROMs/N64 --batch --json > a3d-ids.json
`);
    process.exit(0);
  }

  const inputPath = args[0];
  const isBatch = args.includes('--batch');
  const isJson = args.includes('--json');

  const pathStat = await stat(inputPath);

  if (pathStat.isFile()) {
    // Single file mode
    const result = await computeA3DId(inputPath);

    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`
File:      ${result.file}
Format:    ${result.format}
Title:     ${result.title}
Game Code: ${result.gameCode}
A3D ID:    ${result.id}
`);
    }
  } else if (pathStat.isDirectory() && isBatch) {
    // Batch mode
    const files = await readdir(inputPath);
    const romFiles = files.filter(f =>
      /\.(z64|v64|n64)$/i.test(f)
    );

    if (romFiles.length === 0) {
      console.error('No ROM files found (.z64, .v64, .n64)');
      process.exit(1);
    }

    const results: Array<{
      id: string;
      title: string;
      gameCode: string;
      regionCode: string;
      version: number;
      format: string;
      file: string;
    }> = [];

    for (const file of romFiles) {
      try {
        const result = await computeA3DId(path.join(inputPath, file));
        results.push(result);

        if (!isJson) {
          console.log(`${result.id}  ${result.title || result.file}`);
        }
      } catch (err) {
        if (!isJson) {
          console.error(`Error processing ${file}: ${err}`);
        }
      }
    }

    if (isJson) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(`\nProcessed ${results.length} ROM files`);
    }
  } else {
    console.error('Please specify a ROM file or use --batch for directories');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
