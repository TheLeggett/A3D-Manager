import { readdir, stat, access, constants } from 'fs/promises';
import path from 'path';

export interface SDCardInfo {
  name: string;
  path: string;
  gamesPath: string;
  libraryDbPath: string;
  labelsDbPath: string;
}

/**
 * Detect Analogue 3D SD cards by scanning /Volumes for the expected structure
 */
export async function detectSDCards(): Promise<SDCardInfo[]> {
  const volumesPath = '/Volumes';
  const sdCards: SDCardInfo[] = [];

  try {
    const volumes = await readdir(volumesPath);

    for (const volume of volumes) {
      const volumePath = path.join(volumesPath, volume);
      const libraryPath = path.join(volumePath, 'Library', 'N64');
      const libraryDbPath = path.join(libraryPath, 'library.db');

      try {
        // Check if this volume has the Analogue 3D structure
        await access(libraryDbPath, constants.R_OK);

        const volumeStat = await stat(volumePath);
        if (volumeStat.isDirectory()) {
          sdCards.push({
            name: volume,
            path: volumePath,
            gamesPath: path.join(libraryPath, 'Games'),
            libraryDbPath,
            labelsDbPath: path.join(libraryPath, 'Images', 'labels.db'),
          });
        }
      } catch {
        // This volume doesn't have Analogue 3D structure, skip it
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
