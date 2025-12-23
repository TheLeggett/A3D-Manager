import { Router } from 'express';
import path from 'path';
import { detectSDCards, isValidAnalogueDir } from '../lib/sd-card.js';
import { readGames, syncGames } from '../lib/analogue-db.js';
import { cp, mkdir, readdir, rename, readFile, writeFile, access, constants } from 'fs/promises';
import {
  exportLabelsToSD,
  getLocalIndex,
  hasLocalLabels,
  parseLabelsDbFile,
  getLocalLabelsList,
} from '../lib/labels-db-core.js';

const router = Router();

// Get local paths
const getLocalDir = () => path.join(process.cwd(), '.local');
const getLocalGamesDir = () => path.join(getLocalDir(), 'Library', 'N64', 'Games');

// GET /api/sd-cards - Detect connected SD cards
router.get('/sd-cards', async (req, res) => {
  try {
    const sdCards = await detectSDCards();
    res.json(sdCards);
  } catch (error) {
    console.error('Error detecting SD cards:', error);
    res.status(500).json({ error: 'Failed to detect SD cards' });
  }
});

// POST /api/sync/import - Import from SD card to local
router.post('/import', async (req, res) => {
  try {
    const { sdCardPath } = req.body;

    if (!sdCardPath) {
      return res.status(400).json({ error: 'SD card path required' });
    }

    if (!(await isValidAnalogueDir(sdCardPath))) {
      return res.status(400).json({ error: 'Invalid Analogue 3D SD card' });
    }

    const sourceGamesDir = path.join(sdCardPath, 'Library', 'N64', 'Games');
    const localGamesDir = getLocalGamesDir();

    // Ensure local directory exists
    await mkdir(localGamesDir, { recursive: true });

    // Copy games from SD card to local
    const result = await syncGames(sourceGamesDir, localGamesDir);

    res.json({
      success: true,
      synced: result.synced,
      errors: result.errors,
      message: `Imported ${result.synced.length} games from SD card`,
    });
  } catch (error) {
    console.error('Error importing from SD card:', error);
    res.status(500).json({ error: 'Failed to import from SD card' });
  }
});

// POST /api/sync/export - Export from local to SD card
router.post('/export', async (req, res) => {
  try {
    const { sdCardPath } = req.body;

    if (!sdCardPath) {
      return res.status(400).json({ error: 'SD card path required' });
    }

    if (!(await isValidAnalogueDir(sdCardPath))) {
      return res.status(400).json({ error: 'Invalid Analogue 3D SD card' });
    }

    const localGamesDir = getLocalGamesDir();
    const destGamesDir = path.join(sdCardPath, 'Library', 'N64', 'Games');

    // Copy games from local to SD card
    const result = await syncGames(localGamesDir, destGamesDir);

    res.json({
      success: true,
      synced: result.synced,
      errors: result.errors,
      message: `Exported ${result.synced.length} games to SD card`,
    });
  } catch (error) {
    console.error('Error exporting to SD card:', error);
    res.status(500).json({ error: 'Failed to export to SD card' });
  }
});

// GET /api/sync/diff - Compare local vs SD card
router.get('/diff', async (req, res) => {
  try {
    const sdCardPath = req.query.sdCardPath as string;

    if (!sdCardPath) {
      return res.status(400).json({ error: 'SD card path required' });
    }

    if (!(await isValidAnalogueDir(sdCardPath))) {
      return res.status(400).json({ error: 'Invalid Analogue 3D SD card' });
    }

    const localGamesDir = getLocalGamesDir();
    const sdGamesDir = path.join(sdCardPath, 'Library', 'N64', 'Games');

    const localGames = await readGames(localGamesDir);
    const sdGames = await readGames(sdGamesDir);

    // Create maps for comparison
    const localMap = new Map(localGames.map((g) => [g.id, g]));
    const sdMap = new Map(sdGames.map((g) => [g.id, g]));

    const diff = {
      onlyLocal: [] as { id: string; title: string }[],
      onlySD: [] as { id: string; title: string }[],
      modified: [] as { id: string; localTitle: string; sdTitle: string }[],
      same: [] as { id: string; title: string }[],
    };

    // Find games only in local
    for (const [id, game] of localMap) {
      if (!sdMap.has(id)) {
        diff.onlyLocal.push({ id, title: game.title });
      } else {
        const sdGame = sdMap.get(id)!;
        if (game.title !== sdGame.title) {
          diff.modified.push({
            id,
            localTitle: game.title,
            sdTitle: sdGame.title,
          });
        } else {
          diff.same.push({ id, title: game.title });
        }
      }
    }

    // Find games only on SD
    for (const [id, game] of sdMap) {
      if (!localMap.has(id)) {
        diff.onlySD.push({ id, title: game.title });
      }
    }

    res.json(diff);
  } catch (error) {
    console.error('Error comparing:', error);
    res.status(500).json({ error: 'Failed to compare' });
  }
});

