/**
 * library.ts
 *
 * API routes for library.db operations.
 * Handles reading, parsing, and modifying the local library.db backup.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import {
  hasLocalLibraryDb,
  readLocalLibraryDb,
  writeLocalLibraryDb,
  deleteLocalLibraryDb,
  getLocalLibraryDbInfo,
  parseLibraryDb,
  verifyHeader,
  getEntryByCartId,
  updateEntry,
  hexToCartId,
  formatPlayTime,
  timestampToDate,
  dateToTimestamp,
  LIBRARY_DB_FILE_SIZE,
} from '../lib/library-db-core';

const router = Router();

// =============================================================================
// Multer Configuration
// =============================================================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: LIBRARY_DB_FILE_SIZE + 1024, // Allow some buffer
  },
  fileFilter: (_req, file, cb) => {
    if (file.originalname !== 'library.db' && !file.originalname.endsWith('.db')) {
      cb(new Error('Only .db files are allowed'));
      return;
    }
    cb(null, true);
  },
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Validate a cart ID parameter (8 hex characters)
 */
function validateCartIdParam(cartIdParam: string): {
  valid: boolean;
  cartId?: number;
  error?: string;
} {
  if (!/^[0-9a-f]{8}$/i.test(cartIdParam)) {
    return {
      valid: false,
      error: 'Invalid cart ID. Must be 8 hex characters.',
    };
  }

  const cartId = hexToCartId(cartIdParam);
  return { valid: true, cartId };
}

/**
 * Enrich entry with formatted data
 */
function enrichEntry(entry: ReturnType<typeof getEntryByCartId>) {
  if (!entry) return null;

  return {
    ...entry,
    addedDate: timestampToDate(entry.addedTime).toISOString(),
    playTimeFormatted: formatPlayTime(entry.playTime),
  };
}

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/library/status
 * Get local library.db status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const info = getLocalLibraryDbInfo();

    if (!info || !info.exists) {
      return res.json({
        exists: false,
        entryCount: 0,
        fileSize: 0,
      });
    }

    return res.json({
      exists: true,
      entryCount: info.entryCount ?? 0,
      fileSize: info.fileSize ?? 0,
      lastModified: info.lastModified?.toISOString(),
    });
  } catch (error) {
    console.error('Error getting library status:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get library status',
    });
  }
});

/**
 * GET /api/library/entries
 * Get all library entries with stats
 */
router.get('/entries', async (_req: Request, res: Response) => {
  try {
    const data = readLocalLibraryDb();

    if (!data) {
      return res.json({
        exists: false,
        entries: [],
        entryCount: 0,
      });
    }

    const verification = verifyHeader(data);
    if (!verification.valid) {
      return res.status(400).json({
        error: `Invalid library.db: ${verification.error}`,
      });
    }

    const library = parseLibraryDb(data);
    const enrichedEntries = library.entries.map((entry) => ({
      ...entry,
      addedDate: timestampToDate(entry.addedTime).toISOString(),
      playTimeFormatted: formatPlayTime(entry.playTime),
    }));

    return res.json({
      exists: true,
      entries: enrichedEntries,
      entryCount: library.entryCount,
    });
  } catch (error) {
    console.error('Error getting library entries:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get library entries',
    });
  }
});

/**
 * GET /api/library/entry/:cartId
 * Get a single entry by cart ID
 */
router.get('/entry/:cartId', async (req: Request, res: Response) => {
  try {
    const { cartId: cartIdParam } = req.params;
    const validation = validateCartIdParam(cartIdParam);

    if (!validation.valid || validation.cartId === undefined) {
      return res.status(400).json({ error: validation.error });
    }

    const data = readLocalLibraryDb();

    if (!data) {
      return res.json({
        exists: false,
        entry: null,
      });
    }

    const entry = getEntryByCartId(data, validation.cartId);
    const enrichedEntry = enrichEntry(entry);

    return res.json({
      exists: true,
      entry: enrichedEntry,
    });
  } catch (error) {
    console.error('Error getting library entry:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get library entry',
    });
  }
});

/**
 * PUT /api/library/entry/:cartId
 * Update an entry's stats
 */
router.put('/entry/:cartId', async (req: Request, res: Response) => {
  try {
    const { cartId: cartIdParam } = req.params;
    const validation = validateCartIdParam(cartIdParam);

    if (!validation.valid || validation.cartId === undefined) {
      return res.status(400).json({ error: validation.error });
    }

    const data = readLocalLibraryDb();

    if (!data) {
      return res.status(404).json({
        error: 'No local library.db exists',
      });
    }

    const { addedTime, playTime, addedDate } = req.body;

    // Build updates object
    const updates: { addedTime?: number; playTime?: number } = {};

    if (addedTime !== undefined) {
      if (typeof addedTime !== 'number' || addedTime < 0) {
        return res.status(400).json({ error: 'Invalid addedTime value' });
      }
      updates.addedTime = addedTime;
    }

    // Allow setting addedTime via ISO date string
    if (addedDate !== undefined) {
      const date = new Date(addedDate);
      if (isNaN(date.getTime())) {
        return res.status(400).json({ error: 'Invalid addedDate value' });
      }
      updates.addedTime = dateToTimestamp(date);
    }

    if (playTime !== undefined) {
      if (typeof playTime !== 'number' || playTime < 0) {
        return res.status(400).json({ error: 'Invalid playTime value' });
      }
      updates.playTime = playTime;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No valid updates provided. Include addedTime, addedDate, or playTime.',
      });
    }

    // Perform the update
    const updatedData = updateEntry(data, validation.cartId, updates);
    writeLocalLibraryDb(updatedData);

    // Return the updated entry
    const updatedEntry = getEntryByCartId(updatedData, validation.cartId);
    const enrichedEntry = enrichEntry(updatedEntry);

    return res.json({
      success: true,
      entry: enrichedEntry,
    });
  } catch (error) {
    console.error('Error updating library entry:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update library entry',
    });
  }
});

/**
 * POST /api/library/upload
 * Upload a library.db file to local storage
 */
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const data = req.file.buffer;

    // Verify the file
    const verification = verifyHeader(data);
    if (!verification.valid) {
      return res.status(400).json({
        error: `Invalid library.db file: ${verification.error}`,
      });
    }

    // Parse to get entry count
    const library = parseLibraryDb(data);

    // Save to local storage
    writeLocalLibraryDb(data);

    return res.json({
      success: true,
      entryCount: library.entryCount,
      fileSize: data.length,
    });
  } catch (error) {
    console.error('Error uploading library.db:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to upload library.db',
    });
  }
});

/**
 * GET /api/library/download
 * Download the local library.db file
 */
router.get('/download', async (_req: Request, res: Response) => {
  try {
    const data = readLocalLibraryDb();

    if (!data) {
      return res.status(404).json({ error: 'No local library.db exists' });
    }

    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', 'attachment; filename="library.db"');
    return res.send(data);
  } catch (error) {
    console.error('Error downloading library.db:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to download library.db',
    });
  }
});

/**
 * DELETE /api/library
 * Delete the local library.db backup
 */
router.delete('/', async (_req: Request, res: Response) => {
  try {
    if (!hasLocalLibraryDb()) {
      return res.status(404).json({ error: 'No local library.db exists' });
    }

    deleteLocalLibraryDb();

    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting library.db:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete library.db',
    });
  }
});

export default router;
