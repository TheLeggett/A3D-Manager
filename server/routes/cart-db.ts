import { Router } from 'express';
import { readFile, writeFile, readdir, access, constants } from 'fs/promises';
import path from 'path';

const router = Router();

// labels.db constants
const ID_TABLE_START = 0x100;
const ID_COUNT = 901;

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

async function extractCartIds(labelsPath: string): Promise<string[]> {
  const data = await readFile(labelsPath);

  const magic = data[0];
  const identifier = data.subarray(1, 12).toString('utf8');
  if (magic !== 0x07 || identifier !== 'Analogue-Co') {
    throw new Error('Invalid labels.db header');
  }

  const cartIds: string[] = [];
  for (let i = 0; i < ID_COUNT; i++) {
    const offset = ID_TABLE_START + i * 4;
    const cartId = data.readUInt32LE(offset);
    cartIds.push(cartId.toString(16).padStart(8, '0'));
  }

  return cartIds;
}

async function scanGamesFolder(gamesPath: string): Promise<Map<string, string>> {
  const idToName = new Map<string, string>();

  try {
    const folders = await readdir(gamesPath);

    for (const folder of folders) {
      if (folder.startsWith('.')) continue;
      if (folder.includes('Unknown Cartridge')) continue;

      const match = folder.match(/^(.+)\s+([0-9a-fA-F]{8})$/);
      if (match) {
        const title = match[1].trim();
        const hexId = match[2].toLowerCase();
        idToName.set(hexId, title);
      }
    }
  } catch {
    // Games folder not found
  }

  return idToName;
}

// GET /api/cart-db/status - Get cart database status
router.get('/status', async (req, res) => {
  try {
    const db = await getCartDatabase();

    if (!db) {
      return res.json({
        exists: false,
        message: 'Cart database not found. Generate it from an SD card.',
      });
    }

    res.json({
      exists: true,
      version: db.version,
      generatedAt: db.generatedAt,
      source: db.source,
      totalEntries: db.totalEntries,
      namedEntries: db.namedEntries,
      unnamedEntries: db.totalEntries - db.namedEntries,
    });
  } catch (error) {
    console.error('Error getting cart database status:', error);
    res.status(500).json({ error: 'Failed to get cart database status' });
  }
});

// POST /api/cart-db/generate - Generate cart database from SD card
router.post('/generate', async (req, res) => {
  try {
    const sdCardPath = req.query.sdCardPath as string | undefined;

    // Determine the SD card path
    let basePath = sdCardPath;
    if (!basePath) {
      // Try sd-card-example as fallback
      const examplePath = path.join(process.cwd(), 'sd-card-example');
      try {
        await access(path.join(examplePath, 'Library', 'N64', 'Images', 'labels.db'), constants.R_OK);
        basePath = examplePath;
      } catch {
        return res.status(404).json({
          error: 'No SD card path provided and no sd-card-example found',
        });
      }
    }

    const labelsPath = path.join(basePath, 'Library', 'N64', 'Images', 'labels.db');
    const gamesPath = path.join(basePath, 'Library', 'N64', 'Games');

    // Check if labels.db exists
    try {
      await access(labelsPath, constants.R_OK);
    } catch {
      return res.status(404).json({
        error: 'labels.db not found at the specified path',
      });
    }

    console.log(`Generating cart database from: ${basePath}`);

    // Extract cart IDs
    const cartIds = await extractCartIds(labelsPath);
    console.log(`  Extracted ${cartIds.length} cart IDs`);

    // Scan games folder for names
    const idToName = await scanGamesFolder(gamesPath);
    console.log(`  Found ${idToName.size} named games`);

    // Build the database
    const carts: CartEntry[] = cartIds.map(id => ({
      id,
      name: idToName.get(id) || '',
      official: true,
    }));

    const namedEntries = carts.filter(c => c.name).length;

    const database: CartDatabase = {
      version: 1,
      generatedAt: new Date().toISOString(),
      source: path.basename(basePath),
      totalEntries: carts.length,
      namedEntries,
      carts,
    };

    // Write to data directory
    await writeFile(CART_DB_PATH, JSON.stringify(database, null, 2));
    console.log(`  Wrote database with ${namedEntries} named entries`);

    res.json({
      success: true,
      totalEntries: carts.length,
      namedEntries,
      unnamedEntries: carts.length - namedEntries,
      source: path.basename(basePath),
    });
  } catch (error) {
    console.error('Error generating cart database:', error);
    res.status(500).json({ error: 'Failed to generate cart database' });
  }
});

// GET /api/cart-db/named - Get list of named carts only
router.get('/named', async (req, res) => {
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

// PUT /api/cart-db/:cartId - Update or add a cart's name
router.put('/:cartId', async (req, res) => {
  try {
    const { cartId } = req.params;
    const { name } = req.body;

    if (typeof name !== 'string') {
      return res.status(400).json({ error: 'Name must be a string' });
    }

    let db = await getCartDatabase();

    // Create database if it doesn't exist
    if (!db) {
      db = {
        version: 1,
        generatedAt: new Date().toISOString(),
        source: 'manual',
        totalEntries: 0,
        namedEntries: 0,
        carts: [],
      };
    }

    let cart = db.carts.find(c => c.id.toLowerCase() === cartId.toLowerCase());

    // Add new cart if it doesn't exist (for unknown/homebrew carts)
    if (!cart) {
      cart = {
        id: cartId.toLowerCase(),
        name: '',
        official: false,
      };
      db.carts.push(cart);
      db.totalEntries = db.carts.length;
      console.log(`Added new cart ${cartId} to database`);
    }

    // Update the name
    cart.name = name.trim();
    cart.official = false; // Mark as user-defined

    // Recalculate namedEntries
    db.namedEntries = db.carts.filter(c => c.name).length;

    // Write back
    await writeFile(CART_DB_PATH, JSON.stringify(db, null, 2));

    console.log(`Updated cart ${cartId} name to: ${cart.name}`);

    res.json({
      success: true,
      cartId,
      name: cart.name,
      namedEntries: db.namedEntries,
    });
  } catch (error) {
    console.error('Error updating cart name:', error);
    res.status(500).json({ error: 'Failed to update cart name' });
  }
});

export default router;
