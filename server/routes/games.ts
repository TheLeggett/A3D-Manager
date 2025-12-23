import { Router } from 'express';
import path from 'path';
import { readGames, updateGameTitle, updateGameSettings } from '../lib/analogue-db.js';
import { tgaToPng } from '../lib/tga.js';

const router = Router();

// Get local games directory path
const getLocalGamesDir = () => {
  return path.join(process.cwd(), '.local', 'Library', 'N64', 'Games');
};

// GET /api/games - List all games
router.get('/', async (req, res) => {
  try {
    const gamesDir = getLocalGamesDir();
    const games = await readGames(gamesDir);

    // Return games without full paths for security
    const safeGames = games.map((game) => ({
      id: game.id,
      title: game.title,
      folderName: game.folderName,
      hasArtwork: game.hasArtwork,
      settings: game.settings,
    }));

    res.json(safeGames);
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

// GET /api/games/:id/artwork - Get game artwork as PNG
router.get('/:id/artwork', async (req, res) => {
  try {
    const gamesDir = getLocalGamesDir();
    const games = await readGames(gamesDir);
    const game = games.find((g) => g.id === req.params.id);

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (!game.hasArtwork) {
      return res.status(404).json({ error: 'No artwork available' });
    }

    const pngBuffer = await tgaToPng(game.artworkPath);
    res.set('Content-Type', 'image/png');
    res.send(pngBuffer);
  } catch (error) {
    console.error('Error fetching artwork:', error);
    res.status(500).json({ error: 'Failed to fetch artwork' });
  }
});

// PATCH /api/games/:id - Update game title or settings
router.patch('/:id', async (req, res) => {
  try {
    const gamesDir = getLocalGamesDir();
    const games = await readGames(gamesDir);
    const game = games.find((g) => g.id === req.params.id);

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const { title, settings } = req.body;

    let updatedGame = game;

    // Update title if provided
    if (title && title !== game.title) {
      updatedGame = await updateGameTitle(gamesDir, game, title);
    }

    // Update settings if provided
    if (settings) {
      const newSettings = await updateGameSettings(updatedGame, settings);
      updatedGame = { ...updatedGame, settings: newSettings };
    }

    res.json({
      id: updatedGame.id,
      title: updatedGame.title,
      folderName: updatedGame.folderName,
      hasArtwork: updatedGame.hasArtwork,
      settings: updatedGame.settings,
    });
  } catch (error) {
    console.error('Error updating game:', error);
    res.status(500).json({ error: 'Failed to update game' });
  }
});

export default router;
