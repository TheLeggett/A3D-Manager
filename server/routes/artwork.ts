import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { writeFile } from 'fs/promises';
import { readGames } from '../lib/analogue-db.js';
import { bufferToTga } from '../lib/tga.js';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPEG, and WebP are allowed.'));
    }
  },
});

// Get local games directory path
const getLocalGamesDir = () => {
  return path.join(process.cwd(), '.local', 'Library', 'N64', 'Games');
};

// POST /api/games/:id/artwork - Upload new artwork
router.post('/:id/artwork', upload.single('artwork'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const gamesDir = getLocalGamesDir();
    const games = await readGames(gamesDir);
    const game = games.find((g) => g.id === req.params.id);

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Convert uploaded image to TGA
    const tgaBuffer = await bufferToTga(req.file.buffer);

    // Write TGA to game folder
    await writeFile(game.artworkPath, tgaBuffer);

    res.json({
      success: true,
      message: 'Artwork uploaded successfully',
    });
  } catch (error) {
    console.error('Error uploading artwork:', error);
    res.status(500).json({ error: 'Failed to upload artwork' });
  }
});

// POST /api/artwork/preview - Preview artwork conversion (returns PNG)
router.post('/preview', upload.single('artwork'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Import sharp for preview
    const { default: sharp } = await import('sharp');

    // Resize to target dimensions for preview
    const previewBuffer = await sharp(req.file.buffer)
      .resize(334, 385, {
        // 1/10 of actual size for preview
        fit: 'cover',
        position: 'center',
      })
      .png()
      .toBuffer();

    res.set('Content-Type', 'image/png');
    res.send(previewBuffer);
  } catch (error) {
    console.error('Error generating preview:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

export default router;
