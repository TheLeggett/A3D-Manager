import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import {
  getLabelsDbStatus,
  getAllLocalLabelsDbEntries,
  getLabelsDbImage,
  getLabelsDbImageFromPath,
  searchLabelsDb,
  importLabelsDbFileFromBuffer,
  mergeLabelsDbFromBuffer,
  getLocalLabelsDbPath,
  addEntryToLabelsDb,
  deleteEntryFromLabelsDb,
  updateEntryInLabelsDb,
} from '../lib/labels-db-core.js';
import { getOwnedCartIds } from '../lib/owned-carts.js';
import { detectSDCards } from '../lib/sd-card.js';

const router = Router();

// Cart name database - enhanced format with metadata
interface CartNameEntry {
  id: string;
  gameCode: string;
  name: string;
  region: string;
  languages: string[];
  videoMode: 'NTSC' | 'PAL' | 'Unknown';
  releaseType: 'official' | 'beta' | 'proto' | 'demo' | 'unlicensed' | 'aftermarket' | 'unknown';
  revision: number | null;
}

let cartNames: CartNameEntry[] = [];
let cartNameMap: Map<string, CartNameEntry> = new Map();
let cartDbLastLoaded: number = 0;

// Available filter options (computed from database)
let filterOptions: {
  regions: string[];
  languages: string[];
  videoModes: string[];
} | null = null;

async function loadCartDatabase(): Promise<void> {
  const now = Date.now();
  if (cartNames.length > 0 && (now - cartDbLastLoaded) < 5000) return;

  try {
    const dbPath = path.join(process.cwd(), 'data', 'cart-names.json');
    const data = await readFile(dbPath, 'utf-8');
    cartNames = JSON.parse(data) as CartNameEntry[];

    cartNameMap = new Map();
    const regions = new Set<string>();
    const languages = new Set<string>();
    const videoModes = new Set<string>();

    for (const cart of cartNames) {
      cartNameMap.set(cart.id.toLowerCase(), cart);

      // Collect filter options
      if (cart.region && cart.region !== 'Unknown') {
        regions.add(cart.region);
      }
      for (const lang of cart.languages || []) {
        languages.add(lang);
      }
      if (cart.videoMode && cart.videoMode !== 'Unknown') {
        videoModes.add(cart.videoMode);
      }
    }

    filterOptions = {
      regions: [...regions].sort(),
      languages: [...languages].sort(),
      videoModes: [...videoModes].sort(),
    };

    cartDbLastLoaded = Date.now();
    console.log(`Loaded cart name database: ${cartNames.length} entries`);
  } catch (err) {
    console.log('Cart name database not found, names will not be available');
    cartNames = [];
    filterOptions = null;
    cartDbLastLoaded = Date.now();
  }
}

function getCartName(cartId: string): string {
  // First check internal database
  const entry = cartNameMap.get(cartId.toLowerCase());
  if (entry?.name) return entry.name;

  // Then check user carts
  const userEntry = userCarts.get(cartId.toLowerCase());
  return userEntry?.name || '';
}

function getCartMetadata(cartId: string): Partial<CartNameEntry> {
  const entry = cartNameMap.get(cartId.toLowerCase());
  if (!entry) return {};
  return {
    region: entry.region,
    languages: entry.languages,
    videoMode: entry.videoMode,
    releaseType: entry.releaseType,
    revision: entry.revision,
  };
}

// Load cart database on startup
loadCartDatabase();

// User cart database - custom names for carts not in the internal database
interface UserCartEntry {
  id: string;
  name: string;
  addedAt: string;
}

let userCarts: Map<string, UserCartEntry> = new Map();
const USER_CARTS_PATH = path.join(process.cwd(), '.local', 'user-carts.json');

async function loadUserCarts(): Promise<void> {
  try {
    const data = await readFile(USER_CARTS_PATH, 'utf-8');
    const entries = JSON.parse(data) as UserCartEntry[];
    userCarts = new Map(entries.map(e => [e.id.toLowerCase(), e]));
    console.log(`Loaded ${userCarts.size} user cart entries`);
  } catch {
    // File doesn't exist yet, start with empty map
    userCarts = new Map();
  }
}

async function saveUserCarts(): Promise<void> {
  const entries = Array.from(userCarts.values());
  await mkdir(path.dirname(USER_CARTS_PATH), { recursive: true });
  await writeFile(USER_CARTS_PATH, JSON.stringify(entries, null, 2));
}

