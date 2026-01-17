/**
 * Settings Service (Browser)
 *
 * Manages cartridge settings using IndexedDB for persistence.
 * Provides the same API as the server-side cartridge-settings.ts.
 *
 * This service handles:
 * - Storing and retrieving per-game settings
 * - Creating default settings
 * - Syncing settings with SD card
 * - Validating settings
 */

import * as storage from '../storage/IndexedDbStorage';
import * as sdCard from '../sd-card/SdCardService';
import type { BrowserSDCard } from '../sd-card/SdCardService';
import type { CartridgeSettings } from '../../lib/defaultSettings';
import { createDefaultSettings } from '../../lib/defaultSettings';

// Re-export types from defaultSettings
export type { CartridgeSettings } from '../../lib/defaultSettings';
export { createDefaultSettings } from '../../lib/defaultSettings';

// =============================================================================
// Types
// =============================================================================

export interface SettingsInfo {
  exists: boolean;
  source: 'local' | 'sd';
  lastModified?: string;
  settings?: CartridgeSettings;
}

export interface SettingsSyncStatus {
  hasLocal: boolean;
  hasSD: boolean;
  localLastModified?: string;
  sdLastModified?: string;
}

// =============================================================================
// Settings Constants
// =============================================================================

export const BEAM_CONVERGENCE_VALUES = ['Off', 'Consumer', 'Professional'] as const;
export const IMAGE_SIZE_VALUES = ['Fill', 'Integer', 'Integer+'] as const;
export const IMAGE_FIT_VALUES = ['Original', 'Stretch', 'Cinema Zoom'] as const;
export const SHARPNESS_VALUES = ['Very Soft', 'Soft', 'Medium', 'Sharp', 'Very Sharp'] as const;
export const REGION_VALUES = ['Auto', 'NTSC', 'PAL'] as const;
export const OVERCLOCK_VALUES = ['Auto', 'Enhanced', 'Enhanced+', 'Unleashed'] as const;
export const DISPLAY_MODE_VALUES = ['bvm', 'pvm', 'crt', 'scanlines', 'clean'] as const;
export const INTERPOLATION_ALG_VALUES = ['BC Spline', 'Bilinear', 'Blackman Harris', 'Lanczos2'] as const;
export const GAMMA_TRANSFER_VALUES = ['Tube', 'Modern', 'Professional'] as const;

// =============================================================================
// Validation
// =============================================================================

/**
 * Remove trailing commas from JSON string (Analogue 3D creates invalid JSON)
 */
export function sanitizeJson(content: string): string {
  return content.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Parse and validate a settings JSON string
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
    data.display = createDefaultSettings().display;
  }

  if (!data.hardware || typeof data.hardware !== 'object') {
    data.hardware = createDefaultSettings().hardware;
  }

  return data as CartridgeSettings;
}

/**
 * Validate a display mode
 */
export function validateDisplayMode(mode: string): boolean {
  return DISPLAY_MODE_VALUES.includes(mode as typeof DISPLAY_MODE_VALUES[number]);
}

/**
 * Validate a complete settings object
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
      const hw = s.hardware as Record<string, unknown>;
      if (hw.region !== undefined && !REGION_VALUES.includes(hw.region as typeof REGION_VALUES[number])) {
        errors.push(`Invalid region: ${hw.region}`);
      }
      if (hw.overclock !== undefined && !OVERCLOCK_VALUES.includes(hw.overclock as typeof OVERCLOCK_VALUES[number])) {
        errors.push(`Invalid overclock: ${hw.overclock}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// Local Storage Operations
// =============================================================================

/**
 * Get settings for a cartridge from local storage
 */
export async function getLocalSettings(cartId: string): Promise<SettingsInfo> {
  const stored = await storage.getSettings(cartId);

  if (!stored) {
    return {
      exists: false,
      source: 'local',
    };
  }

  return {
    exists: true,
    source: 'local',
    lastModified: stored.lastModified,
    settings: stored.settings as CartridgeSettings,
  };
}

/**
 * Save settings for a cartridge to local storage
 */
