/**
 * Settings Auto-Save Manager
 *
 * Manages automatic saving of cartridge settings with debouncing.
 * Saves are queued and executed after n seconds of inactivity per cartridge.
 * Multiple cartridges can have pending saves simultaneously.
 */

import type { CartridgeSettings } from './defaultSettings';
import type { BrowserSDCard } from '../services/sd-card/SdCardService';

// Types for browser services
interface BrowserServices {
  settings: {
    saveLocalSettings: (cartId: string, settings: CartridgeSettings) => Promise<void>;
    uploadSettingsToSD: (sdCard: BrowserSDCard, cartId: string, gameName: string) => Promise<{ success: boolean; error?: string }>;
  };
}

interface PendingSave {
  cartId: string;
  settings: CartridgeSettings;
  sdCardPath?: string;
  browserServices?: BrowserServices;
  browserSDCard?: BrowserSDCard;
  timeoutId: number;
}

interface SaveResult {
  success: boolean;
  error?: string;
}

type SaveStatusListener = (cartId: string, status: 'pending' | 'saving' | 'saved' | 'error', error?: string) => void;

const SAVE_DELAY_MS = 2000; // 2 seconds

// Singleton state
const pendingSaves = new Map<string, PendingSave>();
const saveListeners = new Set<SaveStatusListener>();

// Static mode flag (will be set from outside)
let staticMode = false;

/**
 * Set whether we're in static mode (browser services)
 */
export function setStaticMode(isStatic: boolean): void {
  staticMode = isStatic;
}

/**
 * Queue a settings save for a cartridge.
 * If a save is already pending for this cartridge, it will be replaced.
 * The save will execute after SAVE_DELAY_MS of no new changes.
 */
export function queueSettingsSave(
  cartId: string,
  settings: CartridgeSettings,
  sdCardPath?: string,
  browserServices?: BrowserServices,
  browserSDCard?: BrowserSDCard
): void {
  // Clear existing timeout for this cartridge
  const existing = pendingSaves.get(cartId);
  if (existing?.timeoutId) {
    window.clearTimeout(existing.timeoutId);
  }

  // Log pending save
  const title = settings.title || cartId;
  console.log(`[Settings] Unsaved changes for "${title}" (${cartId})`);

  // Notify listeners of pending save
  notifyListeners(cartId, 'pending');

  // Queue new save with delay
  const timeoutId = window.setTimeout(() => {
    executeSave(cartId);
  }, SAVE_DELAY_MS);

  pendingSaves.set(cartId, {
    cartId,
    settings,
    sdCardPath,
    browserServices,
    browserSDCard,
    timeoutId,
  });
}

/**
 * Execute the save for a specific cartridge.
 * Called automatically after the debounce delay.
 */
async function executeSave(cartId: string): Promise<SaveResult> {
  const pending = pendingSaves.get(cartId);
  if (!pending) {
    return { success: false, error: 'No pending save found' };
  }

  // Remove from pending before saving
  pendingSaves.delete(cartId);

  // Notify listeners that save is in progress
  notifyListeners(cartId, 'saving');

  try {
    // Static mode: use browser services
    if (staticMode && pending.browserServices) {
      const { settings: settingsService } = pending.browserServices;

      // Save to local (IndexedDB)
      await settingsService.saveLocalSettings(cartId, pending.settings);

      // If SD card connected, also save there
      if (pending.browserSDCard) {
        const gameName = pending.settings.title || 'Unknown';
        const result = await settingsService.uploadSettingsToSD(pending.browserSDCard, cartId, gameName);
        if (!result.success) {
          throw new Error(result.error || 'Failed to sync to SD card');
        }
      }

      // Notify success
      const title = pending.settings.title || cartId;
      console.log(`[Settings] Saved "${title}" (${cartId})${pending.browserSDCard ? ' + SD card' : ''}`);
      notifyListeners(cartId, 'saved');
      return { success: true };
    }

    // Server mode: use API
    // Save to local
    const localResponse = await fetch(`/api/cartridges/${cartId}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pending.settings),
    });

    if (!localResponse.ok) {
      const data = await localResponse.json();
      throw new Error(data.error || 'Failed to save local settings');
    }

    // If SD card connected, also save there
    if (pending.sdCardPath) {
      const sdResponse = await fetch(`/api/cartridges/${cartId}/settings/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdCardPath: pending.sdCardPath }),
      });

      if (!sdResponse.ok) {
        const data = await sdResponse.json();
        throw new Error(data.error || 'Failed to sync to SD card');
      }
    }

    // Notify success
    const title = pending.settings.title || cartId;
    console.log(`[Settings] Saved "${title}" (${cartId})${pending.sdCardPath ? ' + SD card' : ''}`);
    notifyListeners(cartId, 'saved');
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Save failed';
    notifyListeners(cartId, 'error', errorMessage);
    console.error(`Auto-save failed for ${cartId}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Force immediate save of all pending settings.
 * Useful when the app is closing or user navigates away.
 */
export function flushPendingSaves(): void {
  for (const [cartId, pending] of pendingSaves) {
    window.clearTimeout(pending.timeoutId);
    executeSave(cartId);
  }
}

/**
 * Subscribe to save status changes.
 * Returns an unsubscribe function.
 */
export function onSaveStatus(listener: SaveStatusListener): () => void {
  saveListeners.add(listener);
  return () => {
    saveListeners.delete(listener);
  };
}

function notifyListeners(
  cartId: string,
  status: 'pending' | 'saving' | 'saved' | 'error',
  error?: string
): void {
  for (const listener of saveListeners) {
    try {
      listener(cartId, status, error);
    } catch (err) {
      console.error('Save status listener error:', err);
    }
  }
}

// Flush pending saves when the page is about to unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushPendingSaves();
  });
}