async function addUserCart(id: string, name: string): Promise<UserCartEntry> {
  const entry: UserCartEntry = {
    id: id.toLowerCase(),
    name,
    addedAt: new Date().toISOString(),
  };
  userCarts.set(entry.id, entry);
  await saveUserCarts();
  return entry;
}

async function deleteUserCart(id: string): Promise<boolean> {
  const deleted = userCarts.delete(id.toLowerCase());
  if (deleted) {
    await saveUserCarts();
  }
  return deleted;
}

// Load user carts on startup
loadUserCarts();

// Configure multer for file uploads
const uploadDb = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max for labels.db
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.db')) {
      cb(null, true);
    } else {
      cb(new Error('Only .db files are allowed'));
    }
  },
});

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max for images
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPEG, and WebP images are allowed'));
    }
  },
});

// GET /api/labels/status - Check if local labels.db exists
router.get('/status', async (_req, res) => {
  try {
    const status = await getLabelsDbStatus();

    if (!status) {
      return res.json({
        imported: false,
        message: 'No labels.db imported.',
      });
    }

    res.json({
      imported: true,
      entryCount: status.entryCount,
      fileSize: status.fileSize,
      fileSizeMB: (status.fileSize / 1024 / 1024).toFixed(2),
    });
  } catch (error) {
    console.error('Error checking labels status:', error);
    res.status(500).json({ error: 'Failed to check labels status' });
  }
});

// POST /api/labels/import - Import labels.db file via upload
router.post('/import', uploadDb.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const mode = req.body.mode || 'replace';
    console.log(`Importing labels.db (${(req.file.size / 1024 / 1024).toFixed(2)} MB) with mode: ${mode}...`);

    let entryCount: number;
    let fileSize: number;
    let importedAt: string;
    let added: number | undefined;
    let updated: number | undefined;
    let skipped: number | undefined;

    if (mode === 'replace') {
      // Simple replacement - use existing function
      const result = await importLabelsDbFileFromBuffer(req.file.buffer);
      entryCount = result.entryCount;
      fileSize = result.fileSize;
      importedAt = result.importedAt;
    } else {
      // Merge modes - need to combine databases
      const result = await mergeLabelsDbFromBuffer(req.file.buffer, mode as 'merge-overwrite' | 'merge-skip');
      entryCount = result.entryCount;
      fileSize = result.fileSize;
      importedAt = result.importedAt;
      added = result.added;
      updated = result.updated;
      skipped = result.skipped;
    }

    // Invalidate sorted cache after import
    invalidateSortedCache();

    console.log(`Import complete: ${entryCount} entries`);

    res.json({
      success: true,
      entryCount,
      fileSize,
      fileSizeMB: (fileSize / 1024 / 1024).toFixed(2),
      importedAt,
      ...(added !== undefined && { added }),
      ...(updated !== undefined && { updated }),
      ...(skipped !== undefined && { skipped }),
    });
  } catch (error) {
    console.error('Error importing labels.db:', error);
    res.status(500).json({ error: 'Failed to import labels.db' });
  }
});

// Enhanced entry with metadata
interface EnhancedEntry {
  cartId: string;
  index: number;
  name: string;
  region?: string;
  languages?: string[];
  videoMode?: 'NTSC' | 'PAL' | 'Unknown';
  releaseType?: string;
  revision?: number | null;
}

// Cache for sorted entries (invalidated on import/add/delete)
let sortedEntriesCache: EnhancedEntry[] | null = null;

function invalidateSortedCache() {
  sortedEntriesCache = null;
}

async function getSortedEntries(): Promise<EnhancedEntry[] | null> {
  if (sortedEntriesCache) return sortedEntriesCache;

  const allEntries = await getAllLocalLabelsDbEntries();
  if (!allEntries) return null;

  // Add names and metadata, sort alphabetically (named first, then unnamed by ID)
  const withNames: EnhancedEntry[] = allEntries.map(e => {
    const meta = getCartMetadata(e.cartId);
    return {
      ...e,
      name: getCartName(e.cartId),
      region: meta.region,
      languages: meta.languages,
      videoMode: meta.videoMode,
      releaseType: meta.releaseType,
      revision: meta.revision,
    };
  });

  withNames.sort((a, b) => {
    // Both have names: sort alphabetically
    if (a.name && b.name) {
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    }
    // Only a has name: a comes first
    if (a.name && !b.name) return -1;
    // Only b has name: b comes first
    if (!a.name && b.name) return 1;
    // Neither has name: sort by cart ID
    return a.cartId.localeCompare(b.cartId);
  });

  sortedEntriesCache = withNames;
  return withNames;
}

