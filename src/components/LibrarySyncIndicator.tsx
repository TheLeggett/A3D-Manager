import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useSDCard, isStaticMode } from '../App';
import { ServicesContext } from '../contexts/ServicesContext';
import './LibrarySyncIndicator.css';

// Sync status states
export type LibrarySyncStatus = 'synced' | 'sync-required' | 'local-only' | 'sd-only' | 'none' | 'checking';

interface LibrarySyncContextType {
  syncStatus: LibrarySyncStatus;
  checkSyncStatus: () => Promise<void>;
  markLocalChanges: () => void;
  libraryRefreshKey: number;
  triggerLibraryRefresh: () => void;
}

const LibrarySyncContext = createContext<LibrarySyncContextType | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useLibrarySync() {
  const context = useContext(LibrarySyncContext);
  if (!context) throw new Error('useLibrarySync must be used within LibrarySyncProvider');
  return context;
}

interface LibrarySyncProviderProps {
  children: React.ReactNode;
}

export function LibrarySyncProvider({ children }: LibrarySyncProviderProps) {
  const { selectedSDCard } = useSDCard();
  const servicesContext = useContext(ServicesContext);
  const [syncStatus, setSyncStatus] = useState<LibrarySyncStatus>('local-only');
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  const prevSDCardPath = useRef<string | null>(null);

  const triggerLibraryRefresh = useCallback(() => {
    setLibraryRefreshKey(prev => prev + 1);
  }, []);

  const checkSyncStatus = useCallback(async () => {
    if (!selectedSDCard) {
      setSyncStatus('local-only');
      return;
    }

    // In static mode, use browser services to check sync status
    if (isStaticMode && servicesContext) {
      setSyncStatus('checking');
      try {
        const { libraryDb, sdCard: sdCardService } = servicesContext.services;
        const browserSDCard = servicesContext.sdCard;

        // Get local library.db status
        const localInfo = await libraryDb.getLocalLibraryDbInfo();
        const hasLocalLibrary = localInfo !== null && localInfo.exists;

        // Get SD card library.db info
        let sdInfo: { exists: boolean; size?: number; entryCount?: number; lastModified?: Date } | null = null;
        if (browserSDCard) {
          sdInfo = await sdCardService.getLibraryDbInfo(browserSDCard);
        }
        const sdHasLibrary = sdInfo?.exists === true;

        if (hasLocalLibrary && sdHasLibrary) {
          // Both exist - compare actual bytes for accuracy
          const localData = await libraryDb.getLocalLibraryDb();
          const sdData = browserSDCard ? await sdCardService.readLibraryDbFromSD(browserSDCard) : null;

          if (localData && sdData) {
            const localBytes = new Uint8Array(localData);
            const sdBytes = new Uint8Array(sdData);

            let contentMatches = localBytes.length === sdBytes.length;
            if (contentMatches) {
              for (let i = 0; i < localBytes.length; i++) {
                if (localBytes[i] !== sdBytes[i]) {
                  contentMatches = false;
                  break;
                }
              }
            }

            if (contentMatches) {
              setSyncStatus('synced');
              setHasLocalChanges(false);
            } else {
              setSyncStatus('sync-required');
            }
          } else {
            // Couldn't read one of them - fall back to metadata comparison
            const localSize = localInfo.fileSize;
            const sdSize = sdInfo?.size || 0;
            const localCount = localInfo.entryCount;
            const sdCount = sdInfo?.entryCount || 0;

            if (localSize === sdSize && localCount === sdCount) {
              setSyncStatus('synced');
              setHasLocalChanges(false);
            } else {
              setSyncStatus('sync-required');
            }
          }
        } else if (hasLocalLibrary && !sdHasLibrary) {
          // Local only
          setSyncStatus('local-only');
        } else if (!hasLocalLibrary && sdHasLibrary) {
          // SD only
          setSyncStatus('sd-only');
        } else {
          // Neither has library
          setSyncStatus('none');
        }
      } catch (err) {
        console.error('Library sync check failed (static mode):', err);
        setSyncStatus('local-only');
      }
      return;
    }

    // Server mode - use API calls
    setSyncStatus('checking');

    try {
      const response = await fetch(
        `/api/sync/library/status?sdCardPath=${encodeURIComponent(selectedSDCard.path)}`
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (errorData.error?.includes('no local')) {
          // Check if SD card has library
          const existsResponse = await fetch(
            `/api/sync/library/exists?sdCardPath=${encodeURIComponent(selectedSDCard.path)}`
          );
          if (existsResponse.ok) {
            const { exists } = await existsResponse.json();
            if (exists) {
              setSyncStatus('sd-only');
            } else {
              setSyncStatus('none');
            }
            return;
          }
        }

        setSyncStatus('local-only');
        return;
      }

      const result = await response.json();

      if (result.newerVersion === 'same') {
        setSyncStatus('synced');
        setHasLocalChanges(false);
      } else if (!result.local.exists && result.sd.exists) {
        setSyncStatus('sd-only');
      } else if (result.local.exists && !result.sd.exists) {
        setSyncStatus('local-only');
      } else if (!result.local.exists && !result.sd.exists) {
        setSyncStatus('none');
      } else {
        setSyncStatus('sync-required');
      }
    } catch (err) {
      console.error('Library sync check failed:', err);
      setSyncStatus('local-only');
    }
  }, [selectedSDCard, servicesContext]);

  // Mark that local changes have been made
  const markLocalChanges = useCallback(() => {
    if (selectedSDCard) {
      setHasLocalChanges(true);
      setSyncStatus('sync-required');
    }
  }, [selectedSDCard]);

  // Check sync status when SD card connects/disconnects
  useEffect(() => {
    const currentPath = selectedSDCard?.path ?? null;

    if (!selectedSDCard) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSyncStatus('local-only');
      prevSDCardPath.current = null;
      return;
    }

    // SD card just connected or changed
    if (currentPath !== prevSDCardPath.current) {
      prevSDCardPath.current = currentPath;
      checkSyncStatus();
    }
  }, [selectedSDCard, checkSyncStatus]);

  // Re-check if we have local changes and reconnect
  useEffect(() => {
    if (hasLocalChanges && selectedSDCard) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSyncStatus('sync-required');
    }
  }, [hasLocalChanges, selectedSDCard]);

  // Periodically re-check sync status when synced (every 30s)
  useEffect(() => {
    if (syncStatus !== 'synced' || !selectedSDCard) {
      return;
    }

    const intervalId = setInterval(() => {
      checkSyncStatus();
    }, 30000);

    return () => clearInterval(intervalId);
  }, [syncStatus, selectedSDCard, checkSyncStatus]);

  return (
    <LibrarySyncContext.Provider value={{ syncStatus, checkSyncStatus, markLocalChanges, libraryRefreshKey, triggerLibraryRefresh }}>
      {children}
    </LibrarySyncContext.Provider>
  );
}

