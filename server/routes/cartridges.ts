import { Router, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import { readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';

import {
  getOwnedCartIds,
  getOwnedCartridges,
  isCartridgeOwned,
  addOwnedCartridge,
  addOwnedCartridges,
  removeOwnedCartridge,
} from '../lib/owned-carts.js';

import {
  getSettingsInfo,
  saveLocalSettings,
  downloadSettingsFromSD,
  uploadSettingsToSD,
  deleteLocalSettings,
  parseSettings,
  validateSettings,
  type CartridgeSettings,
} from '../lib/cartridge-settings.js';

import { lookupGameName } from '../lib/game-lookup.js';

import {
  getGamePakInfo,
  readLocalGamePak,
  saveLocalGamePak,
  downloadGamePakFromSD,
  uploadGamePakToSD,
  deleteLocalGamePak,
  validateGamePak,
  CONTROLLER_PAK_SIZE,
  listBackups,
  createBackup,
  getBackupBuffer,
  updateBackup,
  deleteBackup,
  restoreBackup,
} from '../lib/game-pak.js';

import {
  createBundle,
  getBundleInfo,
  importBundle,
  createSelectionBundle,
  type ImportOptions,
} from '../lib/bundle-archive.js';

const router = Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024, // 1MB max for settings/game pak files
  },
});

// Larger limit for bundle imports
const bundleUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max for bundles
  },
});

// =============================================================================
// Ownership Routes
// =============================================================================

/**
 * GET /api/cartridges/owned
 * Get list of owned cartridge IDs
 */
router.get('/owned', async (_req, res) => {
  try {
    const cartridges = await getOwnedCartridges();
    res.json({
      count: cartridges.length,
      cartridges,
    });
  } catch (error) {
    console.error('Error getting owned cartridges:', error);
    res.status(500).json({ error: 'Failed to get owned cartridges' });
  }
});

/**
 * GET /api/cartridges/owned/ids
 * Get just the cart IDs (for filtering)
 */
router.get('/owned/ids', async (_req, res) => {
  try {
    const ids = await getOwnedCartIds();
    res.json({ ids });
  } catch (error) {
    console.error('Error getting owned cart IDs:', error);
    res.status(500).json({ error: 'Failed to get owned cart IDs' });
  }
});

/**
 * POST /api/cartridges/owned/:cartId
 * Mark a cartridge as owned
 */
router.post('/owned/:cartId', async (req, res) => {
  const { cartId } = req.params;
  const { source = 'manual' } = req.body;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  try {
    const entry = await addOwnedCartridge(cartId, source);
    res.json({ success: true, entry });
  } catch (error) {
    console.error('Error adding owned cartridge:', error);
    res.status(500).json({ error: 'Failed to add owned cartridge' });
  }
});

/**
 * DELETE /api/cartridges/owned/:cartId
 * Remove ownership from a cartridge
 */
router.delete('/owned/:cartId', async (req, res) => {
  const { cartId } = req.params;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  try {
    const removed = await removeOwnedCartridge(cartId);
    res.json({ success: removed });
  } catch (error) {
    console.error('Error removing owned cartridge:', error);
    res.status(500).json({ error: 'Failed to remove owned cartridge' });
  }
});

/**
 * GET /api/cartridges/owned/check/:cartId
 * Check if a specific cartridge is owned
 */
router.get('/owned/check/:cartId', async (req, res) => {
  const { cartId } = req.params;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  try {
    const owned = await isCartridgeOwned(cartId);
    res.json({ cartId: cartId.toLowerCase(), owned });
  } catch (error) {
    console.error('Error checking ownership:', error);
    res.status(500).json({ error: 'Failed to check ownership' });
  }
});

/**
 * POST /api/cartridges/owned/import-from-sd/scan
 * Scan SD card for game folders and return what can be imported
 */