// Filter entries based on query parameters
function applyFilters(
  entries: EnhancedEntry[],
  filters: {
    region?: string;
    language?: string;
    videoMode?: string;
    search?: string;
    ownedIds?: Set<string>;
  }
): EnhancedEntry[] {
  return entries.filter(entry => {
    // If any metadata filter is set, we only show entries that have metadata
    const hasMetadataFilters = filters.region || filters.language || filters.videoMode;

    // Owned filter - only show owned cartridges
    if (filters.ownedIds) {
      if (!filters.ownedIds.has(entry.cartId.toLowerCase())) return false;
    }

    // Search filter - matches name or cart ID
    if (filters.search) {
      const query = filters.search.toLowerCase();
      const nameMatch = entry.name?.toLowerCase().includes(query);
      const idMatch = entry.cartId.toLowerCase().includes(query);
      if (!nameMatch && !idMatch) return false;
    }

    if (filters.region) {
      if (!entry.region || entry.region !== filters.region) return false;
    }

    if (filters.language) {
      if (!entry.languages || !entry.languages.includes(filters.language)) return false;
    }

    if (filters.videoMode) {
      if (!entry.videoMode || entry.videoMode !== filters.videoMode) return false;
    }

    // If metadata filters are active but entry has no metadata, exclude it
    if (hasMetadataFilters && !entry.region && !entry.videoMode) {
      return false;
    }

    return true;
  });
}

// GET /api/labels/filter-options - Get available filter options
router.get('/filter-options', async (_req, res) => {
  try {
    await loadCartDatabase();

    res.json({
      regions: filterOptions?.regions || [],
      languages: filterOptions?.languages || [],
      videoModes: filterOptions?.videoModes || [],
    });
  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({ error: 'Failed to fetch filter options' });
  }
});

// GET /api/labels/lookup/:cartId - Look up cart ID in databases
router.get('/lookup/:cartId', async (req, res) => {
  try {
    await loadCartDatabase();
    await loadUserCarts();

    const cartId = req.params.cartId.toLowerCase();

    // Validate cart ID format
    if (!/^[0-9a-f]{8}$/.test(cartId)) {
      return res.status(400).json({ error: 'Invalid cart ID. Must be 8 hex characters.' });
    }

    // Check internal database first
    const internalEntry = cartNameMap.get(cartId);
    if (internalEntry) {
      return res.json({
        found: true,
        source: 'internal',
        cartId,
        name: internalEntry.name,
        region: internalEntry.region,
        languages: internalEntry.languages,
        videoMode: internalEntry.videoMode,
        gameCode: internalEntry.gameCode,
      });
    }

    // Check user carts
    const userEntry = userCarts.get(cartId);
    if (userEntry) {
      return res.json({
        found: true,
        source: 'user',
        cartId,
        name: userEntry.name,
      });
    }

    // Not found
    res.json({
      found: false,
      cartId,
    });
  } catch (error) {
    console.error('Error looking up cart:', error);
    res.status(500).json({ error: 'Failed to look up cart' });
  }
});