export async function saveLocalSettings(cartId: string, settings: CartridgeSettings): Promise<void> {
  // Validate before saving
  const validation = validateSettings(settings);
  if (!validation.valid) {
    throw new Error(`Invalid settings: ${validation.errors.join(', ')}`);
  }

  await storage.saveSettings(cartId, settings);
}

/**
 * Delete settings for a cartridge from local storage
 */
export async function deleteLocalSettings(cartId: string): Promise<boolean> {
  const stored = await storage.getSettings(cartId);
  if (!stored) {
    return false;
  }

  await storage.deleteSettings(cartId);
  return true;
}

/**
 * Check if settings exist for a cartridge
 */
export async function hasLocalSettings(cartId: string): Promise<boolean> {
  const stored = await storage.getSettings(cartId);
  return !!stored;
}

/**
 * Get all cart IDs that have local settings
 */
export async function getCartIdsWithSettings(): Promise<string[]> {
  return storage.getSettingsCartIds();
}

// =============================================================================
// SD Card Operations
// =============================================================================

/**
 * Get settings from SD card
 */
export async function getSDSettings(
  sdCardHandle: BrowserSDCard,
  cartId: string
): Promise<SettingsInfo> {
  const settings = await sdCard.readSettingsFromSD(sdCardHandle, cartId);

  if (!settings) {
    return {
      exists: false,
      source: 'sd',
    };
  }

  return {
    exists: true,
    source: 'sd',
    settings: settings as CartridgeSettings,
  };
}

/**
 * Get settings info for both local and SD
 */
export async function getSettingsInfo(
  cartId: string,
  sdCardHandle?: BrowserSDCard
): Promise<{ local: SettingsInfo; sd: SettingsInfo | null }> {
  const local = await getLocalSettings(cartId);

  let sd: SettingsInfo | null = null;
  if (sdCardHandle) {
    sd = await getSDSettings(sdCardHandle, cartId);
  }

  return { local, sd };
}

/**
 * Download settings from SD card to local storage
 */
export async function downloadSettingsFromSD(
  sdCardHandle: BrowserSDCard,
  cartId: string
): Promise<{ success: boolean; error?: string }> {
  const sdSettings = await sdCard.readSettingsFromSD(sdCardHandle, cartId);

  if (!sdSettings) {
    return { success: false, error: 'Settings not found on SD card' };
  }

  try {
    await saveLocalSettings(cartId, sdSettings as CartridgeSettings);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Upload local settings to SD card
 */
export async function uploadSettingsToSD(
  sdCardHandle: BrowserSDCard,
  cartId: string,
  gameName: string
): Promise<{ success: boolean; error?: string }> {
  const local = await getLocalSettings(cartId);

  if (!local.exists || !local.settings) {
    return { success: false, error: 'No local settings found' };
  }

  try {
    await sdCard.writeSettingsToSD(sdCardHandle, cartId, local.settings, gameName);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// =============================================================================
// Import/Export Operations
// =============================================================================

/**
 * Import settings from a JSON file
 */
export async function importSettingsFromFile(
  cartId: string,
  file: File
): Promise<{ success: boolean; error?: string }> {
  try {
    const text = await file.text();
    const settings = parseSettings(text);
    await saveLocalSettings(cartId, settings);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Export settings to a JSON blob
 */
export async function exportSettingsToBlob(cartId: string): Promise<Blob | null> {
  const local = await getLocalSettings(cartId);

  if (!local.exists || !local.settings) {
    return null;
  }

  const json = JSON.stringify(local.settings, null, 2);
  return new Blob([json], { type: 'application/json' });
}

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * Get settings for multiple cartridges
 */
export async function getMultipleSettings(
  cartIds: string[]
): Promise<Map<string, CartridgeSettings>> {
  const result = new Map<string, CartridgeSettings>();

  for (const cartId of cartIds) {
    const local = await getLocalSettings(cartId);
    if (local.exists && local.settings) {
      result.set(cartId.toLowerCase(), local.settings);
    }
  }

  return result;
}

/**
 * Delete all local settings
 */
export async function deleteAllLocalSettings(): Promise<void> {
  await storage.clearAllSettings();
}