// ============================================
// Full Sync to SD Card
// ============================================

const CART_DB_PATH = path.join(process.cwd(), 'data', 'n64-carts.json');

interface CartDatabase {
  version: number;
  carts: Array<{ id: string; name: string; official: boolean }>;
}

async function getCartDatabase(): Promise<CartDatabase | null> {
  try {
    const data = await readFile(CART_DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

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

    const gamesPath = path.join(sdCardPath, 'Library', 'N64', 'Games');
    const labelsPath = path.join(sdCardPath, 'Library', 'N64', 'Images', 'labels.db');

    // Get cart database with user-defined names
    const cartDb = await getCartDatabase();
    const nameMap = new Map<string, string>();
    if (cartDb) {
      for (const cart of cartDb.carts) {
        if (cart.name) {
          nameMap.set(cart.id.toLowerCase(), cart.name);
        }
      }
    }

    // Find folders that need renaming or settings.json updates
    const folderRenames: Array<{ from: string; to: string; cartId: string }> = [];
    const settingsUpdates: Array<{ folder: string; cartId: string; from: string; to: string }> = [];

    try {
      const folders = await readdir(gamesPath);

      for (const folder of folders) {
        // Check for "Unknown Cartridge XXXXXXXX" - needs full rename
        const unknownMatch = folder.match(/^Unknown Cartridge\s+([0-9a-fA-F]{8})$/i);
        if (unknownMatch) {
          const cartId = unknownMatch[1].toLowerCase();
          const newName = nameMap.get(cartId);
          if (newName) {
            folderRenames.push({
              from: folder,
              to: `${newName} ${cartId}`,
              cartId,
            });
          }
          continue;
        }

        // Check for "GameName XXXXXXXX" - may need settings.json update if title is still "Unknown Cartridge"
        const namedMatch = folder.match(/^(.+)\s+([0-9a-fA-F]{8})$/);
        if (namedMatch) {
          const cartId = namedMatch[2].toLowerCase();
          const expectedName = nameMap.get(cartId);

          if (expectedName) {
            const folderPath = path.join(gamesPath, folder);
            const settingsPath = path.join(folderPath, 'settings.json');

            try {
              const settingsData = await readFile(settingsPath, 'utf-8');
              const settings = JSON.parse(settingsData.replace(/,(\s*[}\]])/g, '$1'));

              // Only update if title is "Unknown Cartridge" - don't overwrite good titles
              if (settings.title === 'Unknown Cartridge') {
                settingsUpdates.push({
                  folder,
                  cartId,
                  from: settings.title,
                  to: expectedName,
                });
              }
            } catch {
              // Skip if can't read settings
            }
          }
        }
      }
    } catch {
      // Games folder may not exist
    }

    // Check labels status
    const hasLabels = await hasLocalLabels();
    const localIndex = await getLocalIndex();
    let labelsDbExists = false;
    let newCartsToAdd: string[] = [];

    try {
      await access(labelsPath, constants.R_OK);
      labelsDbExists = true;

      // Check for local labels that aren't in labels.db
      const db = await parseLabelsDbFile(labelsPath);
      const localLabelFiles = await getLocalLabelsList();

      for (const cartIdHex of localLabelFiles) {
        const cartId = parseInt(cartIdHex, 16);
        if (!db.idToIndex.has(cartId)) {
          newCartsToAdd.push(cartIdHex);
        }
      }
    } catch {
      // labels.db doesn't exist
    }

    res.json({
      folderRenames,
      settingsUpdates,
      labels: {
        hasLocalLabels: hasLabels,
        localLabelCount: localIndex?.entries.length || 0,
        labelsDbExists,
        newCartsToAdd,
      },
    });
  } catch (error) {
    console.error('Error previewing sync:', error);
    res.status(500).json({ error: 'Failed to preview sync' });
  }
});