// The indicator component
interface LibrarySyncIndicatorProps {
  onSyncClick?: () => void;
}

export function LibrarySyncIndicator({ onSyncClick }: LibrarySyncIndicatorProps) {
  const { syncStatus } = useLibrarySync();

  const getStatusConfig = () => {
    switch (syncStatus) {
      case 'synced':
        return {
          label: 'Library Synced',
          className: 'synced',
          showButton: false,
        };
      case 'sync-required':
        return {
          label: 'Library Sync Required',
          className: 'sync-required',
          showButton: true,
        };
      case 'sd-only':
        return {
          label: 'No Local Library',
          className: 'sd-only',
          showButton: true,
        };
      case 'none':
        return {
          label: 'No Library',
          className: 'none',
          showButton: false,
        };
      case 'checking':
        return {
          label: 'Checking...',
          className: 'checking',
          showButton: false,
        };
      case 'local-only':
      default:
        return {
          label: 'Local Only',
          className: 'local-only',
          showButton: false,
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className={`library-sync-indicator ${config.className}`}>
      <span className="library-sync-label text-pixel">
        {config.label}
      </span>
      {config.showButton && onSyncClick && (
        <button
          className="library-sync-button text-pixel"
          onClick={onSyncClick}
        >
          Sync Now
        </button>
      )}
      <span className="library-sync-light" />
    </div>
  );
}
