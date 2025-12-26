import { Router } from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { stat, access, constants, mkdir, readdir } from 'fs/promises';
import {
  detectSDCards,
  isValidAnalogueDir,
  exportLabelsToSDWithProgress,
} from '../lib/sd-card.js';
import {
  formatBytes,
  formatSpeed,
  formatTime,
  copyFileWithProgress,
} from '../lib/file-transfer.js';
import {
  hasLocalLabelsDb,
  getLocalLabelsDbPath,
  getLabelsDbStatus,
} from '../lib/labels-db-core.js';

const router = Router();

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a file exists and is readable
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the labels.db path on an SD card
 */
function getSDLabelsPath(sdCardPath: string): string {
  return path.join(sdCardPath, 'Library', 'N64', 'Images', 'labels.db');
}

/**
 * Set up Server-Sent Events (SSE) on a response
 */
function setupSSE(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

/**
 * Create a progress sender function for SSE
 */
function createProgressSender(res: Response): (data: object) => void {
  return (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
}

/**
 * Format progress data consistently for SSE events
 */
function formatProgressEvent(progress: {
  bytesWritten: number;
  totalBytes: number;
  percentage: number;
  bytesPerSecond: number;
  estimatedTimeRemainingMs: number;
}): object {
  return {
    type: 'progress',
    bytesWritten: progress.bytesWritten,
    totalBytes: progress.totalBytes,
    percentage: Math.round(progress.percentage),
    speed: formatSpeed(progress.bytesPerSecond),
    eta: formatTime(progress.estimatedTimeRemainingMs),
    bytesWrittenFormatted: formatBytes(progress.bytesWritten),
    totalBytesFormatted: formatBytes(progress.totalBytes),
  };
}

/**
 * Validate SD card path and return error response if invalid
 * Returns true if validation passed, false if error response was sent
 */
async function validateSDCardPath(
  sdCardPath: string | undefined,
  res: Response
): Promise<boolean> {
  if (!sdCardPath) {
    res.status(400).json({ error: 'SD card path required' });
    return false;
  }

  if (!(await isValidAnalogueDir(sdCardPath))) {
    res.status(400).json({ error: 'Invalid Analogue 3D SD card' });
    return false;
  }

  return true;
}

// =============================================================================
// Routes
// =============================================================================

// GET /api/sd-cards - Detect connected SD cards
router.get('/sd-cards', async (_req, res) => {
  try {
    const sdCards = await detectSDCards();
    res.json(sdCards);
  } catch (error) {
    console.error('Error detecting SD cards:', error);
    res.status(500).json({ error: 'Failed to detect SD cards' });
  }
});

// GET /api/sync/labels/exists - Fast check if labels.db exists on SD card
router.get('/labels/exists', async (req, res) => {
  try {
    const sdCardPath = req.query.sdCardPath as string;

    if (!(await validateSDCardPath(sdCardPath, res))) return;

    const sdLabelsPath = getSDLabelsPath(sdCardPath);
    const exists = await fileExists(sdLabelsPath);

    // If it exists, get file size (fast) to check it's not empty
    let fileSize = 0;
    let entryCount = 0;
    if (exists) {
      try {
        const stats = await stat(sdLabelsPath);
        fileSize = stats.size;
        // Calculate entry count from file size (instant)
        if (fileSize >= 0x4100) {
          entryCount = Math.floor((fileSize - 0x4100) / 25600);
        }
      } catch {
        // Ignore stat errors
      }
    }

    res.json({
      exists: exists && fileSize > 0,
      fileSize,
      fileSizeFormatted: formatBytes(fileSize),
      entryCount,
    });
  } catch (error) {
    console.error('Error checking SD labels existence:', error);
    res.status(500).json({ error: 'Failed to check SD labels' });
  }
});

// GET /api/sync/games/exists - Fast check if games exist on SD card
router.get('/games/exists', async (req, res) => {
  try {
    const sdCardPath = req.query.sdCardPath as string;

    if (!(await validateSDCardPath(sdCardPath, res))) return;

    const gamesPath = path.join(sdCardPath, 'Library', 'N64', 'Games');
    let exists = false;
    let gameCount = 0;

    try {
      const entries = await readdir(gamesPath, { withFileTypes: true });
      // Count directories that end with 8 hex chars (game folder naming convention)
      const gameFolders = entries.filter(
        e => e.isDirectory() && /[0-9a-fA-F]{8}$/.test(e.name)
      );
      gameCount = gameFolders.length;
      exists = gameCount > 0;
    } catch {
      // Games folder doesn't exist or isn't readable
    }

    res.json({
      exists,
      gameCount,
    });
  } catch (error) {
    console.error('Error checking SD games existence:', error);
    res.status(500).json({ error: 'Failed to check SD games' });
  }
});

// Calculate entry count from file size using the labels.db format spec
// entry_count = (file_size - 0x4100) / 25,600
const LABELS_DB_DATA_START = 0x4100; // 16,640 bytes
const LABELS_DB_IMAGE_SLOT_SIZE = 25600;

function calculateEntryCountFromFileSize(fileSize: number): number {
  if (fileSize < LABELS_DB_DATA_START) return 0;
  return Math.floor((fileSize - LABELS_DB_DATA_START) / LABELS_DB_IMAGE_SLOT_SIZE);
}

// GET /api/sync/labels/status - Get sync status for labels.db (local vs SD)
router.get('/labels/status', async (req, res) => {
  try {
    const sdCardPath = req.query.sdCardPath as string;

    if (!(await validateSDCardPath(sdCardPath, res))) return;

    const sdLabelsPath = getSDLabelsPath(sdCardPath);
    const localPath = getLocalLabelsDbPath();

    // Check local labels.db - use file size to calculate entry count (instant)
    const hasLocal = await hasLocalLabelsDb();
    let localEntryCount = 0;
    let localFileSize = 0;
    if (hasLocal) {
      try {
        const localStats = await stat(localPath);
        localFileSize = localStats.size;
        localEntryCount = calculateEntryCountFromFileSize(localFileSize);
      } catch {
        // Ignore stat errors
      }
    }

    // Check SD card labels.db - use file size to calculate entry count (instant)
    const hasSD = await fileExists(sdLabelsPath);
    let sdEntryCount = 0;
    let sdFileSize = 0;
    if (hasSD) {
      try {
        const sdStats = await stat(sdLabelsPath);
        sdFileSize = sdStats.size;
        sdEntryCount = calculateEntryCountFromFileSize(sdFileSize);
      } catch (err) {
        console.error('Error reading SD labels.db:', err);
      }
    }

    res.json({
      local: {
        exists: hasLocal,
        entryCount: localEntryCount,
        fileSize: localFileSize,
        fileSizeFormatted: formatBytes(localFileSize),
      },
      sd: {
        exists: hasSD,
        entryCount: sdEntryCount,
        fileSize: sdFileSize,
        fileSizeFormatted: formatBytes(sdFileSize),
      },
    });
  } catch (error) {
    console.error('Error getting labels sync status:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

// GET /api/sync/labels/upload-stream - Upload labels.db to SD with SSE progress
router.get('/labels/upload-stream', async (req: Request, res: Response) => {
  const sdCardPath = req.query.sdCardPath as string;

  if (!(await validateSDCardPath(sdCardPath, res))) return;

  const hasLabels = await hasLocalLabelsDb();
  if (!hasLabels) {
    res.status(400).json({ error: 'No local labels.db to upload' });
    return;
  }

  setupSSE(res);
  const sendProgress = createProgressSender(res);
  const sdLabelsPath = getSDLabelsPath(sdCardPath);

  try {
    const status = await getLabelsDbStatus();
    const entryCount = status?.entryCount || 0;
    const fileSize = status?.fileSize || 0;

    sendProgress({
      type: 'start',
      direction: 'upload',
      entryCount,
      totalBytes: fileSize,
    });

    const exportResult = await exportLabelsToSDWithProgress(
      sdLabelsPath,
      (progress) => sendProgress(formatProgressEvent(progress))
    );

    sendProgress({
      type: 'complete',
      success: true,
      entryCount: exportResult.entryCount,
      fileSize: exportResult.fileSize,
    });
  } catch (error) {
    sendProgress({
      type: 'error',
      error: `Upload failed: ${error}`,
    });
  }

  res.end();
});

// GET /api/sync/labels/download-stream - Download labels.db from SD with SSE progress
router.get('/labels/download-stream', async (req: Request, res: Response) => {
  const sdCardPath = req.query.sdCardPath as string;

  if (!(await validateSDCardPath(sdCardPath, res))) return;

  const sdLabelsPath = getSDLabelsPath(sdCardPath);

  if (!(await fileExists(sdLabelsPath))) {
    res.status(400).json({ error: 'No labels.db on SD card' });
    return;
  }

  setupSSE(res);
  const sendProgress = createProgressSender(res);
  const localPath = getLocalLabelsDbPath();

  try {
    // Get SD file info - use file size to calculate entry count (instant)
    const sdStats = await stat(sdLabelsPath);
    const entryCount = calculateEntryCountFromFileSize(sdStats.size);

    sendProgress({
      type: 'start',
      direction: 'download',
      entryCount,
      totalBytes: sdStats.size,
    });

    // Ensure local directory exists
    await mkdir(path.dirname(localPath), { recursive: true });

    // Copy from SD to local with progress
    await copyFileWithProgress(
      sdLabelsPath,
      localPath,
      (progress) => sendProgress(formatProgressEvent(progress)),
      50
    );

    sendProgress({
      type: 'complete',
      success: true,
      entryCount,
      fileSize: sdStats.size,
    });
  } catch (error) {
    sendProgress({
      type: 'error',
      error: `Download failed: ${error}`,
    });
  }

  res.end();
});

export default router;
