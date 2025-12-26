import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useSDCard } from '../App';
import './LabelSyncIndicator.css';

// Sync status states
export type LabelSyncStatus = 'synced' | 'sync-required' | 'local-only' | 'sd-only' | 'none' | 'checking';

interface LabelSyncContextType {
  syncStatus: LabelSyncStatus;
  checkSyncStatus: () => Promise<void>;
  markLocalChanges: () => void;
  labelsRefreshKey: number;
  triggerLabelsRefresh: () => void;
}

const LabelSyncContext = createContext<LabelSyncContextType | null>(null);

export function useLabelSync() {
  const context = useContext(LabelSyncContext);
  if (!context) throw new Error('useLabelSync must be used within LabelSyncProvider');
  return context;
}

interface LabelSyncProviderProps {
  children: React.ReactNode;
}

export function LabelSyncProvider({ children }: LabelSyncProviderProps) {
  const { selectedSDCard } = useSDCard();
  const [syncStatus, setSyncStatus] = useState<LabelSyncStatus>('local-only');
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const [labelsRefreshKey, setLabelsRefreshKey] = useState(0);
  const prevSDCardPath = useRef<string | null>(null);

  const triggerLabelsRefresh = useCallback(() => {
    setLabelsRefreshKey(prev => prev + 1);
  }, []);

  const checkSyncStatus = useCallback(async () => {
    if (!selectedSDCard) {
      setSyncStatus('local-only');
      return;
    }

    setSyncStatus('checking');

    try {
      const response = await fetch('/api/labels/compare/quick');
      if (!response.ok) {
        // Check if the error is specifically about no local labels.db
        const errorData = await response.json().catch(() => ({}));

        if (errorData.error === 'No local labels.db found') {
          // Fast check if SD card has labels
          const existsResponse = await fetch(
            `/api/sync/labels/exists?sdCardPath=${encodeURIComponent(selectedSDCard.path)}`
          );
          if (existsResponse.ok) {
            const { exists } = await existsResponse.json();
            if (exists) {
              // SD card has labels but local doesn't
              setSyncStatus('sd-only');
            } else {
              // Neither local nor SD card has labels
              setSyncStatus('none');
            }
            return;
          }
        }

        setSyncStatus('local-only');
        return;
      }

      const result = await response.json();

      if (result.identical) {
        setSyncStatus('synced');
        setHasLocalChanges(false);
      } else {
        setSyncStatus('sync-required');
      }
    } catch (err) {
      console.error('Label sync check failed:', err);
      setSyncStatus('local-only');
    }
  }, [selectedSDCard]);

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
      setSyncStatus('sync-required');
    }
  }, [hasLocalChanges, selectedSDCard]);

  // Periodically re-check sync status when synced (every 30s)
  // This catches external changes made outside the app
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
    <LabelSyncContext.Provider value={{ syncStatus, checkSyncStatus, markLocalChanges, labelsRefreshKey, triggerLabelsRefresh }}>
      {children}
    </LabelSyncContext.Provider>
  );
}

// The indicator component
interface LabelSyncIndicatorProps {
  onSyncClick?: () => void;
}

export function LabelSyncIndicator({ onSyncClick }: LabelSyncIndicatorProps) {
  const { syncStatus } = useLabelSync();

  const getStatusConfig = () => {
    switch (syncStatus) {
      case 'synced':
        return {
          label: 'Labels Synced',
          className: 'synced',
          showButton: false,
        };
      case 'sync-required':
        return {
          label: 'Labels Sync Required',
          className: 'sync-required',
          showButton: true,
        };
      case 'sd-only':
        return {
          label: 'No Local Labels',
          className: 'sd-only',
          showButton: true,
        };
      case 'none':
        return {
          label: 'No Labels',
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
    <div className={`label-sync-indicator ${config.className}`}>
      <span className="label-sync-label text-pixel">
        {config.label}
      </span>
      {config.showButton && onSyncClick && (
        <button
          className="label-sync-button text-pixel"
          onClick={onSyncClick}
        >
          Sync Now
        </button>
      )}
      <span className="label-sync-light" />
    </div>
  );
}
