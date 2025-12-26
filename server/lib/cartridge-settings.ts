import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// =============================================================================
// Types
// =============================================================================

export const BEAM_CONVERGENCE_VALUES = ['Off', 'Consumer', 'Professional'] as const;
export const IMAGE_SIZE_VALUES = ['Fill', 'Fit'] as const;
export const IMAGE_FIT_VALUES = ['Original', 'Stretch'] as const;
export const SHARPNESS_VALUES = ['Low', 'Medium', 'High'] as const;
export const REGION_VALUES = ['Auto', 'NTSC', 'PAL'] as const;
export const OVERCLOCK_VALUES = ['Auto', 'Enhanced', 'Enhanced+', 'Unleashed'] as const;
export const DISPLAY_MODE_VALUES = ['bvm', 'pvm', 'crt', 'scanlines', 'clean'] as const;

export type BeamConvergence = typeof BEAM_CONVERGENCE_VALUES[number];
export type ImageSize = typeof IMAGE_SIZE_VALUES[number];
export type ImageFit = typeof IMAGE_FIT_VALUES[number];
export type Sharpness = typeof SHARPNESS_VALUES[number];
export type Region = typeof REGION_VALUES[number];
export type Overclock = typeof OVERCLOCK_VALUES[number];
export type DisplayMode = typeof DISPLAY_MODE_VALUES[number];

export interface CRTModeSettings {
  horizontalBeamConvergence: BeamConvergence;
  verticalBeamConvergence: BeamConvergence;
  enableEdgeOvershoot: boolean;
  enableEdgeHardness: boolean;
  imageSize: ImageSize;
  imageFit: ImageFit;
}

export interface CleanModeSettings {
  interpolationAlg: string;
  gammaTransferFunction: string;
  sharpness: Sharpness;
  imageSize: ImageSize;
  imageFit: ImageFit;
}

export interface DisplayCatalog {
  bvm: CRTModeSettings;
  pvm: CRTModeSettings;
  crt: CRTModeSettings;
  scanlines: CRTModeSettings;
  clean: CleanModeSettings;
}

export interface DisplaySettings {
  odm: DisplayMode;
  catalog: DisplayCatalog;
}

export interface HardwareSettings {
  virtualExpansionPak: boolean;
  region: Region;
  disableDeblur: boolean;
  enable32BitColor: boolean;
  disableTextureFiltering: boolean;
  disableAntialiasing: boolean;
  forceOriginalHardware: boolean;
  overclock: Overclock;
}

export interface CartridgeSettings {
  title: string;
  display: DisplaySettings;
  hardware: HardwareSettings;
}

export interface SettingsInfo {
  exists: boolean;
  source: 'local' | 'sd';
  path: string;
  lastModified?: string;
  settings?: CartridgeSettings;
}

// =============================================================================
// Constants
// =============================================================================

const LOCAL_DIR = path.join(process.cwd(), '.local');
const LOCAL_GAMES_DIR = path.join(LOCAL_DIR, 'Library', 'N64', 'Games');

// Default settings for creating new settings files
export const DEFAULT_CRT_MODE_SETTINGS: CRTModeSettings = {
  horizontalBeamConvergence: 'Professional',
  verticalBeamConvergence: 'Professional',
  enableEdgeOvershoot: false,
  enableEdgeHardness: false,
  imageSize: 'Fill',
  imageFit: 'Original',
};

export const DEFAULT_CLEAN_MODE_SETTINGS: CleanModeSettings = {
  interpolationAlg: 'BC Spline',
  gammaTransferFunction: 'Tube',
  sharpness: 'Medium',
  imageSize: 'Fill',
  imageFit: 'Original',
};

export const DEFAULT_HARDWARE_SETTINGS: HardwareSettings = {
  virtualExpansionPak: true,
  region: 'Auto',
  disableDeblur: false,
  enable32BitColor: true,
  disableTextureFiltering: false,
  disableAntialiasing: false,
  forceOriginalHardware: false,
  overclock: 'Auto',
};

// =============================================================================
// Path Helpers
// =============================================================================

/**
 * Get the local games directory path
 */
export function getLocalGamesDir(): string {
  return LOCAL_GAMES_DIR;
}

/**
 * Find a game folder by cart ID in a directory
 * Game folders are named like "Game Title hexid"
 */
export async function findGameFolder(gamesDir: string, cartId: string): Promise<string | null> {
  const normalizedId = cartId.toLowerCase();

  if (!existsSync(gamesDir)) {
    return null;
  }

  const { readdir } = await import('fs/promises');
  const folders = await readdir(gamesDir);

  for (const folder of folders) {
    // Extract the hex ID from the end of the folder name
    const match = folder.match(/([0-9a-fA-F]{8})$/);
    if (match && match[1].toLowerCase() === normalizedId) {
      return path.join(gamesDir, folder);
    }
  }

  return null;
}

