#!/usr/bin/env npx tsx
/**
 * Read library.db directly from the mounted SD card
 *
 * library.db Format:
 * - Bytes 0-3: addedTime (Unix timestamp ÷ 60, i.e., minutes since Jan 1, 1970)
 * - Bytes 4-7: playTime (seconds)
 * - Bytes 8-11: Reserved (always 0)
 *
 * Usage: npx tsx scripts/read-sd-library.ts
 */

import { readFileSync, existsSync } from 'fs';

const SD_CARD_PATH = '/Volumes/ANALOGUE 3D/Library/N64/library.db';

const LIBRARY_DB_ID_TABLE_START = 0x100;
const LIBRARY_DB_DATA_START = 0x4100;
const LIBRARY_DB_MAX_ENTRIES = 4096;
const LIBRARY_DB_EMPTY_SLOT = 0xffffffff;

function cartIdToHex(id: number): string {
  return id.toString(16).padStart(8, '0');
}

function bytesToHex(bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
}

function formatDate(unixTimestamp: number): string {
  return new Date(unixTimestamp * 1000).toISOString();
}

function formatDateEST(unixTimestamp: number): string {
  return new Date(unixTimestamp * 1000).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

function main() {
  console.log('='.repeat(80));
  console.log('SD Card Library.db Reader');
  console.log('='.repeat(80));
  console.log('');

  if (!existsSync(SD_CARD_PATH)) {
    console.log(`SD card not found at: ${SD_CARD_PATH}`);
    console.log('');
    console.log('Make sure the SD card is inserted and mounted.');
    process.exit(1);
  }

  console.log(`Found SD card at: ${SD_CARD_PATH}`);
  console.log('');

  const data = readFileSync(SD_CARD_PATH);
  const view = new DataView(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));

  console.log(`File size: ${data.length} bytes`);
  console.log('');

  // Show raw hex dump for first entry area
  console.log('Raw hex dump of header (first 64 bytes):');
  console.log(bytesToHex(Array.from(data.slice(0, 64))));
  console.log('');

  // Find all entries
  const entries: Array<{
    index: number;
    cartId: number;
    cartIdHex: string;
    idOffset: number;
    dataOffset: number;
    rawIdBytes: number[];
    rawDataBytes: number[];
    addedTime: number;
    playTime: number;
    reserved: number;
  }> = [];

  for (let i = 0; i < LIBRARY_DB_MAX_ENTRIES; i++) {
    const idOffset = LIBRARY_DB_ID_TABLE_START + i * 4;
    if (idOffset + 4 > data.length) break;

    const cartId = view.getUint32(idOffset, true);

    if (cartId === LIBRARY_DB_EMPTY_SLOT) continue;

    const dataOffset = LIBRARY_DB_DATA_START + i * 12;
    if (dataOffset + 12 > data.length) continue;

    const addedTime = view.getUint32(dataOffset, true);
    const playTime = view.getUint32(dataOffset + 4, true);
    const reserved = view.getUint32(dataOffset + 8, true);

    const rawIdBytes = Array.from(data.slice(idOffset, idOffset + 4));
    const rawDataBytes = Array.from(data.slice(dataOffset, dataOffset + 12));

    entries.push({
      index: i,
      cartId,
      cartIdHex: cartIdToHex(cartId),
      idOffset,
      dataOffset,
      rawIdBytes,
      rawDataBytes,
      addedTime,
      playTime,
      reserved,
    });
  }

  console.log(`Found ${entries.length} entries\n`);

  // Known cart names for reference
  const knownCarts: Record<string, string> = {
    '17c5222c': '1080 Snowboarding',
    'ac631da0': 'GoldenEye 007',
    'b393776d': 'Super Mario 64',
    'e5240d18': 'Legend of Zelda: Ocarina of Time',
    '89239b0e': 'Donkey Kong 64',
    '9fc50ddd': 'Tony Hawk Pro Skater 2',
    'b54ec52b': 'Monopoly',
    '06f96131': 'Space Invaders',
  };

  for (const entry of entries) {
    const name = knownCarts[entry.cartIdHex] || 'Unknown';

    console.log('─'.repeat(80));
    console.log(`Entry ${entry.index}: ${entry.cartIdHex} (${name})`);
    console.log('─'.repeat(80));
    console.log('');

    console.log('Offsets:');
    console.log(`  ID table:      0x${entry.idOffset.toString(16).padStart(4, '0')} (${entry.idOffset})`);
    console.log(`  Extended data: 0x${entry.dataOffset.toString(16).padStart(4, '0')} (${entry.dataOffset})`);
    console.log('');

    console.log('Raw Bytes:');
    console.log(`  Cart ID (4 bytes):      ${bytesToHex(entry.rawIdBytes)}`);
    console.log(`  Extended data (12 bytes): ${bytesToHex(entry.rawDataBytes)}`);
    console.log('');

    console.log('Parsed Values:');
    console.log(`  addedTime: ${entry.addedTime} (0x${entry.addedTime.toString(16).padStart(8, '0')})`);
    console.log(`  playTime:  ${entry.playTime} seconds (${Math.floor(entry.playTime / 3600)}h ${Math.floor((entry.playTime % 3600) / 60)}m ${entry.playTime % 60}s)`);
    console.log(`  reserved:  ${entry.reserved} (should be 0)`);
    console.log('');

    // addedTime is Unix timestamp / 60 (minutes since Unix epoch)
    const unixTimestamp = entry.addedTime * 60;
    console.log('Date Added:');
    console.log(`  Formula: addedTime × 60 = Unix timestamp`);
    console.log(`  Unix timestamp: ${unixTimestamp}`);
    console.log(`  UTC: ${formatDate(unixTimestamp)}`);
    console.log(`  EST: ${formatDateEST(unixTimestamp)}`);
    console.log('');
  }

  console.log('='.repeat(80));
  console.log('FORMAT INFO');
  console.log('='.repeat(80));
  console.log('');
  console.log('library.db extended data format (12 bytes per entry):');
  console.log('  Bytes 0-3: addedTime = Unix timestamp ÷ 60 (minutes since Jan 1, 1970)');
  console.log('  Bytes 4-7: playTime in seconds');
  console.log('  Bytes 8-11: Reserved (always 0)');
  console.log('');
  console.log('To convert addedTime to Date:');
  console.log('  new Date(addedTime * 60 * 1000)');
  console.log('');
  console.log('To convert Date to addedTime:');
  console.log('  Math.floor(date.getTime() / 1000 / 60)');
  console.log('');
}

main();
