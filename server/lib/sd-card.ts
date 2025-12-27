import { readdir, stat, access, constants } from 'fs/promises';
import { statSync } from 'fs';
import path from 'path';
import {
  copyFileWithProgress,
  copyDirWithProgress,
  type ProgressCallback,
  type BatchProgressCallback,
  type FileProgress,
  type BatchProgress,
} from './file-transfer.js';
import { parseLabelsDb, getLocalLabelsDbPath, hasLocalLabelsDb } from './labels-db-core.js';

// Re-export progress types for convenience
export type { ProgressCallback, BatchProgressCallback, FileProgress, BatchProgress };

export interface SDCardInfo {
  name: string;
  path: string;
  gamesPath: string;
  libraryDbPath: string;
  labelsDbPath: string;
}

/**
 * Get the path where the Analogue 3D SD card is mounted
 * Defaults to /Volumes/ANALOGUE 3D (standard macOS mount), can be overridden via SD_VOLUMES_PATH env var
 */
export function getVolumesPath(): string {
  return process.env.SD_VOLUMES_PATH || '/Volumes/ANALOGUE 3D';
}

/**
 * Check if a path is an Analogue 3D SD card root
 */
async function isAnalogue3DRoot(volumePath: string): Promise<SDCardInfo | null> {
  const libraryPath = path.join(volumePath, 'Library', 'N64');
  const libraryDbPath = path.join(libraryPath, 'library.db');

  try {
    await access(libraryDbPath, constants.R_OK);
    const volumeStat = await stat(volumePath);
    if (volumeStat.isDirectory()) {
      return {
        name: path.basename(volumePath),
        path: volumePath,
        gamesPath: path.join(libraryPath, 'Games'),
        libraryDbPath,
        labelsDbPath: path.join(libraryPath, 'Images', 'labels.db'),
      };
    }
  } catch {
    // Not an Analogue 3D SD card
  }
  return null;
}

/**
 * Detect Analogue 3D SD cards by scanning volumes path for the expected structure
 * Supports both:
 * - Direct SD card path (e.g., /Volumes/ANALOGUE 3D)
 * - Parent directory containing SD cards (e.g., /Volumes)
 */
export async function detectSDCards(): Promise<SDCardInfo[]> {
  const volumesPath = getVolumesPath();
  const sdCards: SDCardInfo[] = [];

  try {
    // First, check if volumesPath itself is an Analogue 3D SD card
    const directCard = await isAnalogue3DRoot(volumesPath);
    if (directCard) {
      sdCards.push(directCard);
      return sdCards;
    }

    // Otherwise, scan volumesPath as a parent directory containing volumes
    const volumes = await readdir(volumesPath);

    for (const volume of volumes) {
      const volumePath = path.join(volumesPath, volume);
      const card = await isAnalogue3DRoot(volumePath);
      if (card) {
        sdCards.push(card);
      }
    }
  } catch (error) {
    console.error('Error scanning volumes:', error);
  }

  return sdCards;
}

/**
 * Check if a path is a valid Analogue 3D data directory
 */
