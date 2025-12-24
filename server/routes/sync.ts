import { Router } from 'express';
import path from 'path';
import {
  detectSDCards,
  isValidAnalogueDir,
  exportLabelsToSDWithProgress,
} from '../lib/sd-card.js';
import { formatBytes, formatSpeed, formatTime } from '../lib/file-transfer.js';
import {
  hasLocalLabelsDb,
  getLabelsDbStatus,
} from '../lib/labels-db-core.js';

const router = Router();

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

// GET /api/sync/full/preview - Preview what will be synced
router.get('/full/preview', async (req, res) => {
  try {
    const sdCardPath = req.query.sdCardPath as string;

    if (!sdCardPath) {
      return res.status(400).json({ error: 'SD card path required' });
    }

    if (!(await isValidAnalogueDir(sdCardPath))) {
      return res.status(400).json({ error: 'Invalid Analogue 3D SD card' });
    }

    // Check if we have a local labels.db to export
    const hasLocalLabels = await hasLocalLabelsDb();
    const status = await getLabelsDbStatus();

    res.json({
      labels: {
        hasLocalLabels,
        localLabelCount: status?.entryCount || 0,
      },
    });
  } catch (error) {
    console.error('Error previewing sync:', error);
    res.status(500).json({ error: 'Failed to preview sync' });
  }
});

// GET /api/sync/full/apply-stream - Apply full sync with SSE progress
router.get('/full/apply-stream', async (req, res) => {
  const sdCardPath = req.query.sdCardPath as string;

  if (!sdCardPath) {
    res.status(400).json({ error: 'SD card path required' });
    return;
  }

  if (!(await isValidAnalogueDir(sdCardPath))) {
    res.status(400).json({ error: 'Invalid Analogue 3D SD card' });
    return;
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendProgress = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const labelsPath = path.join(sdCardPath, 'Library', 'N64', 'Images', 'labels.db');

  const results = {
    labels: { success: false, entryCount: 0, fileSize: 0, error: null as string | null },
  };

  try {
    const hasLabels = await hasLocalLabelsDb();
    const status = await getLabelsDbStatus();
    const labelCount = status?.entryCount || 0;
    const fileSize = status?.fileSize || 0;

    sendProgress({
      type: 'start',
      total: 1,
      labelCount,
      totalBytes: fileSize,
    });

    if (hasLabels) {
      try {
        const exportResult = await exportLabelsToSDWithProgress(
          labelsPath,
          (progress) => {
            sendProgress({
              type: 'progress',
              step: 'labels',
              fileName: 'labels.db',
              bytesWritten: progress.bytesWritten,
              totalBytes: progress.totalBytes,
              percentage: Math.round(progress.percentage),
              speed: formatSpeed(progress.bytesPerSecond),
              speedBytes: progress.bytesPerSecond,
              eta: formatTime(progress.estimatedTimeRemainingMs),
              etaMs: progress.estimatedTimeRemainingMs,
              // Formatted strings for display
              bytesWrittenFormatted: formatBytes(progress.bytesWritten),
              totalBytesFormatted: formatBytes(progress.totalBytes),
            });
          }
        );
        results.labels.success = true;
        results.labels.entryCount = exportResult.entryCount;
        results.labels.fileSize = exportResult.fileSize;
      } catch (err) {
        results.labels.error = `Failed to export labels: ${err}`;
      }
    }

    sendProgress({
      type: 'complete',
      results,
    });

  } catch (error) {
    sendProgress({
      type: 'error',
      error: `Sync failed: ${error}`,
    });
  }

  res.end();
});

export default router;
