import { Router } from 'express';
import path from 'path';
import { unlink, rm, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { clearOwnedCartridges, getOwnedCartridges } from '../lib/owned-carts.js';
import { getLocalLabelsDbPath, hasLocalLabelsDb, getLabelsDbStatus } from '../lib/labels-db-core.js';

const router = Router();

const LOCAL_DIR = path.join(process.cwd(), '.local');
const USER_CARTS_PATH = path.join(LOCAL_DIR, 'user-carts.json');
const OWNED_CARTS_PATH = path.join(LOCAL_DIR, 'owned-carts.json');
const GAMES_DIR = path.join(LOCAL_DIR, 'Library', 'N64', 'Games');

// Helper to count files in a directory recursively
async function countFiles(dirPath: string): Promise<number> {
  if (!existsSync(dirPath)) return 0;

  let count = 0;
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += await countFiles(path.join(dirPath, entry.name));
    } else {
      count++;
    }
  }

  return count;
}

// Helper to get directory size
async function getDirSize(dirPath: string): Promise<number> {
  if (!existsSync(dirPath)) return 0;

  let size = 0;
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      size += await getDirSize(entryPath);
    } else {
      const stats = await stat(entryPath);
      size += stats.size;
    }
  }

  return size;
}

// GET /api/local-data/status - Get status of all local data
router.get('/status', async (_req, res) => {
  try {
    const status: {
      labels: { exists: boolean; entryCount?: number; fileSize?: number };
      ownedCarts: { exists: boolean; count: number };
      userCarts: { exists: boolean; count: number };
      gameData: { exists: boolean; folderCount: number; totalSize: number };
    } = {
      labels: { exists: false },
      ownedCarts: { exists: false, count: 0 },
      userCarts: { exists: false, count: 0 },
      gameData: { exists: false, folderCount: 0, totalSize: 0 },
    };

    // Labels database
    if (await hasLocalLabelsDb()) {
      const labelsStatus = await getLabelsDbStatus();
      if (labelsStatus) {
        status.labels = {
          exists: true,
          entryCount: labelsStatus.entryCount,
          fileSize: labelsStatus.fileSize,
        };
      }
    }

    // Owned carts
    if (existsSync(OWNED_CARTS_PATH)) {
      const owned = await getOwnedCartridges();
      status.ownedCarts = {
        exists: true,
        count: owned.length,
      };
    }

    // User carts
    if (existsSync(USER_CARTS_PATH)) {
      try {
        const { readFile } = await import('fs/promises');
        const data = JSON.parse(await readFile(USER_CARTS_PATH, 'utf-8'));
        status.userCarts = {
          exists: true,
          count: Array.isArray(data) ? data.length : 0,
        };
      } catch {
        status.userCarts = { exists: true, count: 0 };
      }
    }

    // Game data (settings + game_pak files)
    if (existsSync(GAMES_DIR)) {
      const folders = await readdir(GAMES_DIR);
      const gameFolders = [];

      for (const folder of folders) {
        const folderPath = path.join(GAMES_DIR, folder);
        const folderStat = await stat(folderPath);
        if (folderStat.isDirectory()) {
          gameFolders.push(folder);
        }
      }

      status.gameData = {
        exists: gameFolders.length > 0,
        folderCount: gameFolders.length,
        totalSize: await getDirSize(GAMES_DIR),
      };
    }

    res.json(status);
  } catch (error) {
    console.error('Error getting local data status:', error);
    res.status(500).json({ error: 'Failed to get local data status' });
  }
});

// DELETE /api/local-data/labels - Delete local labels.db
router.delete('/labels', async (_req, res) => {
  try {
    const labelsPath = getLocalLabelsDbPath();

    if (!existsSync(labelsPath)) {
      return res.status(404).json({ error: 'No local labels.db found' });
    }

    await unlink(labelsPath);
    console.log('Deleted local labels.db');

    res.json({
      success: true,
      message: 'Local labels.db deleted',
    });
  } catch (error) {
    console.error('Error deleting local labels.db:', error);
    res.status(500).json({ error: 'Failed to delete local labels.db' });
  }
});

// DELETE /api/local-data/owned-carts - Delete owned carts data
router.delete('/owned-carts', async (_req, res) => {
  try {
    if (!existsSync(OWNED_CARTS_PATH)) {
      return res.status(404).json({ error: 'No owned carts data found' });
    }

    const count = await clearOwnedCartridges();
    console.log(`Cleared ${count} owned cartridges`);

    res.json({
      success: true,
      message: `Cleared ${count} owned cartridges`,
      count,
    });
  } catch (error) {
    console.error('Error deleting owned carts:', error);
    res.status(500).json({ error: 'Failed to delete owned carts data' });
  }
});

// DELETE /api/local-data/user-carts - Delete user carts (custom names)
router.delete('/user-carts', async (_req, res) => {
  try {
    if (!existsSync(USER_CARTS_PATH)) {
      return res.status(404).json({ error: 'No user carts data found' });
    }

    await unlink(USER_CARTS_PATH);
    console.log('Deleted user carts data');

    res.json({
      success: true,
      message: 'User carts data deleted',
    });
  } catch (error) {
    console.error('Error deleting user carts:', error);
    res.status(500).json({ error: 'Failed to delete user carts data' });
  }
});

// DELETE /api/local-data/game-data - Delete all game settings and game_pak files
router.delete('/game-data', async (_req, res) => {
  try {
    if (!existsSync(GAMES_DIR)) {
      return res.status(404).json({ error: 'No game data found' });
    }

    const folders = await readdir(GAMES_DIR);
    let deletedCount = 0;

    for (const folder of folders) {
      const folderPath = path.join(GAMES_DIR, folder);
      const folderStat = await stat(folderPath);

      if (folderStat.isDirectory()) {
        await rm(folderPath, { recursive: true, force: true });
        deletedCount++;
      }
    }

    console.log(`Deleted ${deletedCount} game data folders`);

    res.json({
      success: true,
      message: `Deleted ${deletedCount} game data folders`,
      count: deletedCount,
    });
  } catch (error) {
    console.error('Error deleting game data:', error);
    res.status(500).json({ error: 'Failed to delete game data' });
  }
});

// DELETE /api/local-data/all - Delete all local data (full reset)
router.delete('/all', async (_req, res) => {
  try {
    const results: {
      labels: boolean;
      ownedCarts: boolean;
      userCarts: boolean;
      gameData: boolean;
    } = {
      labels: false,
      ownedCarts: false,
      userCarts: false,
      gameData: false,
    };

    // Delete labels.db
    const labelsPath = getLocalLabelsDbPath();
    if (existsSync(labelsPath)) {
      await unlink(labelsPath);
      results.labels = true;
    }

    // Clear owned carts
    if (existsSync(OWNED_CARTS_PATH)) {
      await clearOwnedCartridges();
      results.ownedCarts = true;
    }

    // Delete user carts
    if (existsSync(USER_CARTS_PATH)) {
      await unlink(USER_CARTS_PATH);
      results.userCarts = true;
    }

    // Delete game data
    if (existsSync(GAMES_DIR)) {
      await rm(GAMES_DIR, { recursive: true, force: true });
      results.gameData = true;
    }

    console.log('Deleted all local data:', results);

    res.json({
      success: true,
      message: 'All local data deleted',
      deleted: results,
    });
  } catch (error) {
    console.error('Error deleting all local data:', error);
    res.status(500).json({ error: 'Failed to delete all local data' });
  }
});

export default router;