export async function isValidAnalogueDir(dirPath: string): Promise<boolean> {
  const libraryDbPath = path.join(dirPath, 'Library', 'N64', 'library.db');
  try {
    await access(libraryDbPath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Progress-Enabled File Operations
// =============================================================================

/**
 * Export labels.db result
 */
export interface ExportLabelsResult {
  entryCount: number;
  fileSize: number;
}

/**
 * Export local labels.db to SD card with progress tracking
 *
 * @param sdLabelsPath - Full path to labels.db on SD card (e.g., /Volumes/SD/Library/N64/Images/labels.db)
 * @param onProgress - Callback for progress updates
 * @returns Entry count and file size
 */
export async function exportLabelsToSDWithProgress(
  sdLabelsPath: string,
  onProgress: ProgressCallback
): Promise<ExportLabelsResult> {
  // Check if local labels.db exists
  const hasLocal = await hasLocalLabelsDb();
  if (!hasLocal) {
    throw new Error('No local labels.db found. Import labels first.');
  }

  const localPath = getLocalLabelsDbPath();
  const stats = statSync(localPath);

  // Get entry count before copying
  const { readFile } = await import('fs/promises');
  const data = await readFile(localPath);
  const db = parseLabelsDb(data);

  // Copy with progress - use 50ms throttle for smoother updates
  await copyFileWithProgress(localPath, sdLabelsPath, onProgress, 50);

  return {
    entryCount: db.entryCount,
    fileSize: stats.size,
  };
}

/**
 * Get the size of a file or directory
 */
async function getPathSize(targetPath: string): Promise<number> {
  const stats = await stat(targetPath);
  if (!stats.isDirectory()) {
    return stats.size;
  }

  let totalSize = 0;
  const entries = await readdir(targetPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      totalSize += await getPathSize(entryPath);
    } else {
      const entryStats = await stat(entryPath);
      totalSize += entryStats.size;
    }
  }

  return totalSize;
}

/**
 * Sync result for game folders
 */
export interface SyncGamesResult {
  synced: string[];
  errors: string[];
  totalBytes: number;
}

/**
 * Game info with size for progress tracking
 */
export interface GameInfo {
  id: string;
  title: string;
  folderPath: string;
  size: number;
}

/**
 * Get game folders with their sizes for progress calculation
 */
export async function getGameFoldersWithSizes(gamesDir: string): Promise<GameInfo[]> {
  const games: GameInfo[] = [];

  try {
    const folders = await readdir(gamesDir);

    for (const folder of folders) {
      const folderPath = path.join(gamesDir, folder);
      const folderStats = await stat(folderPath);

      if (!folderStats.isDirectory()) continue;

      // Extract cart ID from folder name (last 8 hex chars)
      const match = folder.match(/([0-9a-fA-F]{8})$/);
      const cartId = match ? match[1].toLowerCase() : '';

      const size = await getPathSize(folderPath);

      games.push({
        id: cartId,
        title: folder,
        folderPath,
        size,
      });
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return games;
}

/**
 * Sync game folders to SD card with progress tracking
 *
 * @param sourceDir - Local games directory
 * @param destDir - SD card games directory
 * @param onProgress - Callback for batch progress updates
 * @returns List of synced games and any errors
 */
export async function syncGamesToSDWithProgress(
  sourceDir: string,
  destDir: string,
  onProgress: BatchProgressCallback
): Promise<SyncGamesResult> {
  const games = await getGameFoldersWithSizes(sourceDir);

  if (games.length === 0) {
    return { synced: [], errors: [], totalBytes: 0 };
  }

  const synced: string[] = [];
  const errors: string[] = [];
  let completedBytes = 0;
  const totalBytes = games.reduce((sum, g) => sum + g.size, 0);

  // Create destination directory
  const { mkdir } = await import('fs/promises');
  await mkdir(destDir, { recursive: true });

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const destPath = path.join(destDir, path.basename(game.folderPath));
    const gameStartBytes = completedBytes;

    try {
      await copyDirWithProgress(
        game.folderPath,
        destPath,
        (batchProgress) => {
          // Translate inner batch progress to outer batch progress
          onProgress({
            currentFile: i + 1,
            totalFiles: games.length,
            currentFileName: game.title,
            fileProgress: batchProgress.fileProgress,
            overallBytesWritten: gameStartBytes + batchProgress.overallBytesWritten,
            overallTotalBytes: totalBytes,
            overallPercentage: totalBytes > 0
              ? ((gameStartBytes + batchProgress.overallBytesWritten) / totalBytes) * 100
              : 100,
          });
        }
      );

      synced.push(game.title);
      completedBytes += game.size;
    } catch (err) {
      errors.push(`Failed to sync ${game.title}: ${err}`);
    }
  }

  return { synced, errors, totalBytes };
}
