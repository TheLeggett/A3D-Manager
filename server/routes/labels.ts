import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { access, constants, readFile } from 'fs/promises';
import {
  getAllEntries,
  getLocalLabel,
  getLocalIndex,
  hasLocalLabels,
  importAllLabels,
  importSingleLabel,
  updateLocalLabel,
  exportLabelsToSD,
  getLabelImageByHex,
} from '../lib/labels-db-core.js';

const router = Router();

// Cart database for names
interface CartDatabase {
  version: number;
  carts: Array<{ id: string; name: string; official: boolean }>;
}

let cartDatabase: CartDatabase | null = null;
let cartNameMap: Map<string, string> = new Map();
let cartDbLastLoaded: number = 0;

async function loadCartDatabase(): Promise<void> {
  // Reload if more than 5 seconds old (allows picking up regenerated database)
  const now = Date.now();
  if (cartDatabase && (now - cartDbLastLoaded) < 5000) return;

  try {
    const dbPath = path.join(process.cwd(), 'data', 'n64-carts.json');
    const data = await readFile(dbPath, 'utf-8');
    cartDatabase = JSON.parse(data);

    // Build name lookup map
    cartNameMap = new Map();
    for (const cart of cartDatabase!.carts) {
      if (cart.name) {
        cartNameMap.set(cart.id, cart.name);
      }
    }
    cartDbLastLoaded = Date.now();
    console.log(`Loaded cart database: ${cartDatabase!.carts.length} entries, ${cartNameMap.size} named`);
  } catch (err) {
    console.log('Cart database not found, names will not be available');
    cartDatabase = { version: 0, carts: [] };
    cartDbLastLoaded = Date.now();
  }
}

function getCartName(cartId: string): string {
  return cartNameMap.get(cartId.toLowerCase()) || '';
}

// Load cart database on startup
loadCartDatabase();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPEG, and WebP are allowed.'));
    }
  },
});

// Get labels.db path from SD card
async function getSDLabelsDbPath(sdCardPath?: string): Promise<string | null> {
  if (!sdCardPath) {
    // Try sd-card-example as fallback
    const examplePath = path.join(process.cwd(), 'sd-card-example', 'Library', 'N64', 'Images', 'labels.db');
    try {
      await access(examplePath, constants.R_OK);
      return examplePath;
    } catch {
      return null;
    }
  }

  const labelsPath = path.join(sdCardPath, 'Library', 'N64', 'Images', 'labels.db');
  try {
    await access(labelsPath, constants.R_OK);
    return labelsPath;
  } catch {
    return null;
  }
}

// GET /api/labels/status - Check if local labels are imported
router.get('/status', async (req, res) => {
  try {
    const hasLocal = await hasLocalLabels();
    const index = await getLocalIndex();

    res.json({
      imported: hasLocal,
      source: index?.sourceLabelsDb || null,
      importedAt: index?.importedAt || null,
      count: index?.entries.length || 0,
    });
  } catch (error) {
    console.error('Error checking labels status:', error);
    res.status(500).json({ error: 'Failed to check labels status' });
  }
});

