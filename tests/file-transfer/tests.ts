/**
 * File Transfer Library Tests
 *
 * Tests for server/lib/file-transfer.ts - progress-enabled file operations
 * used for SD card sync.
 */

import { mkdir, rm, writeFile, readFile, stat } from 'fs/promises';
import path from 'path';
import { test, assert, assertEqual, TestSuite } from '../utils.js';
import {
  copyFileWithProgress,
  copyDirWithProgress,
  formatBytes,
  formatSpeed,
  formatTime,
  createProgressBar,
  FileProgress,
  BatchProgress,
} from '../../server/lib/file-transfer.js';

const OUTPUT_DIR = path.join(import.meta.dirname, 'output');

async function createTestFile(filePath: string, sizeBytes: number): Promise<void> {
  const buffer = Buffer.alloc(sizeBytes);
  for (let i = 0; i < sizeBytes; i++) {
    buffer[i] = i % 256;
  }
  await writeFile(filePath, buffer);
}

export async function cleanOutput(): Promise<void> {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });
}

// =============================================================================
// Format Helper Tests
// =============================================================================

const formatTests = [
  test('formatBytes: bytes', () => {
    assertEqual(formatBytes(500), '500 B');
  }),

  test('formatBytes: kilobytes', () => {
    assertEqual(formatBytes(1536), '1.5 KB');
  }),

  test('formatBytes: megabytes', () => {
    assertEqual(formatBytes(10485760), '10.0 MB');
  }),

  test('formatBytes: gigabytes', () => {
    assertEqual(formatBytes(1073741824), '1.00 GB');
  }),

  test('formatTime: milliseconds', () => {
    assertEqual(formatTime(500), '500ms');
  }),

  test('formatTime: seconds', () => {
    assertEqual(formatTime(5000), '5.0s');
  }),

  test('formatTime: minutes and seconds', () => {
    assertEqual(formatTime(90000), '1m 30s');
  }),

  test('formatSpeed: formats as bytes/s', () => {
    assertEqual(formatSpeed(10485760), '10.0 MB/s');
  }),

  test('createProgressBar: 0%', () => {
    const bar = createProgressBar(0, 10);
    assertEqual(bar, '[\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591]');
  }),

  test('createProgressBar: 50%', () => {
    const bar = createProgressBar(50, 10);
    assertEqual(bar, '[\u2588\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591\u2591]');
  }),

  test('createProgressBar: 100%', () => {
    const bar = createProgressBar(100, 10);
    assertEqual(bar, '[\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588]');
  }),
];

// =============================================================================
// Single File Copy Tests
// =============================================================================

const singleFileCopyTests = [
  test('copyFileWithProgress: copies file correctly', async () => {
    await cleanOutput();
    const srcPath = path.join(OUTPUT_DIR, 'src-file.bin');
    const dstPath = path.join(OUTPUT_DIR, 'dst-file.bin');

    await createTestFile(srcPath, 1024);

    await copyFileWithProgress(srcPath, dstPath, () => {});

    const srcData = await readFile(srcPath);
    const dstData = await readFile(dstPath);
    assertEqual(srcData.length, dstData.length, 'File sizes should match');
    assert(srcData.equals(dstData), 'File contents should match');
  }),

  test('copyFileWithProgress: reports progress callbacks', async () => {
    await cleanOutput();
    const srcPath = path.join(OUTPUT_DIR, 'progress-src.bin');
    const dstPath = path.join(OUTPUT_DIR, 'progress-dst.bin');

    await createTestFile(srcPath, 1024 * 1024);

    const progressUpdates: FileProgress[] = [];
    await copyFileWithProgress(srcPath, dstPath, (p) => progressUpdates.push({ ...p }), 0);

    assert(progressUpdates.length > 0, 'Should have progress updates');

    const first = progressUpdates[0];
    assert(first.bytesWritten > 0, 'First update should have bytes written');
    assertEqual(first.totalBytes, 1024 * 1024, 'Total bytes should be file size');

    const last = progressUpdates[progressUpdates.length - 1];
    assertEqual(last.percentage, 100, 'Last update should be 100%');
    assertEqual(last.bytesWritten, last.totalBytes, 'Should have written all bytes');
  }),

  test('copyFileWithProgress: progress has valid speed/ETA', async () => {
    await cleanOutput();
    const srcPath = path.join(OUTPUT_DIR, 'speed-src.bin');
    const dstPath = path.join(OUTPUT_DIR, 'speed-dst.bin');

    await createTestFile(srcPath, 512 * 1024);

    let lastProgress: FileProgress | null = null;
    await copyFileWithProgress(srcPath, dstPath, (p) => { lastProgress = p; }, 0);

    assert(lastProgress !== null, 'Should have progress');
    assert(lastProgress!.elapsedMs >= 0, 'Elapsed time should be >= 0');
    assert(lastProgress!.bytesPerSecond >= 0, 'Speed should be >= 0');
  }),

  test('copyFileWithProgress: creates destination directory', async () => {
    await cleanOutput();
    const srcPath = path.join(OUTPUT_DIR, 'mkdir-src.bin');
    const dstPath = path.join(OUTPUT_DIR, 'nested', 'deep', 'dir', 'dst.bin');

    await createTestFile(srcPath, 256);

    await copyFileWithProgress(srcPath, dstPath, () => {});

    const dstStats = await stat(dstPath);
    assert(dstStats.isFile(), 'Destination file should exist');
  }),
];

