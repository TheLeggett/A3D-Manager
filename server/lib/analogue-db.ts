import { readdir, readFile, writeFile, rename, mkdir, access, constants, cp } from 'fs/promises';
import path from 'path';

export interface GameSettings {
  title: string;
  display: {
    odm: 'bvm' | 'pvm' | 'crt' | 'scanlines' | 'clean';
    catalog: {
      bvm: DisplaySettings;
      pvm: DisplaySettings;
      crt: DisplaySettings;
      scanlines: DisplaySettings;
      clean: CleanDisplaySettings;
    };
  };
  hardware: HardwareSettings;
}

export interface DisplaySettings {
  horizontalBeamConvergence: 'Off' | 'Consumer' | 'Professional';
  verticalBeamConvergence: 'Off' | 'Consumer' | 'Professional';
  enableEdgeOvershoot: boolean;
  enableEdgeHardness: boolean;
  imageSize: 'Fill' | 'Fit';
  imageFit: 'Original' | 'Stretch';
}

export interface CleanDisplaySettings {
  interpolationAlg: string;
  gammaTransferFunction: string;
  sharpness: 'Low' | 'Medium' | 'High';
  imageSize: 'Fill' | 'Fit';
  imageFit: 'Original' | 'Stretch';
}

export interface HardwareSettings {
  virtualExpansionPak: boolean;
  region: 'Auto' | 'NTSC' | 'PAL';
  disableDeblur: boolean;
  enable32BitColor: boolean;
  disableTextureFiltering: boolean;
  disableAntialiasing: boolean;
  forceOriginalHardware: boolean;
  overclock: 'Auto' | 'Enhanced' | 'Unleashed';
}

export interface Game {
  id: string; // hex ID
  title: string;
  folderName: string;
  folderPath: string;
  settingsPath: string;
  artworkPath: string;
  hasArtwork: boolean;
  settings: GameSettings;
}

/**
 * Parse a game folder name to extract title and hex ID
 */
export function parseGameFolder(folderName: string): { title: string; id: string } | null {
  // Format: "Game Title hexid" where hexid is 8 characters
  const match = folderName.match(/^(.+)\s+([a-f0-9]{8})$/i);
  if (!match) return null;

  return {
    title: match[1],
    id: match[2].toLowerCase(),
  };
}

/**
 * Read all games from a games directory
 */
export async function readGames(gamesDir: string): Promise<Game[]> {
  const games: Game[] = [];

  try {
    const folders = await readdir(gamesDir);

    for (const folderName of folders) {
      // Skip hidden files
      if (folderName.startsWith('.')) continue;

      const parsed = parseGameFolder(folderName);
      if (!parsed) continue;

      const folderPath = path.join(gamesDir, folderName);
      const settingsPath = path.join(folderPath, 'settings.json');
      const artworkPath = path.join(folderPath, 'controller_pak.img');

      let settings: GameSettings;
      try {
        const settingsJson = await readFile(settingsPath, 'utf-8');
        settings = JSON.parse(settingsJson);
      } catch {
        // Default settings if file doesn't exist
        settings = createDefaultSettings(parsed.title);
      }

      let hasArtwork = false;
      try {
        await access(artworkPath, constants.R_OK);
        hasArtwork = true;
      } catch {
        // No artwork
      }

      games.push({
        id: parsed.id,
        title: parsed.title,
        folderName,
        folderPath,
        settingsPath,
        artworkPath,
        hasArtwork,
        settings,
      });
    }
  } catch (error) {
    console.error('Error reading games:', error);
  }

  // Sort by title
  games.sort((a, b) => a.title.localeCompare(b.title));

  return games;
}

/**
 * Create default settings for a new game
 */
export function createDefaultSettings(title: string): GameSettings {
  return {
    title,
    display: {
      odm: 'crt',
      catalog: {
        bvm: {
          horizontalBeamConvergence: 'Professional',
          verticalBeamConvergence: 'Professional',
          enableEdgeOvershoot: false,
          enableEdgeHardness: false,
          imageSize: 'Fill',
          imageFit: 'Original',
        },
        pvm: {
          horizontalBeamConvergence: 'Professional',
          verticalBeamConvergence: 'Professional',
          enableEdgeOvershoot: true,
          enableEdgeHardness: false,
          imageSize: 'Fill',
          imageFit: 'Original',
        },
        crt: {
          horizontalBeamConvergence: 'Consumer',
          verticalBeamConvergence: 'Consumer',
          enableEdgeOvershoot: true,
          enableEdgeHardness: false,
          imageSize: 'Fill',
          imageFit: 'Original',
        },
        scanlines: {
          horizontalBeamConvergence: 'Off',
          verticalBeamConvergence: 'Off',
          enableEdgeOvershoot: false,
          enableEdgeHardness: false,
          imageSize: 'Fill',
          imageFit: 'Original',
        },
        clean: {
          interpolationAlg: 'BC Spline',
          gammaTransferFunction: 'Tube',
          sharpness: 'Medium',
          imageSize: 'Fill',
          imageFit: 'Original',
        },
      },
    },
    hardware: {
      virtualExpansionPak: true,
      region: 'Auto',
      disableDeblur: false,
      enable32BitColor: true,
      disableTextureFiltering: false,
      disableAntialiasing: false,
      forceOriginalHardware: false,
      overclock: 'Auto',
    },
  };
}

/**
 * Update a game's title (renames folder)
 */
export async function updateGameTitle(
  gamesDir: string,
  game: Game,
  newTitle: string
): Promise<Game> {
  const newFolderName = `${newTitle} ${game.id}`;
  const newFolderPath = path.join(gamesDir, newFolderName);

  // Rename the folder
  await rename(game.folderPath, newFolderPath);

  // Update settings.json with new title
  const newSettingsPath = path.join(newFolderPath, 'settings.json');
  const newSettings = { ...game.settings, title: newTitle };
  await writeFile(newSettingsPath, JSON.stringify(newSettings, null, 2));

  return {
    ...game,
    title: newTitle,
    folderName: newFolderName,
    folderPath: newFolderPath,
    settingsPath: newSettingsPath,
    artworkPath: path.join(newFolderPath, 'controller_pak.img'),
    settings: newSettings,
  };
}

/**
 * Update a game's settings
 */
export async function updateGameSettings(
  game: Game,
  settings: Partial<GameSettings>
): Promise<GameSettings> {
  const newSettings = { ...game.settings, ...settings };
  await writeFile(game.settingsPath, JSON.stringify(newSettings, null, 2));
  return newSettings;
}

/**
 * Sync games from source to destination directory
 */
export async function syncGames(
  sourceDir: string,
  destDir: string
): Promise<{ synced: string[]; errors: string[] }> {
  const synced: string[] = [];
  const errors: string[] = [];

  try {
    // Ensure destination exists
    await mkdir(destDir, { recursive: true });

    const sourceGames = await readGames(sourceDir);

    for (const game of sourceGames) {
      try {
        const destPath = path.join(destDir, game.folderName);

        // Copy the entire game folder
        await cp(game.folderPath, destPath, { recursive: true });
        synced.push(game.title);
      } catch (error) {
        errors.push(`${game.title}: ${error}`);
      }
    }
  } catch (error) {
    errors.push(`General sync error: ${error}`);
  }

  return { synced, errors };
}
