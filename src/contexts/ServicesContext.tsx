/**
 * Services Context
 *
 * Provides all browser services to React components via context.
 * Handles initialization, SD card state, and service access.
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import * as labelsDbService from '../services/labels/LabelsDbService';
import * as libraryDbService from '../services/library/LibraryDbService';
import * as sdCardService from '../services/sd-card/SdCardService';
import * as settingsService from '../services/settings/SettingsService';
import * as gamePakService from '../services/game-pak/GamePakService';
import * as bundleService from '../services/bundle/BundleService';
import * as browserCheck from '../services/browser/BrowserCheck';
import * as storage from '../services/storage/IndexedDbStorage';
import * as imageProcessor from '../services/image/ImageProcessor';
import type { BrowserSDCard } from '../services/sd-card/SdCardService';
import type { CompatibilityResult } from '../services/browser/BrowserCheck';

// =============================================================================
// Types
// =============================================================================

export interface ServicesContextType {
  // Browser compatibility
  compatibility: CompatibilityResult;
  isFullySupported: boolean;

  // SD Card state
  sdCard: BrowserSDCard | null;
  isSDCardConnected: boolean;
  selectSDCard: () => Promise<BrowserSDCard | null>;
  disconnectSDCard: () => void;

  // Service exports (for direct access)
  services: {
    labelsDb: typeof labelsDbService;
    libraryDb: typeof libraryDbService;
    sdCard: typeof sdCardService;
    settings: typeof settingsService;
    gamePak: typeof gamePakService;
    bundle: typeof bundleService;
    browserCheck: typeof browserCheck;
    storage: typeof storage;
    imageProcessor: typeof imageProcessor;
  };

  // Initialization state
  isInitialized: boolean;
  initError: string | null;
}

// =============================================================================
// Context
// =============================================================================

// Export the context so components can use useContext directly if needed
export const ServicesContext = createContext<ServicesContextType | null>(null);

/**
 * Hook to access services context
 */
export function useServices(): ServicesContextType {
  const context = useContext(ServicesContext);
  if (!context) {
    throw new Error('useServices must be used within a ServicesProvider');
  }
  return context;
}

/**
 * Hook to access the SD card state
 */
export function useSDCardState() {
  const { sdCard, isSDCardConnected, selectSDCard, disconnectSDCard } = useServices();
  return { sdCard, isSDCardConnected, selectSDCard, disconnectSDCard };
}

/**
 * Hook to check if File System Access is available
 */
export function useFileSystemAccess() {
  const { compatibility } = useServices();
  return {
    isAvailable: compatibility.browser.hasFileSystemAccess,
    isChromium: compatibility.browser.isChromium,
  };
}

// =============================================================================
// Provider Component
// =============================================================================

interface ServicesProviderProps {
  children: ReactNode;
}

export function ServicesProvider({ children }: ServicesProviderProps) {
  // Browser compatibility (computed once on mount)
  const [compatibility] = useState<CompatibilityResult>(() =>
    browserCheck.checkBrowserCompatibility()
  );

  // SD Card state
  const [sdCard, setSDCard] = useState<BrowserSDCard | null>(null);

  // Initialization state
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Initialize storage on mount
  useEffect(() => {
    async function init() {
      try {
        // Just getting the DB initializes it
        await storage.getDb();
        setIsInitialized(true);
      } catch (err) {
        setInitError(err instanceof Error ? err.message : 'Failed to initialize storage');
        setIsInitialized(true); // Still mark as initialized to show error
      }
    }

    init();

    // Cleanup on unmount
    return () => {
      storage.closeDb();
    };
  }, []);

  // Try to restore last selected SD card on mount
  useEffect(() => {
    async function restoreSDCard() {
      if (!compatibility.browser.hasFileSystemAccess) return;

      const lastCard = await sdCardService.getLastSelectedSDCard();
      if (lastCard) {
        setSDCard(lastCard);
      }
    }

    if (isInitialized) {
      restoreSDCard();
    }
  }, [isInitialized, compatibility.browser.hasFileSystemAccess]);

  // Select SD card via directory picker
  const selectSDCard = useCallback(async (): Promise<BrowserSDCard | null> => {
    // Try to use the API directly - the browser will throw if it's not available
    // This is more reliable than feature detection which can be affected by privacy settings
    try {
      const selected = await sdCardService.selectSDCardDirectory();

      if (selected) {
        sdCardService.setLastSelectedHandle(selected.handle);
        setSDCard(selected);

        if (!selected.isValid) {
          console.warn('Selected directory is not a valid Analogue 3D SD card');
        }
      }

      return selected;
    } catch (err) {
      // Check if this is a "not supported" error vs user cancellation
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          // User cancelled - just return null
          return null;
        }
        if (err.message.includes('showDirectoryPicker') || err.name === 'TypeError') {
          throw new Error(
            'File System Access API is not available. Please use Chrome, Edge, Brave, or Arc browser with HTTPS.'
          );
        }
      }
      throw err;
    }
  }, []);

  // Disconnect SD card
  const disconnectSDCard = useCallback(() => {
    sdCardService.clearLastSelectedHandle();
    setSDCard(null);
  }, []);

  // Services object (stable reference)
  const services = {
    labelsDb: labelsDbService,
    libraryDb: libraryDbService,
    sdCard: sdCardService,
    settings: settingsService,
    gamePak: gamePakService,
    bundle: bundleService,
    browserCheck,
    storage,
    imageProcessor,
  };

  const value: ServicesContextType = {
    compatibility,
    isFullySupported: compatibility.browser.isFullySupported,

    sdCard,
    isSDCardConnected: sdCard !== null && sdCard.isValid,
    selectSDCard,
    disconnectSDCard,

    services,

    isInitialized,
    initError,
  };

  return (
    <ServicesContext.Provider value={value}>
      {children}
    </ServicesContext.Provider>
  );
}

// =============================================================================
// Convenience Hooks for Specific Services
// =============================================================================

/**
 * Hook to access labels database service
 */
export function useLabelsDb() {
  const { services, sdCard } = useServices();
  return {
    ...services.labelsDb,
    sdCard,
  };
}

/**
 * Hook to access settings service
 */
export function useSettingsService() {
  const { services, sdCard } = useServices();
  return {
    ...services.settings,
    sdCard,
  };
}

/**
 * Hook to access game pak service
 */
export function useGamePakService() {
  const { services, sdCard } = useServices();
  return {
    ...services.gamePak,
    sdCard,
  };
}

/**
 * Hook to access bundle service
 */
export function useBundleService() {
  const { services } = useServices();
  return services.bundle;
}

/**
 * Hook to access image processor
 */
export function useImageProcessor() {
  const { services } = useServices();
  return services.imageProcessor;
}

/**
 * Hook to access storage directly
 */
export function useStorage() {
  const { services } = useServices();
  return services.storage;
}

/**
 * Hook to access library database service
 */
export function useLibraryDb() {
  const { services, sdCard } = useServices();
  return {
    ...services.libraryDb,
    sdCard,
  };
}