// POST /api/sync/full/apply - Apply full sync to SD card
router.post('/full/apply', async (req, res) => {
  try {
    const { sdCardPath } = req.body;

    if (!sdCardPath) {
      return res.status(400).json({ error: 'SD card path required' });
    }

    if (!(await isValidAnalogueDir(sdCardPath))) {
      return res.status(400).json({ error: 'Invalid Analogue 3D SD card' });
    }

    const gamesPath = path.join(sdCardPath, 'Library', 'N64', 'Games');
    const labelsPath = path.join(sdCardPath, 'Library', 'N64', 'Images', 'labels.db');

    const results = {
      folderRenames: { success: 0, failed: 0, skipped: 0, errors: [] as string[], details: [] as string[] },
      labels: { success: false, exported: 0, added: 0, error: null as string | null },
    };

    // Step 1: Rename folders and update settings.json
    const cartDb = await getCartDatabase();
    const nameMap = new Map<string, string>();
    if (cartDb) {
      for (const cart of cartDb.carts) {
        if (cart.name) {
          nameMap.set(cart.id.toLowerCase(), cart.name);
        }
      }
    }
    console.log(`Cart database loaded with ${nameMap.size} named carts`);

    try {
      const folders = await readdir(gamesPath);
      console.log(`Found ${folders.length} folders in ${gamesPath}`);

      for (const folder of folders) {
        // Match "Unknown Cartridge XXXXXXXX" pattern - needs rename + settings update
        const unknownMatch = folder.match(/^Unknown Cartridge\s+([0-9a-fA-F]{8})$/i);
        if (unknownMatch) {
          const cartId = unknownMatch[1].toLowerCase();
          const newName = nameMap.get(cartId);
          console.log(`Found Unknown Cartridge ${cartId}, mapped name: ${newName || '(none)'}`);

          if (newName) {
            const oldPath = path.join(gamesPath, folder);
            const newPath = path.join(gamesPath, `${newName} ${cartId}`);

            try {
              // Update settings.json with new title first
              const settingsPath = path.join(oldPath, 'settings.json');
              try {
                const settingsData = await readFile(settingsPath, 'utf-8');
                // Handle potential JSON issues (trailing commas, etc.)
                const settings = JSON.parse(settingsData.replace(/,(\s*[}\]])/g, '$1'));
                settings.title = newName;
                await writeFile(settingsPath, JSON.stringify(settings, null, 2));
                console.log(`Updated settings.json title to: ${newName}`);
                results.folderRenames.details.push(`Updated ${cartId} settings.json title to "${newName}"`);
              } catch (settingsErr) {
                const errMsg = `Could not update settings.json for ${folder}: ${settingsErr}`;
                console.warn(errMsg);
                results.folderRenames.errors.push(errMsg);
              }

              // Then rename the folder
              await rename(oldPath, newPath);
              results.folderRenames.success++;
              results.folderRenames.details.push(`Renamed folder: ${folder} -> ${newName} ${cartId}`);
              console.log(`Renamed: ${folder} -> ${newName} ${cartId}`);
            } catch (err) {
              results.folderRenames.failed++;
              results.folderRenames.errors.push(`Failed to process ${folder}: ${err}`);
              console.error(`Failed to process ${folder}:`, err);
            }
          } else {
            results.folderRenames.skipped++;
            console.log(`Skipped ${folder} - no name mapping found`);
          }
          continue;
        }

        // Match "GameName XXXXXXXX" pattern - may need settings.json update only if title is "Unknown Cartridge"
        const namedMatch = folder.match(/^(.+)\s+([0-9a-fA-F]{8})$/);
        if (namedMatch) {
          const cartId = namedMatch[2].toLowerCase();
          const expectedName = nameMap.get(cartId);

          // Check if we have a name for this cart and settings.json needs updating
          if (expectedName) {
            const folderPath = path.join(gamesPath, folder);
            const settingsPath = path.join(folderPath, 'settings.json');

            try {
              const settingsData = await readFile(settingsPath, 'utf-8');
              const settings = JSON.parse(settingsData.replace(/,(\s*[}\]])/g, '$1'));

              // Only update if title is "Unknown Cartridge" - don't overwrite good titles
              if (settings.title === 'Unknown Cartridge') {
                const oldTitle = settings.title;
                settings.title = expectedName;
                await writeFile(settingsPath, JSON.stringify(settings, null, 2));
                console.log(`Updated ${folder} settings.json title from "${oldTitle}" to "${expectedName}"`);
                results.folderRenames.details.push(`Updated ${cartId} settings.json title from "${oldTitle}" to "${expectedName}"`);
                results.folderRenames.success++;
              }
            } catch (settingsErr) {
              // Silently skip if settings.json doesn't exist or can't be read
              console.log(`Could not check/update settings.json for ${folder}: ${settingsErr}`);
            }
          }
        }
      }
    } catch (err) {
      const errMsg = `Failed to read games folder ${gamesPath}: ${err}`;
      results.folderRenames.errors.push(errMsg);
      console.error(errMsg);
    }

    console.log(`Folder sync complete: ${results.folderRenames.success} updated, ${results.folderRenames.skipped} skipped, ${results.folderRenames.failed} failed`);

    // Step 2: Export labels
    try {
      const hasLabels = await hasLocalLabels();
      if (hasLabels) {
        const exportResult = await exportLabelsToSD(labelsPath);
        results.labels.success = true;
        results.labels.exported = exportResult.exported;
        results.labels.added = exportResult.added;
        console.log(`Exported ${exportResult.exported} labels, added ${exportResult.added} new carts to SD card`);
      } else {
        results.labels.error = 'No local labels to export';
      }
    } catch (err) {
      results.labels.error = `Failed to export labels: ${err}`;
    }

    res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Error applying sync:', error);
    res.status(500).json({ error: 'Failed to apply sync' });
  }
});

