/**
 * Bundle Service (Browser)
 *
 * Handles creation and parsing of .a3d bundle archives using JSZip.
 * These are ZIP files containing:
 * - manifest.json (metadata about contents)
 * - labels.db (the label database)
 * - labels/<cartId>.png (individual label images for selection exports)
 * - settings/<cartId>/settings.json (per-game settings)
 * - game-paks/<cartId>/controller_pak.img (per-game save data)
 * - game-pak-backups/<cartId>/metadata.json + *.img (backup files)
 * - owned-carts.json (ownership list)
 */

import JSZip from 'jszip';
import * as storage from '../storage/IndexedDbStorage';
import * as labelsDb from '../labels/LabelsDbService';
import { downloadBlob } from '../image/ImageProcessor';

// =============================================================================
// Types
// =============================================================================

export interface BundleManifest {
  version: 1;
  createdAt: string;
  appVersion: string;
  contents: {
    hasLabelsDb: boolean;
    hasOwnedCarts: boolean;
    settingsCount: number;
    gamePaksCount: number;
    gamePakBackupsCount: number;
    labelsCount?: number;
    cartIds: string[];
  };
}

export interface BundleContents {
  manifest: BundleManifest;
  labelsDb?: ArrayBuffer;
  labels: Map<string, ArrayBuffer>; // cartId -> PNG data
  ownedCarts?: {
    version: number;
    cartridges: Array<{ cartId: string; addedAt: string; source: string }>;
  };
  settings: Map<string, unknown>; // cartId -> settings object
  gamePaks: Map<string, ArrayBuffer>; // cartId -> controller pak data
  gamePakBackups: Map<string, {
    metadata: {
      version: 1;
      cartId: string;
      backups: Array<{
        id: string;
        name: string;
        description?: string;
        createdAt: string;
        md5Hash: string;
      }>;
    };
    files: Map<string, ArrayBuffer>;
  }>;
}

export type MergeStrategy = 'skip' | 'overwrite' | 'keep-both';

export interface ImportOptions {
  importLabels: boolean;
  importOwnership: boolean;
  importSettings: boolean;
  importGamePaks: boolean;
  importGamePakBackups: boolean;
  mergeStrategy: MergeStrategy;
}

export interface ImportResult {
  success: boolean;
  labelsImported: boolean;
  individualLabelsImported: { added: number; updated: number; skipped: number };
  ownershipMerged: { added: number; skipped: number };
  settingsImported: { added: number; skipped: number; overwritten: number };
  gamePaksImported: { added: number; skipped: number; overwritten: number };
  gamePakBackupsImported: { added: number; skipped: number; merged: number };
  errors: string[];
}

// =============================================================================
// Bundle Creation
// =============================================================================

/**
 * Create a bundle archive containing selected data
 */
