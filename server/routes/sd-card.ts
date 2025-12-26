import { Router } from 'express';
import path from 'path';
import { unlink, stat } from 'fs/promises';

const router = Router();

// DELETE /api/sd-card/labels - Delete labels.db from SD card
router.delete('/labels', async (req, res) => {
  try {
    const sdCardPath = req.query.sdCardPath as string;

    if (!sdCardPath) {
      return res.status(400).json({ error: 'SD card path is required' });
    }

    // Path matches the Analogue 3D structure: /Library/N64/Images/labels.db
    const labelsDbPath = path.join(sdCardPath, 'Library', 'N64', 'Images', 'labels.db');

    // Check if file exists
    try {
      await stat(labelsDbPath);
    } catch {
      return res.status(404).json({ error: 'labels.db not found on SD card' });
    }

    // Delete the file
    await unlink(labelsDbPath);

    console.log(`Deleted labels.db from SD card: ${labelsDbPath}`);

    res.json({
      success: true,
      message: 'labels.db deleted from SD card',
      path: labelsDbPath,
    });
  } catch (error) {
    console.error('Error deleting labels.db from SD card:', error);
    res.status(500).json({ error: 'Failed to delete labels.db from SD card' });
  }
});

export default router;