// POST /api/labels/user-cart/:cartId - Add or update a user cart entry
router.post('/user-cart/:cartId', async (req, res) => {
  try {
    const cartId = req.params.cartId.toLowerCase();
    const { name } = req.body;

    // Validate cart ID format
    if (!/^[0-9a-f]{8}$/.test(cartId)) {
      return res.status(400).json({ error: 'Invalid cart ID. Must be 8 hex characters.' });
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Don't allow overriding internal database entries
    await loadCartDatabase();
    if (cartNameMap.has(cartId)) {
      return res.status(400).json({
        error: 'This cart ID exists in the internal database and cannot be overridden'
      });
    }

    const entry = await addUserCart(cartId, name.trim());

    // Invalidate sorted cache since names changed
    invalidateSortedCache();

    res.json({
      success: true,
      entry,
    });
  } catch (error) {
    console.error('Error adding user cart:', error);
    res.status(500).json({ error: 'Failed to add user cart' });
  }
});

// DELETE /api/labels/user-cart/:cartId - Delete a user cart entry
router.delete('/user-cart/:cartId', async (req, res) => {
  try {
    const cartId = req.params.cartId.toLowerCase();

    // Validate cart ID format
    if (!/^[0-9a-f]{8}$/.test(cartId)) {
      return res.status(400).json({ error: 'Invalid cart ID. Must be 8 hex characters.' });
    }

    const deleted = await deleteUserCart(cartId);

    if (!deleted) {
      return res.status(404).json({ error: 'User cart entry not found' });
    }

    // Invalidate sorted cache since names changed
    invalidateSortedCache();

    res.json({
      success: true,
      message: 'User cart entry deleted',
    });
  } catch (error) {
    console.error('Error deleting user cart:', error);
    res.status(500).json({ error: 'Failed to delete user cart' });
  }
});

// GET /api/labels/user-carts - List all user cart entries
router.get('/user-carts', async (_req, res) => {
  try {
    await loadUserCarts();
    const entries = Array.from(userCarts.values());
    res.json({
      count: entries.length,
      entries,
    });
  } catch (error) {
    console.error('Error fetching user carts:', error);
    res.status(500).json({ error: 'Failed to fetch user carts' });
  }
});

// GET /api/labels/page/:page - Get paginated labels (sorted alphabetically)
router.get('/page/:page', async (req, res) => {
  try {
    await loadCartDatabase();

    const page = parseInt(req.params.page) || 0;
    const pageSize = parseInt(req.query.pageSize as string) || 50;

    // Get filter parameters
    const region = req.query.region as string | undefined;
    const language = req.query.language as string | undefined;
    const videoMode = req.query.videoMode as string | undefined;
    const search = req.query.search as string | undefined;
    const owned = req.query.owned === 'true';

    const sortedEntries = await getSortedEntries();

    if (!sortedEntries) {
      return res.json({
        imported: false,
        message: 'No labels.db imported.',
      });
    }

    // Get owned IDs if filtering by owned
    let ownedIds: Set<string> | undefined;
    if (owned) {
      const ids = await getOwnedCartIds();
      ownedIds = new Set(ids.map(id => id.toLowerCase()));
    }

    // Apply filters if any are set
    const filteredEntries = applyFilters(sortedEntries, { region, language, videoMode, search, ownedIds });

    const totalEntries = filteredEntries.length;
    const totalPages = Math.ceil(totalEntries / pageSize);
    const start = page * pageSize;
    const end = Math.min(start + pageSize, totalEntries);
    const entries = filteredEntries.slice(start, end);

    res.json({
      imported: true,
      page,
      pageSize,
      totalPages,
      totalEntries,
      totalUnfiltered: sortedEntries.length,
      filters: { region, language, videoMode, owned },
      entries,
    });
  } catch (error) {
    console.error('Error fetching page:', error);
    res.status(500).json({ error: 'Failed to fetch page' });
  }
});

// GET /api/labels/search/:query - Search labels by cart ID or game name
router.get('/search/:query', async (req, res) => {
  try {
    await loadCartDatabase();
    await loadUserCarts();

    const query = req.params.query.toLowerCase();
    const dbMatches = await searchLabelsDb(query);

    // Add names from cart database
    const matches = dbMatches.map(e => ({
      ...e,
      name: getCartName(e.cartId),
    }));

    // Also search cart names database for name matches
    const seenIds = new Set(matches.map(m => m.cartId.toLowerCase()));
    for (const cart of cartNames) {
      if (seenIds.has(cart.id.toLowerCase())) continue;
      if (
        cart.id.toLowerCase().includes(query) ||
        cart.name.toLowerCase().includes(query) ||
        cart.gameCode.toLowerCase().includes(query)
      ) {
        matches.push({
          cartId: cart.id,
          index: -1,
          name: cart.name,
        });
      }
    }

    // Also search user carts database
    for (const [id, userCart] of userCarts) {
      if (seenIds.has(id)) continue;
      if (
        id.includes(query) ||
        userCart.name.toLowerCase().includes(query)
      ) {
        seenIds.add(id);
        matches.push({
          cartId: id,
          index: -1,
          name: userCart.name,
        });
      }
    }

    res.json({
      query: req.params.query,
      count: matches.length,
      entries: matches.slice(0, 100),
    });
  } catch (error) {
    console.error('Error searching:', error);
    res.status(500).json({ error: 'Failed to search' });
  }
});

// GET /api/labels/export - Download the labels.db file
router.get('/export', async (_req, res) => {
  try {
    const labelsDbPath = getLocalLabelsDbPath();
    const data = await readFile(labelsDbPath);

    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', 'attachment; filename="labels.db"');
    res.set('Content-Length', data.length.toString());
    res.send(data);
  } catch (error) {
    console.error('Error exporting labels.db:', error);
    res.status(500).json({ error: 'Failed to export labels.db' });
  }
});

// POST /api/labels/reset - Delete local labels.db and start fresh
router.post('/reset', async (_req, res) => {
  try {
    const labelsDbPath = getLocalLabelsDbPath();

    await unlink(labelsDbPath);

    // Invalidate sorted cache after reset
    invalidateSortedCache();

    console.log('Labels database reset');

    res.json({ success: true, message: 'Labels database deleted' });
  } catch (error) {
    console.error('Error resetting labels.db:', error);
    res.status(500).json({ error: 'Failed to reset labels.db' });
  }
});

// POST /api/labels/add/:cartId - Add a new cartridge with label
router.post('/add/:cartId', uploadImage.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const cartId = req.params.cartId.toLowerCase();

    // Validate cart ID format (8 hex characters)
    if (!/^[0-9a-f]{8}$/.test(cartId)) {
      return res.status(400).json({ error: 'Invalid cart ID. Must be 8 hex characters.' });
    }

    const cartIdNum = parseInt(cartId, 16);

    console.log(`Adding cartridge ${cartId}...`);

    await addEntryToLabelsDb(cartIdNum, req.file.buffer);

    // Invalidate sorted cache after adding
    invalidateSortedCache();

    // Look up cart name from static database
    const knownName = getCartName(cartId);

    console.log(`Cartridge ${cartId} added successfully${knownName ? ` (${knownName})` : ''}`);

    res.json({
      success: true,
      cartId,
      message: 'Cartridge added successfully',
    });
  } catch (error: unknown) {
    console.error('Error adding cartridge:', error);
    const message = error instanceof Error ? error.message : 'Failed to add cartridge';
    res.status(500).json({ error: message });
  }
});