export async function createBundle(options: {
  includeLabels?: boolean;
  includeOwnership?: boolean;
  includeSettings?: boolean;
  includeGamePaks?: boolean;
  includeGamePakBackups?: boolean;
  cartIds?: string[]; // If provided, only include these carts
}): Promise<Blob> {
  const {
    includeLabels = true,
    includeOwnership = true,
    includeSettings = true,
    includeGamePaks = true,
    includeGamePakBackups = true,
    cartIds: rawCartIds,
  } = options;

  // Normalize cartIds
  const cartIds = rawCartIds?.map(id => id.toLowerCase());
  const isSelectionExport = cartIds && cartIds.length > 0;

  const zip = new JSZip();
  const allCartIds = new Set<string>();

  // Collect settings
  let settingsCount = 0;
  if (includeSettings) {
    const allSettings = await storage.getAllSettings();
    for (const stored of allSettings) {
      const cartId = stored.cartId.toLowerCase();
      if (cartIds && !cartIds.includes(cartId)) continue;

      zip.file(`settings/${cartId}/settings.json`, JSON.stringify(stored.settings, null, 2));
      allCartIds.add(cartId);
      settingsCount++;
    }
  }

  // Collect game paks
  let gamePaksCount = 0;
  if (includeGamePaks) {
    const allGamePaks = await storage.getAllGamePaks();
    for (const stored of allGamePaks) {
      const cartId = stored.cartId.toLowerCase();
      if (cartIds && !cartIds.includes(cartId)) continue;

      zip.file(`game-paks/${cartId}/controller_pak.img`, stored.data);
      allCartIds.add(cartId);
      gamePaksCount++;
    }
  }

  // Collect labels
  let hasLabelsDb = false;
  let labelsCount = 0;
  if (includeLabels) {
    const labelsData = await storage.getLabelsDb();

    if (isSelectionExport && labelsData) {
      // For selection exports, include individual label PNGs
      for (const cartId of cartIds!) {
        try {
          const pngBlob = await labelsDb.getLabelsDbImage(cartId);
          if (pngBlob) {
            const buffer = await pngBlob.arrayBuffer();
            zip.file(`labels/${cartId}.png`, buffer);
            allCartIds.add(cartId);
            labelsCount++;
          }
        } catch {
          // Label not found, skip
        }
      }
    } else if (labelsData) {
      // For full exports, include the entire labels.db
      zip.file('labels.db', labelsData);
      hasLabelsDb = true;
    }
  }

  // Collect ownership data
  let hasOwnedCarts = false;
  if (includeOwnership) {
    const ownedCarts = await storage.getOwnedCarts();

    if (ownedCarts.length > 0) {
      let filteredCarts = ownedCarts;

      if (isSelectionExport) {
        // Filter to only include selected cart IDs
        const cartIdSet = new Set(cartIds);
        filteredCarts = ownedCarts.filter(c => cartIdSet.has(c.cartId.toLowerCase()));
      }

      if (filteredCarts.length > 0) {
        const ownedData = {
          version: 1,
          cartridges: filteredCarts.map(c => ({
            cartId: c.cartId,
            addedAt: c.addedAt,
            source: c.source,
          })),
        };
        zip.file('owned-carts.json', JSON.stringify(ownedData, null, 2));
        hasOwnedCarts = true;
      }
    }
  }

  // Collect game pak backups
  let gamePakBackupsCount = 0;
  if (includeGamePakBackups) {
    // Get unique cart IDs that have backups
    const backupCartIds = new Set<string>();
    const allBackups = await Promise.all(
      (await storage.getOwnedCartIds()).map(async (cartId) => {
        const backups = await storage.getBackupsForCart(cartId);
        if (backups.length > 0) {
          backupCartIds.add(cartId);
        }
        return { cartId, backups };
      })
    );

    for (const { cartId, backups } of allBackups) {
      if (cartIds && !cartIds.includes(cartId.toLowerCase())) continue;
      if (backups.length === 0) continue;

      // Create metadata
      const metadata = {
        version: 1 as const,
        cartId: cartId.toLowerCase(),
        backups: backups.map(b => ({
          id: b.id,
          name: b.name,
          description: b.description,
          createdAt: b.createdAt,
          md5Hash: b.md5Hash,
        })),
      };

      zip.file(`game-pak-backups/${cartId}/metadata.json`, JSON.stringify(metadata, null, 2));

      // Add backup files
      for (const backup of backups) {
        zip.file(`game-pak-backups/${cartId}/${backup.id}.img`, backup.data);
        gamePakBackupsCount++;
      }

      allCartIds.add(cartId);
    }
  }

  // Create manifest
  const manifest: BundleManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    appVersion: '1.0.0',
    contents: {
      hasLabelsDb,
      hasOwnedCarts,
      settingsCount,
      gamePaksCount,
      gamePakBackupsCount,
      labelsCount,
      cartIds: Array.from(allCartIds).sort(),
    },
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // Generate ZIP
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

/**
 * Create a bundle for specific cartridges (selection export)
 */
export async function createSelectionBundle(cartIds: string[]): Promise<Blob> {
  return createBundle({
    includeLabels: true,
    includeOwnership: true,
    includeSettings: true,
    includeGamePaks: true,
    includeGamePakBackups: true,
    cartIds: cartIds.map(id => id.toLowerCase()),
  });
}

// =============================================================================
// Bundle Parsing
// =============================================================================

/**
 * Parse a bundle archive and return its contents
 */
export async function parseBundle(data: ArrayBuffer | Blob): Promise<BundleContents> {
  const zip = await JSZip.loadAsync(data);

  let manifest: BundleManifest | null = null;
  let labelsDbData: ArrayBuffer | undefined;
  let ownedCarts: BundleContents['ownedCarts'] | undefined;
  const labels = new Map<string, ArrayBuffer>();
  const settings = new Map<string, unknown>();
  const gamePaks = new Map<string, ArrayBuffer>();
  interface BackupEntry {
    metadata: {
      version: 1;
      cartId: string;
      backups: Array<{
        id: string;
        name: string;
        description?: string;
        createdAt: string;
        md5Hash: string;
      }>;
    };
    files: Map<string, ArrayBuffer>;
  }
  const gamePakBackups = new Map<string, BackupEntry>();

  // First pass: collect backup metadata
  interface BackupMetadata {
    version: 1;
    cartId: string;
    backups: Array<{
      id: string;
      name: string;
      description?: string;
      createdAt: string;
      md5Hash: string;
    }>;
  }
  const backupMetadatas = new Map<string, BackupMetadata>();
  const backupFiles = new Map<string, Map<string, ArrayBuffer>>();

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;

    if (path === 'manifest.json') {
      const content = await file.async('string');
      manifest = JSON.parse(content) as BundleManifest;
    } else if (path === 'labels.db') {
      labelsDbData = await file.async('arraybuffer');
    } else if (path.startsWith('labels/') && path.endsWith('.png')) {
      const cartId = path.slice(7, -4).toLowerCase(); // Remove 'labels/' and '.png'
      labels.set(cartId, await file.async('arraybuffer'));
    } else if (path === 'owned-carts.json') {
      const content = await file.async('string');
      ownedCarts = JSON.parse(content);
    } else if (path.startsWith('settings/') && path.endsWith('/settings.json')) {
      const parts = path.split('/');
      const cartId = parts[1].toLowerCase();
      const content = await file.async('string');
      settings.set(cartId, JSON.parse(content));
    } else if (path.startsWith('game-paks/') && path.endsWith('/controller_pak.img')) {
      const parts = path.split('/');
      const cartId = parts[1].toLowerCase();
      gamePaks.set(cartId, await file.async('arraybuffer'));
    } else if (path.startsWith('game-pak-backups/') && path.endsWith('/metadata.json')) {
      const parts = path.split('/');
      const cartId = parts[1].toLowerCase();
      const content = await file.async('string');
      backupMetadatas.set(cartId, JSON.parse(content));
    } else if (path.startsWith('game-pak-backups/') && path.endsWith('.img')) {
      const parts = path.split('/');
      const cartId = parts[1].toLowerCase();
      const backupId = parts[2].slice(0, -4); // Remove '.img'
      if (!backupFiles.has(cartId)) {
        backupFiles.set(cartId, new Map());
      }
      backupFiles.get(cartId)!.set(backupId, await file.async('arraybuffer'));
    }
  }

  // Combine backup metadata and files
  for (const [cartId, metadata] of backupMetadatas) {
    const files = backupFiles.get(cartId) || new Map();
    gamePakBackups.set(cartId, { metadata, files });
  }

  if (!manifest) {
    throw new Error('Invalid bundle: missing manifest.json');
  }

  return {
    manifest,
    labelsDb: labelsDbData,
    labels,
    ownedCarts,
    settings,
    gamePaks,
    gamePakBackups,
  };
}

