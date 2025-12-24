import { Router } from 'express';
import { readFile, readdir, access, constants } from 'fs/promises';
import path from 'path';

const router = Router();

interface CartEntry {
  id: string;
  name: string;
  official: boolean;
}

interface CartDatabase {
  version: number;
  generatedAt: string;
  source: string;
  totalEntries: number;
  namedEntries: number;
  carts: CartEntry[];
}

const CART_DB_PATH = path.join(process.cwd(), 'data', 'n64-carts.json');

async function getCartDatabase(): Promise<CartDatabase | null> {
  try {
    const data = await readFile(CART_DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// GET /api/cart-db/named - Get list of named carts only
router.get('/named', async (_req, res) => {
  try {
    const db = await getCartDatabase();

    if (!db) {
      return res.json({ carts: [] });
    }

    const named = db.carts.filter(c => c.name);
    res.json({ carts: named });
  } catch (error) {
    console.error('Error getting named carts:', error);
    res.status(500).json({ error: 'Failed to get named carts' });
  }
});

// GET /api/cart-db/unknown - Get "Unknown Cartridge" folders that haven't been named yet
router.get('/unknown', async (req, res) => {
  try {
    const sdCardPath = req.query.sdCardPath as string | undefined;

    // Determine the SD card path
    let basePath = sdCardPath;
    if (!basePath) {
      // Try sd-card-example as fallback
      const examplePath = path.join(process.cwd(), 'sd-card-example');
      try {
        await access(path.join(examplePath, 'Library', 'N64', 'Games'), constants.R_OK);
        basePath = examplePath;
      } catch {
        return res.json({ carts: [], count: 0, message: 'No SD card path provided' });
      }
    }

    // Load cart database to check for already-named carts
    const db = await getCartDatabase();
    const namedIds = new Set<string>();
    if (db) {
      for (const cart of db.carts) {
        if (cart.name) {
          namedIds.add(cart.id.toLowerCase());
        }
      }
    }

    const gamesPath = path.join(basePath, 'Library', 'N64', 'Games');
    const unknownCarts: Array<{ id: string; folderName: string }> = [];

    try {
      const folders = await readdir(gamesPath);

      for (const folder of folders) {
        // Match "Unknown Cartridge XXXXXXXX" pattern
        const match = folder.match(/^Unknown Cartridge\s+([0-9a-fA-F]{8})$/i);
        if (match) {
          const id = match[1].toLowerCase();
          // Skip if already named in cart database
          if (!namedIds.has(id)) {
            unknownCarts.push({
              id,
              folderName: folder,
            });
          }
        }
      }
    } catch {
      return res.json({ carts: [], count: 0, message: 'Could not read Games folder' });
    }

    res.json({ carts: unknownCarts, count: unknownCarts.length });
  } catch (error) {
    console.error('Error getting unknown carts:', error);
    res.status(500).json({ error: 'Failed to get unknown carts' });
  }
});

export default router;
