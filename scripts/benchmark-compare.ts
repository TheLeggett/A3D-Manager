/**
 * Benchmark script for labels.db comparison
 *
 * This script creates test labels.db files with known differences
 * and benchmarks the comparison algorithms.
 *
 * Usage: npx tsx scripts/benchmark-compare.ts [sdCardPath]
 *
 * If sdCardPath is provided, it will write test files to /Debug/labels.db on the SD card.
 * Otherwise, it will create test files in a temp directory.
 */

import { readFile, writeFile, mkdir, rm, access, constants } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseLabelsDb,
  DATA_START,
  IMAGE_SLOT_SIZE,
  ID_TABLE_START,
} from '../server/lib/labels-db-core.js';
import { compareQuick, compareDetailed } from '../server/lib/labels-db-compare.js';

const SOURCE_LABELS_DB = join(process.cwd(), 'labels.db');

interface BenchmarkResult {
  name: string;
  durationMs: number;
  result: unknown;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function createModifiedLabelsDb(
  sourcePath: string,
  options: {
    removeCount?: number;      // Number of entries to remove
    addCount?: number;         // Number of entries to add (with fake IDs)
    modifyCount?: number;      // Number of images to modify
  }
): Promise<Buffer> {
  const sourceData = await readFile(sourcePath);
  const db = parseLabelsDb(sourceData);

  console.log(`Source has ${db.entryCount} entries`);

  let data = Buffer.from(sourceData);

  // Modify some images (change a few bytes in each)
  if (options.modifyCount && options.modifyCount > 0) {
    const modifyIndices = [];
    for (let i = 0; i < Math.min(options.modifyCount, db.entryCount); i++) {
      modifyIndices.push(i * Math.floor(db.entryCount / options.modifyCount));
    }

    for (const index of modifyIndices) {
      const offset = DATA_START + index * IMAGE_SLOT_SIZE;
      // Flip some bytes in the image data
      for (let j = 0; j < 100; j++) {
        data[offset + j * 10] = (data[offset + j * 10] + 1) % 256;
      }
    }
    console.log(`Modified ${modifyIndices.length} images at indices: ${modifyIndices.slice(0, 5).join(', ')}...`);
  }

  // Remove entries (by setting their IDs to 0xFFFFFFFF)
  if (options.removeCount && options.removeCount > 0) {
    const removeIndices = [];
    for (let i = 0; i < Math.min(options.removeCount, db.entryCount); i++) {
      // Remove from the end to avoid shifting issues
      removeIndices.push(db.entryCount - 1 - i);
    }

    // Create new buffer without the removed entries
    const newEntryCount = db.entryCount - removeIndices.length;
    const newSize = DATA_START + newEntryCount * IMAGE_SLOT_SIZE;
    const newData = Buffer.alloc(newSize, 0xff);

    // Copy header
    data.copy(newData, 0, 0, DATA_START);

    // Copy remaining entries
    let newIndex = 0;
    for (let i = 0; i < db.entryCount; i++) {
      if (!removeIndices.includes(i)) {
        // Copy ID
        const oldIdOffset = ID_TABLE_START + i * 4;
        const newIdOffset = ID_TABLE_START + newIndex * 4;
        data.copy(newData, newIdOffset, oldIdOffset, oldIdOffset + 4);

        // Copy image data
        const oldDataOffset = DATA_START + i * IMAGE_SLOT_SIZE;
        const newDataOffset = DATA_START + newIndex * IMAGE_SLOT_SIZE;
        data.copy(newData, newDataOffset, oldDataOffset, oldDataOffset + IMAGE_SLOT_SIZE);

        newIndex++;
      }
    }

    data = newData;
    console.log(`Removed ${removeIndices.length} entries`);
  }

  return data;
}

async function runBenchmark(
  name: string,
  fn: () => Promise<unknown>
): Promise<BenchmarkResult> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  return { name, durationMs, result };
}