// =============================================================================
// Directory Copy Tests
// =============================================================================

const dirCopyTests = [
  test('copyDirWithProgress: copies directory structure', async () => {
    await cleanOutput();
    const srcDir = path.join(OUTPUT_DIR, 'src-dir');
    const dstDir = path.join(OUTPUT_DIR, 'dst-dir');

    await mkdir(path.join(srcDir, 'subdir'), { recursive: true });
    await createTestFile(path.join(srcDir, 'file1.bin'), 256);
    await createTestFile(path.join(srcDir, 'file2.bin'), 512);
    await createTestFile(path.join(srcDir, 'subdir', 'file3.bin'), 128);

    await copyDirWithProgress(srcDir, dstDir, () => {});

    const file1 = await stat(path.join(dstDir, 'file1.bin'));
    const file2 = await stat(path.join(dstDir, 'file2.bin'));
    const file3 = await stat(path.join(dstDir, 'subdir', 'file3.bin'));

    assert(file1.isFile(), 'file1 should exist');
    assert(file2.isFile(), 'file2 should exist');
    assert(file3.isFile(), 'file3 in subdir should exist');
  }),

  test('copyDirWithProgress: reports batch progress', async () => {
    await cleanOutput();
    const srcDir = path.join(OUTPUT_DIR, 'batch-src');
    const dstDir = path.join(OUTPUT_DIR, 'batch-dst');

    await mkdir(srcDir, { recursive: true });
    await createTestFile(path.join(srcDir, 'a.bin'), 256 * 1024);
    await createTestFile(path.join(srcDir, 'b.bin'), 256 * 1024);

    const progressUpdates: BatchProgress[] = [];
    await copyDirWithProgress(srcDir, dstDir, (p) => progressUpdates.push({ ...p }), 0);

    assert(progressUpdates.length > 0, 'Should have batch progress updates');

    const fileNames = [...new Set(progressUpdates.map(p => p.currentFileName))];
    assertEqual(fileNames.length, 2, 'Should have progress for 2 files');

    const last = progressUpdates[progressUpdates.length - 1];
    assertEqual(last.totalFiles, 2, 'Should report 2 total files');
    assertEqual(last.overallPercentage, 100, 'Should end at 100%');
  }),

  test('copyDirWithProgress: tracks overall bytes correctly', async () => {
    await cleanOutput();
    const srcDir = path.join(OUTPUT_DIR, 'bytes-src');
    const dstDir = path.join(OUTPUT_DIR, 'bytes-dst');

    const file1Size = 300 * 1024;
    const file2Size = 200 * 1024;
    const totalSize = file1Size + file2Size;

    await mkdir(srcDir, { recursive: true });
    await createTestFile(path.join(srcDir, 'large.bin'), file1Size);
    await createTestFile(path.join(srcDir, 'small.bin'), file2Size);

    let lastProgress: BatchProgress | null = null;
    await copyDirWithProgress(srcDir, dstDir, (p) => { lastProgress = p; }, 0);

    assert(lastProgress !== null, 'Should have progress');
    assertEqual(lastProgress!.overallTotalBytes, totalSize, 'Should track total bytes');
    assertEqual(lastProgress!.overallBytesWritten, totalSize, 'Should have written all bytes');
  }),
];

// =============================================================================
// Edge Case Tests
// =============================================================================

const edgeCaseTests = [
  test('copyFileWithProgress: handles empty file', async () => {
    await cleanOutput();
    const srcPath = path.join(OUTPUT_DIR, 'empty-src.bin');
    const dstPath = path.join(OUTPUT_DIR, 'empty-dst.bin');

    await writeFile(srcPath, Buffer.alloc(0));

    await copyFileWithProgress(srcPath, dstPath, () => {});

    const dstStats = await stat(dstPath);
    assertEqual(dstStats.size, 0, 'Empty file should be copied');
  }),

  test('copyDirWithProgress: handles empty directory', async () => {
    await cleanOutput();
    const srcDir = path.join(OUTPUT_DIR, 'empty-dir-src');
    const dstDir = path.join(OUTPUT_DIR, 'empty-dir-dst');

    await mkdir(srcDir, { recursive: true });

    await copyDirWithProgress(srcDir, dstDir, () => {});

    const dstStats = await stat(dstDir);
    assert(dstStats.isDirectory(), 'Empty directory should be created');
  }),
];

// =============================================================================
// Export Test Suite
// =============================================================================

export const fileTransferSuite: TestSuite = {
  name: 'File Transfer',
  tests: [
    ...formatTests,
    ...singleFileCopyTests,
    ...dirCopyTests,
    ...edgeCaseTests,
  ],
};