// POST /api/sync/full/apply-stream - Apply full sync with SSE progress
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

  const gamesPath = path.join(sdCardPath, 'Library', 'N64', 'Games');
  const labelsPath = path.join(sdCardPath, 'Library', 'N64', 'Images', 'labels.db');

  const results = {
    folderRenames: { success: 0, failed: 0, skipped: 0, errors: [] as string[], details: [] as string[] },
    labels: { success: false, exported: 0, added: 0, error: null as string | null },
  };

  try {
    // Step 1: Count operations for progress
    const cartDb = await getCartDatabase();
    const nameMap = new Map<string, string>();
    if (cartDb) {
      for (const cart of cartDb.carts) {
        if (cart.name) {
          nameMap.set(cart.id.toLowerCase(), cart.name);
        }
      }
    }

    // Count folder operations
    let folderOps: Array<{ folder: string; cartId: string; type: 'rename' | 'settings' }> = [];
    try {
      const folders = await readdir(gamesPath);
      for (const folder of folders) {
        const unknownMatch = folder.match(/^Unknown Cartridge\s+([0-9a-fA-F]{8})$/i);
        if (unknownMatch) {
          const cartId = unknownMatch[1].toLowerCase();
          if (nameMap.has(cartId)) {
            folderOps.push({ folder, cartId, type: 'rename' });
          }
          continue;
        }

        const namedMatch = folder.match(/^(.+)\s+([0-9a-fA-F]{8})$/);
        if (namedMatch) {
          const cartId = namedMatch[2].toLowerCase();
          if (nameMap.has(cartId)) {
            try {
              const settingsPath = path.join(gamesPath, folder, 'settings.json');
              const settingsData = await readFile(settingsPath, 'utf-8');
              const settings = JSON.parse(settingsData.replace(/,(\s*[}\]])/g, '$1'));
              if (settings.title === 'Unknown Cartridge') {
                folderOps.push({ folder, cartId, type: 'settings' });
              }
            } catch {
              // Skip
            }
          }
        }
      }
    } catch {
      // Games folder may not exist
    }

    // Get labels count
    const hasLabels = await hasLocalLabels();
    const localIndex = await getLocalIndex();
    const labelCount = localIndex?.entries.length || 0;

    const totalOps = folderOps.length + (hasLabels ? labelCount : 0);
    let completedOps = 0;

    sendProgress({
      type: 'start',
      total: totalOps,
      folderCount: folderOps.length,
      labelCount: hasLabels ? labelCount : 0,
    });

    // Step 2: Process folder renames and settings updates
    for (const op of folderOps) {
      sendProgress({
        type: 'progress',
        current: completedOps,
        total: totalOps,
        step: 'folders',
        detail: op.type === 'rename' ? `Renaming ${op.folder}` : `Updating settings for ${op.folder}`,
      });

      const newName = nameMap.get(op.cartId)!;

      if (op.type === 'rename') {
        const oldPath = path.join(gamesPath, op.folder);
        const newPath = path.join(gamesPath, `${newName} ${op.cartId}`);

        try {
          // Update settings.json first
          const settingsPath = path.join(oldPath, 'settings.json');
          try {
            const settingsData = await readFile(settingsPath, 'utf-8');
            const settings = JSON.parse(settingsData.replace(/,(\s*[}\]])/g, '$1'));
            settings.title = newName;
            await writeFile(settingsPath, JSON.stringify(settings, null, 2));
            results.folderRenames.details.push(`Updated ${op.cartId} settings.json title to "${newName}"`);
          } catch {
            // Skip settings error
          }

          // Rename folder
          await rename(oldPath, newPath);
          results.folderRenames.success++;
          results.folderRenames.details.push(`Renamed folder: ${op.folder} -> ${newName} ${op.cartId}`);
        } catch (err) {
          results.folderRenames.failed++;
          results.folderRenames.errors.push(`Failed to rename ${op.folder}: ${err}`);
        }
      } else {
        // Settings-only update
        const folderPath = path.join(gamesPath, op.folder);
        const settingsPath = path.join(folderPath, 'settings.json');

        try {
          const settingsData = await readFile(settingsPath, 'utf-8');
          const settings = JSON.parse(settingsData.replace(/,(\s*[}\]])/g, '$1'));
          if (settings.title === 'Unknown Cartridge') {
            settings.title = newName;
            await writeFile(settingsPath, JSON.stringify(settings, null, 2));
            results.folderRenames.details.push(`Updated ${op.cartId} settings.json title to "${newName}"`);
            results.folderRenames.success++;
          }
        } catch (err) {
          results.folderRenames.errors.push(`Failed to update settings for ${op.folder}: ${err}`);
        }
      }

      completedOps++;
    }

    // Step 3: Export labels with progress
    if (hasLabels) {
      sendProgress({
        type: 'progress',
        current: completedOps,
        total: totalOps,
        step: 'labels',
        detail: 'Starting label export...',
      });

      try {
        const exportResult = await exportLabelsToSD(labelsPath, (current, total, cartId) => {
          sendProgress({
            type: 'progress',
            current: completedOps + current,
            total: totalOps,
            step: 'labels',
            detail: `Exporting label ${current}/${total}: ${cartId}`,
          });
        });

        results.labels.success = true;
        results.labels.exported = exportResult.exported;
        results.labels.added = exportResult.added;
        completedOps += labelCount;
      } catch (err) {
        results.labels.error = `Failed to export labels: ${err}`;
      }
    }

    // Done
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