// PUT /api/labels/:cartId - Update a cartridge label
router.put('/:cartId', uploadImage.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const cartId = req.params.cartId.toLowerCase();

    // Validate cart ID format (8 hex characters)
    if (!/^[0-9a-f]{8}$/.test(cartId)) {
      return res.status(400).json({ error: 'Invalid cart ID. Must be 8 hex characters.' });
    }

    const cartIdNum = parseInt(cartId, 16);

    console.log(`Updating label for cartridge ${cartId}...`);

    await updateEntryInLabelsDb(cartIdNum, req.file.buffer);

    console.log(`Label for cartridge ${cartId} updated successfully`);

    res.json({
      success: true,
      cartId,
      message: 'Label updated successfully',
    });
  } catch (error: unknown) {
    console.error('Error updating label:', error);
    const message = error instanceof Error ? error.message : 'Failed to update label';
    res.status(500).json({ error: message });
  }
});

// GET /api/labels/:cartId - Get label image
router.get('/:cartId', async (req, res) => {
  try {
    const cartId = req.params.cartId;
    let pngBuffer: Buffer | null = null;

    // Check if we should read from SD card only
    const readFromSD = process.env.READ_LABELS_FROM_SD === 'true';

    if (readFromSD) {
      // Only read from SD card, no fallback to local
      const sdCards = await detectSDCards();
      if (sdCards.length > 0) {
        pngBuffer = await getLabelsDbImageFromPath(sdCards[0].labelsDbPath, cartId);
      }
    } else {
      // Read from local labels.db
      pngBuffer = await getLabelsDbImage(cartId);
    }

    if (!pngBuffer) {
      return res.status(404).json({ error: 'Label not found' });
    }

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(pngBuffer);
  } catch (error) {
    console.error('Error fetching label:', error);
    res.status(500).json({ error: 'Failed to fetch label' });
  }
});

// DELETE /api/labels/:cartId - Delete a cartridge label
router.delete('/:cartId', async (req, res) => {
  try {
    const cartId = req.params.cartId.toLowerCase();

    // Validate cart ID format (8 hex characters)
    if (!/^[0-9a-f]{8}$/.test(cartId)) {
      return res.status(400).json({ error: 'Invalid cart ID. Must be 8 hex characters.' });
    }

    const cartIdNum = parseInt(cartId, 16);

    console.log(`Deleting cartridge ${cartId}...`);

    await deleteEntryFromLabelsDb(cartIdNum);

    // Invalidate sorted cache after deleting
    invalidateSortedCache();

    console.log(`Cartridge ${cartId} deleted successfully`);

    res.json({
      success: true,
      cartId,
      message: 'Cartridge deleted successfully',
    });
  } catch (error: unknown) {
    console.error('Error deleting cartridge:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete cartridge';
    res.status(500).json({ error: message });
  }
});

export default router;