async function main() {
  const sdCardPath = process.argv[2];

  // Check if source labels.db exists
  if (!await fileExists(SOURCE_LABELS_DB)) {
    console.error('Error: labels.db not found in project root');
    process.exit(1);
  }

  const sourceStats = await readFile(SOURCE_LABELS_DB);
  const sourceDb = parseLabelsDb(sourceStats);
  console.log(`\nSource labels.db: ${sourceDb.entryCount} entries, ${(sourceStats.length / 1024 / 1024).toFixed(2)} MB\n`);

  // Determine where to write test files
  let testDir: string;
  let localPath: string;
  let otherPath: string;

  if (sdCardPath) {
    // Write to SD card Debug folder
    testDir = join(sdCardPath, 'Debug');
    localPath = join(process.cwd(), '.local', 'labels.db');
    otherPath = join(testDir, 'labels.db');
    console.log(`Using SD card at: ${sdCardPath}`);
    console.log(`Test file will be written to: ${otherPath}\n`);
  } else {
    // Use temp directory
    testDir = join(tmpdir(), 'labels-benchmark');
    localPath = join(testDir, 'local-labels.db');
    otherPath = join(testDir, 'other-labels.db');
    console.log(`Using temp directory: ${testDir}\n`);
  }

  // Create test directory
  await mkdir(testDir, { recursive: true });

  // Test scenarios
  const scenarios = [
    { name: 'Identical files', removeCount: 0, addCount: 0, modifyCount: 0 },
    { name: '10 modified images', removeCount: 0, addCount: 0, modifyCount: 10 },
    { name: '50 modified images', removeCount: 0, addCount: 0, modifyCount: 50 },
    { name: '5 removed entries', removeCount: 5, addCount: 0, modifyCount: 0 },
    { name: '5 removed + 10 modified', removeCount: 5, addCount: 0, modifyCount: 10 },
  ];

  console.log('='.repeat(80));
  console.log('BENCHMARK RESULTS');
  console.log('='.repeat(80));

  for (const scenario of scenarios) {
    console.log(`\n--- ${scenario.name} ---\n`);

    // Create the test file
    const modifiedData = await createModifiedLabelsDb(SOURCE_LABELS_DB, scenario);

    // Write test files
    if (sdCardPath) {
      // Use existing local labels.db and write modified to SD
      await writeFile(otherPath, modifiedData);
    } else {
      // Write both to temp
      await writeFile(localPath, sourceStats);
      await writeFile(otherPath, modifiedData);
    }

    // Run benchmarks
    const results: BenchmarkResult[] = [];

    // Quick compare
    results.push(await runBenchmark('Quick Compare', async () => {
      return compareQuick(localPath, otherPath);
    }));

    // Detailed compare (fast - sample hash)
    results.push(await runBenchmark('Detailed Compare (Sample Hash)', async () => {
      return compareDetailed(localPath, otherPath, { fullImageHash: false });
    }));

    // Detailed compare (full hash)
    results.push(await runBenchmark('Detailed Compare (Full Hash)', async () => {
      return compareDetailed(localPath, otherPath, { fullImageHash: true });
    }));

    // Print results
    for (const r of results) {
      console.log(`${r.name}: ${r.durationMs.toFixed(2)} ms`);
      if (r.result.breakdown) {
        console.log(`  - ID Table Read: ${r.result.breakdown.idTableReadMs.toFixed(2)} ms`);
        console.log(`  - ID Compare: ${r.result.breakdown.idCompareMs.toFixed(2)} ms`);
        console.log(`  - Image Compare: ${r.result.breakdown.imageCompareMs.toFixed(2)} ms`);
      }
      if (r.result.identical !== undefined) {
        console.log(`  Identical: ${r.result.identical}`);
      }
      if (r.result.onlyInLocal?.length > 0 || r.result.onlyInOther?.length > 0 || r.result.modified?.length > 0) {
        console.log(`  Only in Local: ${r.result.onlyInLocal?.length || 0}`);
        console.log(`  Only in Other: ${r.result.onlyInOther?.length || 0}`);
        console.log(`  Modified: ${r.result.modified?.length || 0}`);
      }
      console.log();
    }
  }

  // Cleanup temp files if not using SD card
  if (!sdCardPath) {
    await rm(testDir, { recursive: true, force: true });
    console.log('\nTemp files cleaned up.');
  } else {
    console.log(`\nTest file left at: ${otherPath}`);
    console.log('You can delete it manually or run the script again.');
  }
}

main().catch(console.error);