// POST /api/labels/import-all - Import all labels from SD card
router.post('/import-all', async (req, res) => {
  try {
    const sdCardPath = req.query.sdCardPath as string | undefined;
    const labelsPath = await getSDLabelsDbPath(sdCardPath);

    if (!labelsPath) {
      return res.status(404).json({ error: 'labels.db not found on SD card' });
    }

    console.log(`Importing all labels from ${labelsPath}...`);
    const startTime = Date.now();

    const result = await importAllLabels(labelsPath, (current, total, cartId) => {
      // Log progress to console
      if (current % 100 === 0 || current === total) {
        console.log(`  Imported ${current}/${total} (${cartId})`);
      }
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Import complete: ${result.imported} labels in ${elapsed}s`);

    res.json({
      success: true,
      imported: result.imported,
      total: result.total,
      elapsed: `${elapsed}s`,
    });
  } catch (error) {
    console.error('Error importing labels:', error);
    res.status(500).json({ error: 'Failed to import labels' });
  }
});

// POST /api/labels/import/:cartId - Import single label from SD card (debug)
router.post('/import/:cartId', async (req, res) => {
  try {
    const sdCardPath = req.query.sdCardPath as string | undefined;
    const labelsPath = await getSDLabelsDbPath(sdCardPath);

    if (!labelsPath) {
      return res.status(404).json({ error: 'labels.db not found on SD card' });
    }

    const cartId = req.params.cartId;
    const result = await importSingleLabel(labelsPath, cartId);

    if (!result.success) {
      return res.status(404).json({ error: result.message });
    }

    res.json({ success: true, message: result.message });
  } catch (error) {
    console.error('Error importing single label:', error);
    res.status(500).json({ error: 'Failed to import label' });
  }
});

// POST /api/labels/export - Export local labels to SD card
router.post('/export', async (req, res) => {
  try {
    const sdCardPath = req.query.sdCardPath as string | undefined;
    const labelsPath = await getSDLabelsDbPath(sdCardPath);

    if (!labelsPath) {
      return res.status(404).json({ error: 'labels.db not found on SD card' });
    }

    console.log(`Exporting labels to ${labelsPath}...`);
    const startTime = Date.now();

    const result = await exportLabelsToSD(labelsPath, (current, total, cartId) => {
      if (current % 100 === 0 || current === total) {
        console.log(`  Exported ${current}/${total} (${cartId})`);
      }
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Export complete: ${result.exported} labels in ${elapsed}s`);

    res.json({
      success: true,
      exported: result.exported,
      total: result.total,
      elapsed: `${elapsed}s`,
    });
  } catch (error) {
    console.error('Error exporting labels:', error);
    res.status(500).json({ error: 'Failed to export labels' });
  }
});

// GET /api/labels - List all entries (from local index)
router.get('/', async (req, res) => {
  try {
    const index = await getLocalIndex();

    if (!index) {
      return res.json({
        imported: false,
        count: 0,
        entries: [],
        message: 'No labels imported. Use /api/labels/import-all to import from SD card.',
      });
    }

    res.json({
      imported: true,
      source: index.sourceLabelsDb,
      importedAt: index.importedAt,
      count: index.entries.length,
      entries: index.entries,
    });
  } catch (error) {
    console.error('Error listing labels:', error);
    res.status(500).json({ error: 'Failed to list labels' });
  }
});

// GET /api/labels/page/:page - Get paginated labels (from local)
router.get('/page/:page', async (req, res) => {
  try {
    await loadCartDatabase();
    const index = await getLocalIndex();

    if (!index) {
      return res.json({
        imported: false,
        page: 0,
        pageSize: 0,
        totalPages: 0,
        totalEntries: 0,
        entries: [],
      });
    }

    const page = parseInt(req.params.page) || 0;
    const pageSize = parseInt(req.query.pageSize as string) || 50;

    const start = page * pageSize;
    const end = Math.min(start + pageSize, index.entries.length);
    const pageEntries = index.entries.slice(start, end).map(e => ({
      ...e,
      name: getCartName(e.cartId),
    }));

    res.json({
      imported: true,
      page,
      pageSize,
      totalPages: Math.ceil(index.entries.length / pageSize),
      totalEntries: index.entries.length,
      entries: pageEntries,
    });
  } catch (error) {
    console.error('Error fetching page:', error);
    res.status(500).json({ error: 'Failed to fetch page' });
  }
});

// GET /api/labels/search/:query - Search for cart IDs or names (from local + cart db)
router.get('/search/:query', async (req, res) => {
  try {
    await loadCartDatabase();
    const index = await getLocalIndex();

    const query = req.params.query.toLowerCase();
    const seenIds = new Set<string>();
    const matches: Array<{ cartId: string; index: number; name: string }> = [];

    // Search labels index first
    if (index) {
      for (const e of index.entries) {
        const name = getCartName(e.cartId);
        if (
          e.cartId.toLowerCase().includes(query) ||
          name.toLowerCase().includes(query)
        ) {
          matches.push({ ...e, name });
          seenIds.add(e.cartId.toLowerCase());
        }
      }
    }

    // Also search cart database for user-added carts not in labels index
    if (cartDatabase) {
      for (const cart of cartDatabase.carts) {
        if (seenIds.has(cart.id.toLowerCase())) continue;
        if (
          cart.id.toLowerCase().includes(query) ||
          (cart.name && cart.name.toLowerCase().includes(query))
        ) {
          matches.push({
            cartId: cart.id,
            index: -1, // Not in labels.db
            name: cart.name || '',
          });
          seenIds.add(cart.id.toLowerCase());
        }
      }
    }

    res.json({
      imported: index !== null,
      query,
      count: matches.length,
      entries: matches.slice(0, 50),
    });
  } catch (error) {
    console.error('Error searching labels:', error);
    res.status(500).json({ error: 'Failed to search labels' });
  }
});

// GET /api/labels/sd/:cartId - Get label directly from SD card (bypass local cache)
router.get('/sd/:cartId', async (req, res) => {
  try {
    const sdCardPath = req.query.sdCardPath as string | undefined;
    const labelsPath = await getSDLabelsDbPath(sdCardPath);

    if (!labelsPath) {
      return res.status(404).json({ error: 'labels.db not found on SD card' });
    }

    const cartId = req.params.cartId;
    const pngBuffer = await getLabelImageByHex(labelsPath, cartId);

    if (!pngBuffer) {
      return res.status(404).json({ error: 'Label not found for this cart ID' });
    }

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache');
    res.send(pngBuffer);
  } catch (error) {
    console.error('Error fetching SD label:', error);
    res.status(500).json({ error: 'Failed to fetch label from SD' });
  }
});

// GET /api/labels/:cartId - Get a specific label image (from local)
router.get('/:cartId', async (req, res) => {
  try {
    const cartId = req.params.cartId;
    const pngBuffer = await getLocalLabel(cartId);

    if (!pngBuffer) {
      return res.status(404).json({
        error: 'Label not found locally',
        hint: 'Import labels first with /api/labels/import-all or import this specific label with /api/labels/import/:cartId',
      });
    }

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(pngBuffer);
  } catch (error) {
    console.error('Error fetching label:', error);
    res.status(500).json({ error: 'Failed to fetch label' });
  }
});

// PUT /api/labels/:cartId - Update a label image (saves to local)
router.put('/:cartId', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const cartId = req.params.cartId;

    // Update in local storage
    await updateLocalLabel(cartId, req.file.buffer);

    res.json({
      success: true,
      message: 'Label updated locally. Use export to write to SD card.',
    });
  } catch (error) {
    console.error('Error updating label:', error);
    res.status(500).json({ error: 'Failed to update label' });
  }
});

export default router;