/**
 * Get information about a bundle without fully extracting it
 */
export async function getBundleInfo(data: ArrayBuffer | Blob): Promise<BundleManifest> {
  const zip = await JSZip.loadAsync(data);
  const manifestFile = zip.file('manifest.json');

  if (!manifestFile) {
    throw new Error('Invalid bundle: missing manifest.json');
  }

  const content = await manifestFile.async('string');
  return JSON.parse(content) as BundleManifest;
}

// =============================================================================
// Bundle Import
// =============================================================================

/**
 * Import a bundle with specified options
 */
export async function importBundle(
  data: ArrayBuffer | Blob,
  options: ImportOptions
): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    labelsImported: false,
    individualLabelsImported: { added: 0, updated: 0, skipped: 0 },
    ownershipMerged: { added: 0, skipped: 0 },
    settingsImported: { added: 0, skipped: 0, overwritten: 0 },
    gamePaksImported: { added: 0, skipped: 0, overwritten: 0 },
    gamePakBackupsImported: { added: 0, skipped: 0, merged: 0 },
    errors: [],
  };

  try {
    const bundle = await parseBundle(data);

    // Import labels.db (full database)
    if (options.importLabels && bundle.labelsDb) {
      const hasLocal = await labelsDb.hasLocalLabelsDb();

      if (!hasLocal || options.mergeStrategy === 'overwrite') {
        await labelsDb.importLabelsDbFromBuffer(bundle.labelsDb);
        result.labelsImported = true;
      } else if (options.mergeStrategy === 'skip') {
        // Skip - labels already exist
      } else {
        // keep-both - just overwrite for now
        await labelsDb.importLabelsDbFromBuffer(bundle.labelsDb);
        result.labelsImported = true;
      }
    }

    // Import individual label images
    if (options.importLabels && bundle.labels.size > 0) {
      // Get existing entries if any
      const existingEntries = await labelsDb.getAllLocalLabelsDbEntries();
      const existingIds = new Set(existingEntries?.map(e => e.cartId) || []);

      for (const [cartIdHex, pngBuffer] of bundle.labels) {
        const cartId = parseInt(cartIdHex, 16);
        const exists = existingIds.has(cartIdHex);

        try {
          // Convert PNG to BGRA for labels.db
          // We need to load the PNG and get BGRA data
          const blob = new Blob([pngBuffer], { type: 'image/png' });
          const { prepareImageForLabelsDb } = await import('../image/ImageProcessor');
          const bgraData = await prepareImageForLabelsDb(blob);

          if (!exists) {
            await labelsDb.addEntryToLabelsDb(cartId, bgraData);
            result.individualLabelsImported.added++;
          } else if (options.mergeStrategy === 'overwrite') {
            await labelsDb.updateEntryInLabelsDb(cartId, bgraData);
            result.individualLabelsImported.updated++;
          } else {
            result.individualLabelsImported.skipped++;
          }
        } catch (err) {
          result.errors.push(`Failed to import label for ${cartIdHex}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    }

    // Import ownership
    if (options.importOwnership && bundle.ownedCarts) {
      const existingIds = new Set(await storage.getOwnedCartIds());

      for (const cart of bundle.ownedCarts.cartridges) {
        const normalizedId = cart.cartId.toLowerCase();
        if (existingIds.has(normalizedId)) {
          result.ownershipMerged.skipped++;
        } else {
          await storage.markCartOwned(normalizedId, cart.source as 'manual' | 'sd-card');
          result.ownershipMerged.added++;
        }
      }
    }

    // Import settings
    if (options.importSettings && bundle.settings.size > 0) {
      for (const [cartId, settingsObj] of bundle.settings) {
        const existing = await storage.getSettings(cartId);

        if (!existing) {
          await storage.saveSettings(cartId, settingsObj);
          result.settingsImported.added++;
        } else if (options.mergeStrategy === 'overwrite') {
          await storage.saveSettings(cartId, settingsObj);
          result.settingsImported.overwritten++;
        } else {
          result.settingsImported.skipped++;
        }
      }
    }

    // Import game paks
    if (options.importGamePaks && bundle.gamePaks.size > 0) {
      for (const [cartId, pakBuffer] of bundle.gamePaks) {
        const existing = await storage.getGamePak(cartId);

        if (!existing) {
          await storage.saveGamePak(cartId, pakBuffer);
          result.gamePaksImported.added++;
        } else if (options.mergeStrategy === 'overwrite') {
          await storage.saveGamePak(cartId, pakBuffer);
          result.gamePaksImported.overwritten++;
        } else {
          result.gamePaksImported.skipped++;
        }
      }
    }

    // Import game pak backups
    if (options.importGamePakBackups && bundle.gamePakBackups.size > 0) {
      for (const [cartId, data] of bundle.gamePakBackups) {
        // Get existing backup hashes for deduplication
        const existingBackups = await storage.getBackupsForCart(cartId);
        const existingHashes = new Set(existingBackups.map(b => b.md5Hash));

        for (const backupMeta of data.metadata.backups) {
          const backupBuffer = data.files.get(backupMeta.id);
          if (!backupBuffer) {
            result.gamePakBackupsImported.skipped++;
            continue;
          }

          // Check for duplicate by hash
          if (existingHashes.has(backupMeta.md5Hash)) {
            result.gamePakBackupsImported.merged++;
            continue;
          }

          // Create new backup with new ID
          const newBackup: storage.GamePakBackup = {
            id: crypto.randomUUID(),
            cartId: cartId.toLowerCase(),
            name: backupMeta.name,
            description: backupMeta.description,
            createdAt: backupMeta.createdAt,
            md5Hash: backupMeta.md5Hash,
            data: backupBuffer,
          };

          await storage.createBackup(newBackup);
          existingHashes.add(backupMeta.md5Hash);
          result.gamePakBackupsImported.added++;
        }
      }
    }

    result.success = true;
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : 'Unknown error');
  }

  return result;
}

// =============================================================================
// Download Helper
// =============================================================================

/**
 * Create and download a bundle
 */
export async function downloadBundle(
  filename: string,
  options: Parameters<typeof createBundle>[0]
): Promise<void> {
  const blob = await createBundle(options);
  downloadBlob(blob, filename);
}

/**
 * Create and download a selection bundle
 */
export async function downloadSelectionBundle(
  filename: string,
  cartIds: string[]
): Promise<void> {
  const blob = await createSelectionBundle(cartIds);
  downloadBlob(blob, filename);
}