router.post('/owned/import-from-sd/scan', async (req, res) => {
  const { sdCardPath } = req.body;

  if (!sdCardPath || typeof sdCardPath !== 'string') {
    return res.status(400).json({ error: 'SD card path is required' });
  }

  const gamesDir = path.join(sdCardPath, 'Library', 'N64', 'Games');

  if (!existsSync(gamesDir)) {
    return res.status(400).json({ error: 'Games directory not found on SD card' });
  }

  try {
    const folders = await readdir(gamesDir);
    const cartridges: Array<{
      cartId: string;
      folderName: string;
      hasSettings: boolean;
      hasGamePak: boolean;
    }> = [];

    for (const folder of folders) {
      const folderPath = path.join(gamesDir, folder);
      const folderStats = await stat(folderPath);

      if (!folderStats.isDirectory()) continue;

      // Extract cart ID from folder name (last 8 hex chars)
      const match = folder.match(/([0-9a-fA-F]{8})$/);
      if (!match) continue;

      const cartId = match[1].toLowerCase();
      const hasSettings = existsSync(path.join(folderPath, 'settings.json'));
      const hasGamePak = existsSync(path.join(folderPath, 'controller_pak.img'));

      cartridges.push({
        cartId,
        folderName: folder,
        hasSettings,
        hasGamePak,
      });
    }

    // Get currently owned IDs for comparison
    const ownedIds = new Set(await getOwnedCartIds());

    res.json({
      sdCardPath,
      cartridges: cartridges.map(c => ({
        ...c,
        alreadyOwned: ownedIds.has(c.cartId),
      })),
      summary: {
        total: cartridges.length,
        withSettings: cartridges.filter(c => c.hasSettings).length,
        withGamePak: cartridges.filter(c => c.hasGamePak).length,
        alreadyOwned: cartridges.filter(c => ownedIds.has(c.cartId)).length,
      },
    });
  } catch (error) {
    console.error('Error scanning SD card:', error);
    res.status(500).json({ error: 'Failed to scan SD card' });
  }
});

/**
 * POST /api/cartridges/owned/import-from-sd/apply
 * Import ownership from SD card (optionally download settings/game paks)
 * Uses SSE for progress reporting
 */
