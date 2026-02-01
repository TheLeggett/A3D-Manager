#!/usr/bin/env npx tsx
/**
 * Dump library.db to human-readable format
 *
 * This script parses library.db and outputs all data in a readable format
 * to verify the documented format specification.
 *
 * Usage: npx tsx scripts/dump-library-db.ts [path-to-library.db]
 *        Default: ./library.db
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// =============================================================================
// Constants from documentation
// =============================================================================

const LIBRARY_DB_MAGIC_BYTE = 0x07;
const LIBRARY_DB_IDENTIFIER_1 = 'Analogue-Co';
const LIBRARY_DB_IDENTIFIER_2 = 'Analogue-3D.library';
const LIBRARY_DB_VERSION = 0x00010000;
const LIBRARY_DB_ID_TABLE_START = 0x100;
const LIBRARY_DB_DATA_START = 0x4100;
const LIBRARY_DB_MAX_ENTRIES = 4096;
const LIBRARY_DB_ID_SIZE = 4;
const LIBRARY_DB_ENTRY_SIZE = 12;
const LIBRARY_DB_EMPTY_SLOT = 0xffffffff;
const LIBRARY_DB_EXPECTED_SIZE = LIBRARY_DB_DATA_START + LIBRARY_DB_MAX_ENTRIES * LIBRARY_DB_ENTRY_SIZE;

// Known cart IDs for reference
const KNOWN_CARTS: Record<string, string> = {
  '17c5222c': '1080 Snowboarding',
  '89239b0e': 'Donkey Kong 64',
  'ac631da0': 'GoldenEye 007',
  'e5240d18': 'Legend of Zelda: Ocarina of Time',
  '03cc04ee': 'Mario Kart 64',
  'b54ec52b': 'Monopoly',
  'b04b4109': 'Perfect Dark',
  'b393776d': 'Super Mario 64',
  '04079b93': 'Star Fox 64',
  '9fc50ddd': 'Tony Hawk Pro Skater 2',
  'affb9db5': 'Wave Race 64',
};

// =============================================================================
// Utility Functions
// =============================================================================

function bytesToHex(bytes: Uint8Array | number[], separator = ' '): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(separator);
}

function cartIdToHex(id: number): string {
  return id.toString(16).padStart(8, '0');
}

function formatPlayTime(seconds: number): string {
  if (seconds === 0) return '0s';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  return parts.join(' ');
}

function timestampToDate(addedTime: number): Date {
  // addedTime is minutes since Unix epoch
  return new Date(addedTime * 60 * 1000);
}

function formatDate(date: Date): string {
  return date.toISOString();
}

function formatDateLocal(date: Date): string {
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// =============================================================================
// Main
// =============================================================================

function main() {
  const inputPath = process.argv[2] || './library.db';
  const filePath = resolve(inputPath);

  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                        library.db Format Validator                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const data = readFileSync(filePath);
  const view = new DataView(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));

  console.log(`File: ${filePath}`);
  console.log(`Size: ${data.length} bytes (expected: ${LIBRARY_DB_EXPECTED_SIZE} bytes)`);
  console.log('');

  // =========================================================================
  // Header Validation
  // =========================================================================

  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ HEADER SECTION (0x00 - 0xFF)                                                 │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');
  console.log('');

  // Magic byte
  const magicByte = view.getUint8(0);
  const magicValid = magicByte === LIBRARY_DB_MAGIC_BYTE;
  console.log(`[0x00] Magic Byte:`);
  console.log(`  Value:    0x${magicByte.toString(16).padStart(2, '0')}`);
  console.log(`  Expected: 0x${LIBRARY_DB_MAGIC_BYTE.toString(16).padStart(2, '0')}`);
  console.log(`  Status:   ${magicValid ? '✓ VALID' : '✗ INVALID'}`);
  console.log('');

  // Identifier 1: "Analogue-Co" at 0x01
  const id1Bytes = data.slice(0x01, 0x20);
  const id1String = String.fromCharCode(...id1Bytes).replace(/\0/g, '');
  const id1Valid = id1String === LIBRARY_DB_IDENTIFIER_1;
  console.log(`[0x01-0x1F] Identifier 1 (31 bytes, null-padded):`);
  console.log(`  Raw:      ${bytesToHex(id1Bytes)}`);
  console.log(`  String:   "${id1String}"`);
  console.log(`  Expected: "${LIBRARY_DB_IDENTIFIER_1}"`);
  console.log(`  Status:   ${id1Valid ? '✓ VALID' : '✗ INVALID'}`);
  console.log('');

  // Identifier 2: "Analogue-3D.library" at 0x20
  const id2Bytes = data.slice(0x20, 0x40);
  const id2String = String.fromCharCode(...id2Bytes).replace(/\0/g, '');
  const id2Valid = id2String === LIBRARY_DB_IDENTIFIER_2;
  console.log(`[0x20-0x3F] Identifier 2 (32 bytes, null-padded):`);
  console.log(`  Raw:      ${bytesToHex(id2Bytes)}`);
  console.log(`  String:   "${id2String}"`);
  console.log(`  Expected: "${LIBRARY_DB_IDENTIFIER_2}"`);
  console.log(`  Status:   ${id2Valid ? '✓ VALID' : '✗ INVALID'}`);
  console.log('');

  // Version at 0x40
  const version = view.getUint32(0x40, true);
  const versionValid = version === LIBRARY_DB_VERSION;
  console.log(`[0x40-0x43] Version (uint32_le):`);
  console.log(`  Raw:      ${bytesToHex(data.slice(0x40, 0x44))}`);
  console.log(`  Value:    0x${version.toString(16).padStart(8, '0')}`);
  console.log(`  Expected: 0x${LIBRARY_DB_VERSION.toString(16).padStart(8, '0')} (v1.0)`);
  console.log(`  Status:   ${versionValid ? '✓ VALID' : '✗ INVALID'}`);
  console.log('');

  // Unknown field at 0x44
  const unknown44 = view.getUint32(0x44, true);
  console.log(`[0x44-0x47] Unknown field (uint32_le):`);
  console.log(`  Raw:      ${bytesToHex(data.slice(0x44, 0x48))}`);
  console.log(`  Value:    0x${unknown44.toString(16).padStart(8, '0')}`);
  console.log(`  Note:     Documentation says "observed: 0x00010000" - purpose unknown`);
  console.log('');

  // Reserved section 0x48-0xFF
  const reservedHeader = data.slice(0x48, 0x100);
  const reservedAllZero = reservedHeader.every(b => b === 0);
  console.log(`[0x48-0xFF] Reserved (${reservedHeader.length} bytes):`);
  console.log(`  Status:   ${reservedAllZero ? '✓ All zeros' : '✗ Contains non-zero bytes'}`);
  if (!reservedAllZero) {
    const nonZeroOffsets: number[] = [];
    reservedHeader.forEach((b, i) => {
      if (b !== 0) nonZeroOffsets.push(0x48 + i);
    });
    console.log(`  Non-zero offsets: ${nonZeroOffsets.map(o => '0x' + o.toString(16)).join(', ')}`);
  }
  console.log('');

  // =========================================================================
  // Cart ID Table
  // =========================================================================

  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ CART ID TABLE (0x100 - 0x40FF)                                               │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');
  console.log('');

  interface Entry {
    index: number;
    cartId: number;
    cartIdHex: string;
    idOffset: number;
    dataOffset: number;
    rawIdBytes: Uint8Array;
    rawDataBytes: Uint8Array;
    addedTime: number;
    playTime: number;
    sessions: number;
  }

  const entries: Entry[] = [];
  let emptySlots = 0;

  for (let i = 0; i < LIBRARY_DB_MAX_ENTRIES; i++) {
    const idOffset = LIBRARY_DB_ID_TABLE_START + i * LIBRARY_DB_ID_SIZE;
    if (idOffset + LIBRARY_DB_ID_SIZE > data.length) break;

    const cartId = view.getUint32(idOffset, true);

    if (cartId === LIBRARY_DB_EMPTY_SLOT) {
      emptySlots++;
      continue;
    }

    const dataOffset = LIBRARY_DB_DATA_START + i * LIBRARY_DB_ENTRY_SIZE;
    if (dataOffset + LIBRARY_DB_ENTRY_SIZE > data.length) continue;

    const addedTime = view.getUint32(dataOffset, true);
    const playTime = view.getUint32(dataOffset + 4, true);
    const sessions = view.getUint32(dataOffset + 8, true);

    entries.push({
      index: i,
      cartId,
      cartIdHex: cartIdToHex(cartId),
      idOffset,
      dataOffset,
      rawIdBytes: data.slice(idOffset, idOffset + 4),
      rawDataBytes: data.slice(dataOffset, dataOffset + 12),
      addedTime,
      playTime,
      sessions,
    });
  }

  console.log(`Format: 4096 slots × 4 bytes = 16384 bytes`);
  console.log(`Empty slot marker: 0xFFFFFFFF`);
  console.log(`Byte order: Little-endian`);
  console.log('');
  console.log(`Populated entries: ${entries.length}`);
  console.log(`Empty slots: ${emptySlots}`);
  console.log('');

  // =========================================================================
  // Extended Data Section
  // =========================================================================

  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ EXTENDED DATA SECTION (0x4100+)                                              │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');
  console.log('');

  console.log('Format per entry (12 bytes):');
  console.log('  [+0] addedTime (uint32_le): Minutes since Unix epoch (Jan 1, 1970)');
  console.log('  [+4] playTime (uint32_le):  Total play time in seconds');
  console.log('  [+8] sessions (uint32_le):  Number of times game was launched');
  console.log('');

  // =========================================================================
  // Entry Details
  // =========================================================================

  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ ENTRY DETAILS                                                                │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');
  console.log('');

  for (const entry of entries) {
    const name = KNOWN_CARTS[entry.cartIdHex] || 'Unknown';
    const addedDate = timestampToDate(entry.addedTime);

    console.log(`═══════════════════════════════════════════════════════════════════════════════`);
    console.log(`Entry #${entry.index}: ${entry.cartIdHex} - ${name}`);
    console.log(`═══════════════════════════════════════════════════════════════════════════════`);
    console.log('');

    console.log('Locations:');
    console.log(`  Cart ID offset:      0x${entry.idOffset.toString(16).padStart(4, '0')}`);
    console.log(`  Extended data offset: 0x${entry.dataOffset.toString(16).padStart(4, '0')}`);
    console.log('');

    console.log('Raw Bytes:');
    console.log(`  Cart ID (4 bytes):        ${bytesToHex(entry.rawIdBytes)}`);
    console.log(`  Extended data (12 bytes): ${bytesToHex(entry.rawDataBytes)}`);
    console.log('');

    console.log('Parsed Values:');
    console.log(`  addedTime: ${entry.addedTime}`);
    console.log(`    → Hex: 0x${entry.addedTime.toString(16).padStart(8, '0')}`);
    console.log(`    → As Unix timestamp: ${entry.addedTime * 60}`);
    console.log(`    → UTC: ${formatDate(addedDate)}`);
    console.log(`    → Local (EST): ${formatDateLocal(addedDate)}`);
    console.log('');

    console.log(`  playTime: ${entry.playTime} seconds`);
    console.log(`    → Hex: 0x${entry.playTime.toString(16).padStart(8, '0')}`);
    console.log(`    → Formatted: ${formatPlayTime(entry.playTime)}`);
    console.log('');

    console.log(`  sessions: ${entry.sessions}`);
    console.log(`    → Hex: 0x${entry.sessions.toString(16).padStart(8, '0')}`);
    console.log(`    → Meaning: Game launched ${entry.sessions} time${entry.sessions !== 1 ? 's' : ''}`);
    console.log('');
  }

  // =========================================================================
  // Summary Table
  // =========================================================================

  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SUMMARY TABLE                                                                │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');
  console.log('');

  console.log('┌───────┬──────────┬────────────────────────────────────┬───────────┬──────────┐');
  console.log('│ Index │ Cart ID  │ Name                               │ Play Time │ Sessions │');
  console.log('├───────┼──────────┼────────────────────────────────────┼───────────┼──────────┤');

  for (const entry of entries) {
    const name = (KNOWN_CARTS[entry.cartIdHex] || 'Unknown').padEnd(34);
    const playTimeStr = formatPlayTime(entry.playTime).padStart(9);
    const sessionsStr = entry.sessions.toString().padStart(8);
    console.log(`│ ${entry.index.toString().padStart(5)} │ ${entry.cartIdHex} │ ${name} │ ${playTimeStr} │ ${sessionsStr} │`);
  }

  console.log('└───────┴──────────┴────────────────────────────────────┴───────────┴──────────┘');
  console.log('');

  // =========================================================================
  // Validation Summary
  // =========================================================================

  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ VALIDATION SUMMARY                                                           │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');
  console.log('');

  const checks = [
    { name: 'Magic byte (0x07)', pass: magicValid },
    { name: 'Identifier 1 (Analogue-Co)', pass: id1Valid },
    { name: 'Identifier 2 (Analogue-3D.library)', pass: id2Valid },
    { name: 'Version (0x00010000)', pass: versionValid },
    { name: 'Reserved header section all zeros', pass: reservedAllZero },
  ];

  for (const check of checks) {
    console.log(`  ${check.pass ? '✓' : '✗'} ${check.name}`);
  }
  console.log('');

  const allPassed = checks.every(c => c.pass);
  if (allPassed) {
    console.log('✓ All validation checks passed - file format matches documentation');
  } else {
    console.log('⚠️  Some checks failed - file may be corrupted or format has changed');
  }
  console.log('');

  // =========================================================================
  // Statistics
  // =========================================================================

  console.log('┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ LIBRARY STATISTICS                                                           │');
  console.log('└──────────────────────────────────────────────────────────────────────────────┘');
  console.log('');

  const totalPlayTime = entries.reduce((sum, e) => sum + e.playTime, 0);
  const totalSessions = entries.reduce((sum, e) => sum + e.sessions, 0);
  const gamesPlayed = entries.filter(e => e.sessions > 0).length;
  const gamesNotPlayed = entries.filter(e => e.sessions === 0).length;

  console.log(`  Total games in library: ${entries.length}`);
  console.log(`  Games launched at least once: ${gamesPlayed}`);
  console.log(`  Games never launched: ${gamesNotPlayed}`);
  console.log(`  Total play time: ${formatPlayTime(totalPlayTime)}`);
  console.log(`  Total sessions: ${totalSessions}`);
  console.log('');
}

main();