/**
 * Get the settings.json path for a cart ID in local storage
 */
export async function getLocalSettingsPath(cartId: string): Promise<string | null> {
  const gameFolder = await findGameFolder(LOCAL_GAMES_DIR, cartId);
  if (!gameFolder) {
    return null;
  }
  return path.join(gameFolder, 'settings.json');
}

/**
 * Get the settings.json path for a cart ID on SD card
 */
export async function getSDSettingsPath(sdCardPath: string, cartId: string): Promise<string | null> {
  const gamesDir = path.join(sdCardPath, 'Library', 'N64', 'Games');
  const gameFolder = await findGameFolder(gamesDir, cartId);
  if (!gameFolder) {
    return null;
  }
  return path.join(gameFolder, 'settings.json');
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Remove trailing commas from JSON string (Analogue 3D creates invalid JSON with trailing commas)
 */
function sanitizeJson(content: string): string {
  // Remove trailing commas before closing braces/brackets
  return content.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Parse and validate a settings.json file
 */
export function parseSettings(content: string): CartridgeSettings {
  const data = JSON.parse(sanitizeJson(content));

  // Basic validation
  if (typeof data !== 'object' || data === null) {
    throw new Error('Settings must be an object');
  }

  // Ensure required top-level fields
  if (!data.title || typeof data.title !== 'string') {
    data.title = 'Unknown Cartridge';
  }

  if (!data.display || typeof data.display !== 'object') {
    data.display = createDefaultDisplaySettings();
  }

  if (!data.hardware || typeof data.hardware !== 'object') {
    data.hardware = { ...DEFAULT_HARDWARE_SETTINGS };
  }

  return data as CartridgeSettings;
}

/**
 * Read settings from a file path
 */
export async function readSettingsFile(filePath: string): Promise<CartridgeSettings> {
  const content = await readFile(filePath, 'utf-8');
  return parseSettings(content);
}

/**
 * Get settings info for a cartridge (checks both local and SD)
 */
export async function getSettingsInfo(
  cartId: string,
  sdCardPath?: string
): Promise<{ local: SettingsInfo; sd: SettingsInfo | null }> {
  // Check local
  const localPath = await getLocalSettingsPath(cartId);
  const localInfo: SettingsInfo = {
    exists: false,
    source: 'local',
    path: localPath || '',
  };

  if (localPath && existsSync(localPath)) {
    try {
      const stats = await stat(localPath);
      const settings = await readSettingsFile(localPath);
      localInfo.exists = true;
      localInfo.lastModified = stats.mtime.toISOString();
      localInfo.settings = settings;
    } catch (error) {
      console.error('Error reading local settings:', error);
    }
  }

  // Check SD card if path provided
  let sdInfo: SettingsInfo | null = null;
  if (sdCardPath) {
    const sdPath = await getSDSettingsPath(sdCardPath, cartId);
    sdInfo = {
      exists: false,
      source: 'sd',
      path: sdPath || '',
    };

    if (sdPath && existsSync(sdPath)) {
      try {
        const stats = await stat(sdPath);
        const settings = await readSettingsFile(sdPath);
        sdInfo.exists = true;
        sdInfo.lastModified = stats.mtime.toISOString();
        sdInfo.settings = settings;
      } catch (error) {
        console.error('Error reading SD settings:', error);
      }
    }
  }

  return { local: localInfo, sd: sdInfo };
}

// =============================================================================
// Write Operations
// =============================================================================

/**
 * Create default display settings
 */
export function createDefaultDisplaySettings(): DisplaySettings {
  return {
    odm: 'crt',
    catalog: {
      bvm: { ...DEFAULT_CRT_MODE_SETTINGS },
      pvm: { ...DEFAULT_CRT_MODE_SETTINGS, enableEdgeOvershoot: true },
      crt: { ...DEFAULT_CRT_MODE_SETTINGS, enableEdgeOvershoot: true },
      scanlines: {
        ...DEFAULT_CRT_MODE_SETTINGS,
        horizontalBeamConvergence: 'Off',
        verticalBeamConvergence: 'Off',
      },
      clean: { ...DEFAULT_CLEAN_MODE_SETTINGS },
    },
  };
}

/**
 * Create default settings for a cartridge
 */
export function createDefaultSettings(title: string = 'Unknown Cartridge'): CartridgeSettings {
  return {
    title,
    display: createDefaultDisplaySettings(),
    hardware: { ...DEFAULT_HARDWARE_SETTINGS },
  };
}

/**
 * Ensure a game folder exists locally
 * First checks if a folder already exists for this cartId (regardless of title),
 * and uses that if found. Otherwise creates a new folder with the provided title.
 */
export async function ensureLocalGameFolder(cartId: string, title: string): Promise<string> {
  // First, check if a folder already exists for this cartId
  const existingFolder = await findGameFolder(LOCAL_GAMES_DIR, cartId);
  if (existingFolder) {
    return existingFolder;
  }

  // No existing folder, create a new one
  const normalizedId = cartId.toLowerCase();
  const folderName = `${title} ${normalizedId}`;
  const folderPath = path.join(LOCAL_GAMES_DIR, folderName);

  await mkdir(folderPath, { recursive: true });

  return folderPath;
}

/**
 * Save settings to local storage
 */
export async function saveLocalSettings(
  cartId: string,
  settings: CartridgeSettings
): Promise<string> {
  const folderPath = await ensureLocalGameFolder(cartId, settings.title);
  const settingsPath = path.join(folderPath, 'settings.json');

  await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

  return settingsPath;
}

/**
 * Copy settings from SD card to local storage
 */
export async function downloadSettingsFromSD(
  cartId: string,
  sdCardPath: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  const sdSettingsPath = await getSDSettingsPath(sdCardPath, cartId);

  if (!sdSettingsPath || !existsSync(sdSettingsPath)) {
    return { success: false, error: 'Settings not found on SD card' };
  }

  try {
    const settings = await readSettingsFile(sdSettingsPath);
    const localPath = await saveLocalSettings(cartId, settings);
    return { success: true, path: localPath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Delete local settings for a cartridge
 */
export async function deleteLocalSettings(cartId: string): Promise<boolean> {
  const localPath = await getLocalSettingsPath(cartId);

  if (!localPath || !existsSync(localPath)) {
    return false;
  }

  const { unlink } = await import('fs/promises');
  await unlink(localPath);
  return true;
}

/**
 * Upload local settings to SD card
 */
export async function uploadSettingsToSD(
  cartId: string,
  sdCardPath: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  // Get local settings
  const localPath = await getLocalSettingsPath(cartId);

  if (!localPath || !existsSync(localPath)) {
    return { success: false, error: 'No local settings found' };
  }

  // Find or determine SD game folder
  const gamesDir = path.join(sdCardPath, 'Library', 'N64', 'Games');
  let sdGameFolder = await findGameFolder(gamesDir, cartId);

  if (!sdGameFolder) {
    // Need to create the folder - read settings to get title
    try {
      const settings = await readSettingsFile(localPath);
      const normalizedId = cartId.toLowerCase();
      const folderName = `${settings.title} ${normalizedId}`;
      sdGameFolder = path.join(gamesDir, folderName);
      await mkdir(sdGameFolder, { recursive: true });
    } catch {
      return {
        success: false,
        error: 'Game folder not found on SD card and could not create one',
      };
    }
  }

  try {
    const settings = await readSettingsFile(localPath);
    const sdSettingsPath = path.join(sdGameFolder, 'settings.json');
    await writeFile(sdSettingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    return { success: true, path: sdSettingsPath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate hardware settings
 */
export function validateHardwareSettings(settings: Partial<HardwareSettings>): string[] {
  const errors: string[] = [];

  if (settings.region !== undefined && !REGION_VALUES.includes(settings.region)) {
    errors.push(`Invalid region: ${settings.region}`);
  }

  if (settings.overclock !== undefined && !OVERCLOCK_VALUES.includes(settings.overclock)) {
    errors.push(`Invalid overclock: ${settings.overclock}`);
  }

  return errors;
}

/**
 * Validate display mode settings
 */
export function validateDisplayMode(mode: string): boolean {
  return DISPLAY_MODE_VALUES.includes(mode as DisplayMode);
}

/**
 * Validate complete settings object
 */
export function validateSettings(settings: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof settings !== 'object' || settings === null) {
    return { valid: false, errors: ['Settings must be an object'] };
  }

  const s = settings as Record<string, unknown>;

  // Check title
  if (s.title !== undefined && typeof s.title !== 'string') {
    errors.push('Title must be a string');
  }

  // Check display
  if (s.display !== undefined) {
    if (typeof s.display !== 'object' || s.display === null) {
      errors.push('Display must be an object');
    } else {
      const display = s.display as Record<string, unknown>;
      if (display.odm !== undefined && !validateDisplayMode(display.odm as string)) {
        errors.push(`Invalid display mode: ${display.odm}`);
      }
    }
  }

  // Check hardware
  if (s.hardware !== undefined) {
    if (typeof s.hardware !== 'object' || s.hardware === null) {
      errors.push('Hardware must be an object');
    } else {
      errors.push(...validateHardwareSettings(s.hardware as Partial<HardwareSettings>));
    }
  }

  return { valid: errors.length === 0, errors };
}