router.post('/owned/import-from-sd/apply', async (req, res: Response) => {
  const { sdCardPath, cartIds, downloadSettings, downloadGamePaks } = req.body;

  if (!sdCardPath || !Array.isArray(cartIds) || cartIds.length === 0) {
    return res.status(400).json({ error: 'SD card path and cart IDs are required' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendProgress = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Step 1: Mark all as owned
    sendProgress({ step: 'ownership', status: 'started', total: cartIds.length });

    const { added, skipped } = await addOwnedCartridges(cartIds, 'sd-card');

    sendProgress({
      step: 'ownership',
      status: 'completed',
      added: added.length,
      skipped: skipped.length,
    });

    // Step 2: Download settings if requested
    if (downloadSettings) {
      sendProgress({ step: 'settings', status: 'started', total: cartIds.length });

      let settingsDownloaded = 0;
      const settingsErrors: string[] = [];

      for (let i = 0; i < cartIds.length; i++) {
        const cartId = cartIds[i];
        sendProgress({
          step: 'settings',
          status: 'downloading',
          current: i + 1,
          total: cartIds.length,
          cartId,
        });

        const result = await downloadSettingsFromSD(cartId, sdCardPath);
        if (result.success) {
          settingsDownloaded++;
        } else if (result.error && !result.error.includes('not found')) {
          settingsErrors.push(`${cartId}: ${result.error}`);
        }
      }

      sendProgress({
        step: 'settings',
        status: 'completed',
        downloaded: settingsDownloaded,
        errors: settingsErrors,
      });
    }

    // Step 3: Download game paks if requested
    if (downloadGamePaks) {
      sendProgress({ step: 'gamePaks', status: 'started', total: cartIds.length });

      let gamePaksDownloaded = 0;
      const gamePakErrors: string[] = [];

      for (let i = 0; i < cartIds.length; i++) {
        const cartId = cartIds[i];
        sendProgress({
          step: 'gamePaks',
          status: 'downloading',
          current: i + 1,
          total: cartIds.length,
          cartId,
        });

        const result = await downloadGamePakFromSD(cartId, sdCardPath);
        if (result.success) {
          gamePaksDownloaded++;
        } else if (result.error && !result.error.includes('not found')) {
          gamePakErrors.push(`${cartId}: ${result.error}`);
        }
      }

      sendProgress({
        step: 'gamePaks',
        status: 'completed',
        downloaded: gamePaksDownloaded,
        errors: gamePakErrors,
      });
    }

    sendProgress({ step: 'done', status: 'completed' });
    res.end();
  } catch (error) {
    console.error('Error importing from SD card:', error);
    sendProgress({
      step: 'error',
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.end();
  }
});

// =============================================================================
// Settings Routes
// =============================================================================

/**
 * GET /api/cartridges/:cartId/settings
 * Get settings for a cartridge
 */
router.get('/:cartId/settings', async (req, res) => {
  const { cartId } = req.params;
  const { sdCardPath } = req.query;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  try {
    const info = await getSettingsInfo(cartId, sdCardPath as string | undefined);
    res.json(info);
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

/**
 * PUT /api/cartridges/:cartId/settings
 * Update local settings
 */
router.put('/:cartId/settings', async (req, res) => {
  const { cartId } = req.params;
  const settings = req.body as CartridgeSettings;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  // Validate settings
  const validation = validateSettings(settings);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Invalid settings', details: validation.errors });
  }

  try {
    const savedPath = await saveLocalSettings(cartId, settings);
    res.json({ success: true, path: savedPath });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

/**
 * POST /api/cartridges/:cartId/settings/download
 * Download settings from SD card to local storage
 */
router.post('/:cartId/settings/download', async (req, res) => {
  const { cartId } = req.params;
  const { sdCardPath } = req.body;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  if (!sdCardPath) {
    return res.status(400).json({ error: 'SD card path is required' });
  }

  try {
    const result = await downloadSettingsFromSD(cartId, sdCardPath);
    if (result.success) {
      res.json({ success: true, path: result.path });
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error downloading settings:', error);
    res.status(500).json({ error: 'Failed to download settings' });
  }
});

/**
 * POST /api/cartridges/:cartId/settings/upload
 * Upload local settings to SD card
 */
router.post('/:cartId/settings/upload', async (req, res) => {
  const { cartId } = req.params;
  const { sdCardPath } = req.body;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  if (!sdCardPath) {
    return res.status(400).json({ error: 'SD card path is required' });
  }

  try {
    const result = await uploadSettingsToSD(cartId, sdCardPath);
    if (result.success) {
      res.json({ success: true, path: result.path });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error uploading settings:', error);
    res.status(500).json({ error: 'Failed to upload settings' });
  }
});

/**
 * POST /api/cartridges/:cartId/settings/import
 * Import settings from uploaded file
 */
router.post('/:cartId/settings/import', upload.single('settings'), async (req, res) => {
  const { cartId } = req.params;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const content = req.file.buffer.toString('utf-8');
    const settings = parseSettings(content);

    const validation = validateSettings(settings);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Invalid settings file', details: validation.errors });
    }

    // Preserve the target cartridge's title
    // Priority: existing target title > system game name > imported title
    let targetTitle = settings.title;

    // First, try to get the target's existing settings title
    try {
      const existingInfo = await getSettingsInfo(cartId);
      if (existingInfo.local?.settings?.title &&
          existingInfo.local.settings.title !== 'Unknown Cartridge') {
        targetTitle = existingInfo.local.settings.title;
      }
    } catch {
      // Ignore errors fetching existing settings
    }

    // If still "Unknown Cartridge" or same as imported, try the system game name
    if (targetTitle === 'Unknown Cartridge' || targetTitle === settings.title) {
      const systemName = await lookupGameName(cartId);
      if (systemName && systemName !== 'Unknown Cartridge') {
        targetTitle = systemName;
      }
    }

    // Update the settings with the correct title
    settings.title = targetTitle;

    const savedPath = await saveLocalSettings(cartId, settings);
    res.json({ success: true, path: savedPath });
  } catch (error) {
    console.error('Error importing settings:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid settings file',
    });
  }
});

/**
 * GET /api/cartridges/:cartId/settings/export
 * Export settings as downloadable file
 */
router.get('/:cartId/settings/export', async (req, res) => {
  const { cartId } = req.params;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  try {
    const info = await getSettingsInfo(cartId);

    if (!info.local.exists || !info.local.settings) {
      return res.status(404).json({ error: 'No local settings found' });
    }

    const content = JSON.stringify(info.local.settings, null, 2);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="settings-${cartId}.json"`);
    res.send(content);
  } catch (error) {
    console.error('Error exporting settings:', error);
    res.status(500).json({ error: 'Failed to export settings' });
  }
});

/**
 * DELETE /api/cartridges/:cartId/settings
 * Delete local settings
 */
router.delete('/:cartId/settings', async (req, res) => {
  const { cartId } = req.params;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  try {
    const deleted = await deleteLocalSettings(cartId);
    res.json({ success: deleted });
  } catch (error) {
    console.error('Error deleting settings:', error);
    res.status(500).json({ error: 'Failed to delete settings' });
  }
});

// =============================================================================
// Game Pak Routes
// =============================================================================

/**
 * GET /api/cartridges/:cartId/game-pak
 * Get game pak info
 * Query params:
 *   - sdCardPath: path to SD card
 *   - includeHash: if 'true', include MD5 hashes and sync status
 */
router.get('/:cartId/game-pak', async (req, res) => {
  const { cartId } = req.params;
  const { sdCardPath, includeHash } = req.query;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  try {
    const info = await getGamePakInfo(cartId, {
      sdCardPath: sdCardPath as string | undefined,
      includeHash: includeHash === 'true',
    });
    res.json(info);
  } catch (error) {
    console.error('Error getting game pak info:', error);
    res.status(500).json({ error: 'Failed to get game pak info' });
  }
});

/**
 * POST /api/cartridges/:cartId/game-pak/download
 * Download game pak from SD card to local storage
 */
router.post('/:cartId/game-pak/download', async (req, res) => {
  const { cartId } = req.params;
  const { sdCardPath, title } = req.body;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  if (!sdCardPath) {
    return res.status(400).json({ error: 'SD card path is required' });
  }

  try {
    const result = await downloadGamePakFromSD(cartId, sdCardPath, title);
    if (result.success) {
      res.json({ success: true, path: result.path });
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error downloading game pak:', error);
    res.status(500).json({ error: 'Failed to download game pak' });
  }
});

/**
 * POST /api/cartridges/:cartId/game-pak/upload
 * Upload local game pak to SD card
 */
router.post('/:cartId/game-pak/upload', async (req, res) => {
  const { cartId } = req.params;
  const { sdCardPath, title } = req.body;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  if (!sdCardPath) {
    return res.status(400).json({ error: 'SD card path is required' });
  }

  try {
    const result = await uploadGamePakToSD(cartId, sdCardPath, title);
    if (result.success) {
      res.json({ success: true, path: result.path });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error uploading game pak:', error);
    res.status(500).json({ error: 'Failed to upload game pak' });
  }
});

/**
 * POST /api/cartridges/:cartId/game-pak/import
 * Import game pak from uploaded file
 */
router.post('/:cartId/game-pak/import', upload.single('gamePak'), async (req, res) => {
  const { cartId } = req.params;
  const { title } = req.body;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const buffer = req.file.buffer;

  // Validate the game pak
  const validation = validateGamePak(buffer);
  if (!validation.valid) {
    return res.status(400).json({
      error: 'Invalid game pak file',
      details: validation.errors,
      expectedSize: CONTROLLER_PAK_SIZE,
      actualSize: buffer.length,
    });
  }

  try {
    const savedPath = await saveLocalGamePak(cartId, buffer, title);
    res.json({ success: true, path: savedPath });
  } catch (error) {
    console.error('Error importing game pak:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to import game pak',
    });
  }
});

/**
 * GET /api/cartridges/:cartId/game-pak/export
 * Export game pak as downloadable file
 */
router.get('/:cartId/game-pak/export', async (req, res) => {
  const { cartId } = req.params;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  try {
    const buffer = await readLocalGamePak(cartId);

    if (!buffer) {
      return res.status(404).json({ error: 'No local game pak found' });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="controller_pak-${cartId}.img"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting game pak:', error);
    res.status(500).json({ error: 'Failed to export game pak' });
  }
});

/**
 * DELETE /api/cartridges/:cartId/game-pak
 * Delete local game pak
 */
router.delete('/:cartId/game-pak', async (req, res) => {
  const { cartId } = req.params;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  try {
    const deleted = await deleteLocalGamePak(cartId);
    res.json({ success: deleted });
  } catch (error) {
    console.error('Error deleting game pak:', error);
    res.status(500).json({ error: 'Failed to delete game pak' });
  }
});

// =============================================================================
// Game Pak Backup Routes
// =============================================================================

/**
 * GET /api/cartridges/:cartId/game-pak/backups
 * List all backups for a cartridge
 */
router.get('/:cartId/game-pak/backups', async (req, res) => {
  const { cartId } = req.params;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  try {
    const backups = await listBackups(cartId);
    res.json({ backups });
  } catch (error) {
    console.error('Error listing backups:', error);
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

/**
 * POST /api/cartridges/:cartId/game-pak/backups
 * Create a new backup from current local game pak
 */
router.post('/:cartId/game-pak/backups', async (req, res) => {
  const { cartId } = req.params;
  const { name, description } = req.body;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  try {
    const backup = await createBackup(cartId, name, description);
    res.json({ success: true, backup });
  } catch (error) {
    console.error('Error creating backup:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to create backup',
    });
  }
});

/**
 * GET /api/cartridges/:cartId/game-pak/backups/:backupId
 * Download a specific backup as .img file
 */
router.get('/:cartId/game-pak/backups/:backupId', async (req, res) => {
  const { cartId, backupId } = req.params;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  try {
    const buffer = await getBackupBuffer(cartId, backupId);
    if (!buffer) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="backup-${backupId}.img"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error downloading backup:', error);
    res.status(500).json({ error: 'Failed to download backup' });
  }
});

/**
 * PUT /api/cartridges/:cartId/game-pak/backups/:backupId
 * Update backup name/description
 */
router.put('/:cartId/game-pak/backups/:backupId', async (req, res) => {
  const { cartId, backupId } = req.params;
  const { name, description } = req.body;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  try {
    const backup = await updateBackup(cartId, backupId, { name, description });
    if (!backup) {
      return res.status(404).json({ error: 'Backup not found' });
    }
    res.json({ success: true, backup });
  } catch (error) {
    console.error('Error updating backup:', error);
    res.status(500).json({ error: 'Failed to update backup' });
  }
});

/**
 * DELETE /api/cartridges/:cartId/game-pak/backups/:backupId
 * Delete a backup
 */
router.delete('/:cartId/game-pak/backups/:backupId', async (req, res) => {
  const { cartId, backupId } = req.params;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  try {
    const deleted = await deleteBackup(cartId, backupId);
    res.json({ success: deleted });
  } catch (error) {
    console.error('Error deleting backup:', error);
    res.status(500).json({ error: 'Failed to delete backup' });
  }
});

/**
 * POST /api/cartridges/:cartId/game-pak/backups/:backupId/restore
 * Restore a backup to local (and optionally SD card)
 */
router.post('/:cartId/game-pak/backups/:backupId/restore', async (req, res) => {
  const { cartId, backupId } = req.params;
  const { syncToSD, sdCardPath, title } = req.body;

  if (!/^[0-9a-fA-F]{8}$/.test(cartId)) {
    return res.status(400).json({ error: 'Invalid cart ID format' });
  }

  try {
    const result = await restoreBackup(
      cartId,
      backupId,
      title || 'Unknown Cartridge',
      syncToSD ? sdCardPath : undefined
    );
    res.json({
      success: true,
      restoredToLocal: result.local,
      restoredToSD: result.sd,
    });
  } catch (error) {
    console.error('Error restoring backup:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to restore backup',
    });
  }
});

// =============================================================================
// Bundle Export/Import Routes
// =============================================================================

/**
 * POST /api/cartridges/bundle/export
 * Create and download a bundle archive
 *
 * Body: {
 *   includeLabels?: boolean,
 *   includeOwnership?: boolean,
 *   includeSettings?: boolean,
 *   includeGamePaks?: boolean,
 *   cartIds?: string[] // Optional: only include specific carts
 * }
 */
router.post('/bundle/export', async (req, res) => {
  try {
    const {
      includeLabels = true,
      includeOwnership = true,
      includeSettings = true,
      includeGamePaks = true,
      cartIds,
    } = req.body;

    const bundle = await createBundle({
      includeLabels,
      includeOwnership,
      includeSettings,
      includeGamePaks,
      cartIds,
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `a3d-backup-${timestamp}.a3d`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', bundle.length);
    res.send(bundle);
  } catch (error) {
    console.error('Error creating bundle:', error);
    res.status(500).json({ error: 'Failed to create bundle' });
  }
});

/**
 * POST /api/cartridges/bundle/export-selection
 * Create a bundle for specific cartridges (settings + game paks only)
 *
 * Body: { cartIds: string[] }
 */
router.post('/bundle/export-selection', async (req, res) => {
  try {
    const { cartIds } = req.body;

    if (!cartIds || !Array.isArray(cartIds) || cartIds.length === 0) {
      return res.status(400).json({ error: 'cartIds array is required' });
    }

    const bundle = await createSelectionBundle(cartIds);

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `a3d-selection-${timestamp}.a3d`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', bundle.length);
    res.send(bundle);
  } catch (error) {
    console.error('Error creating selection bundle:', error);
    res.status(500).json({ error: 'Failed to create bundle' });
  }
});

/**
 * POST /api/cartridges/bundle/info
 * Get information about a bundle file without importing
 */
router.post('/bundle/info', bundleUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const info = await getBundleInfo(req.file.buffer);
    res.json(info);
  } catch (error) {
    console.error('Error reading bundle info:', error);
    res.status(400).json({ error: 'Invalid bundle file' });
  }
});

/**
 * POST /api/cartridges/bundle/import
 * Import a bundle archive
 *
 * Form data:
 * - file: The .a3d bundle file
 * - options: JSON string of ImportOptions
 */
router.post('/bundle/import', bundleUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let options: ImportOptions;
    try {
      options = JSON.parse(req.body.options || '{}');
    } catch {
      options = {
        importLabels: true,
        importOwnership: true,
        importSettings: true,
        importGamePaks: true,
        importGamePakBackups: true,
        mergeStrategy: 'skip',
      };
    }

    // Ensure all options have defaults
    const importOptions: ImportOptions = {
      importLabels: options.importLabels ?? true,
      importOwnership: options.importOwnership ?? true,
      importSettings: options.importSettings ?? true,
      importGamePaks: options.importGamePaks ?? true,
      importGamePakBackups: options.importGamePakBackups ?? true,
      mergeStrategy: options.mergeStrategy ?? 'skip',
    };

    const result = await importBundle(req.file.buffer, importOptions);
    res.json(result);
  } catch (error) {
    console.error('Error importing bundle:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import bundle',
    });
  }
});

export default router;
