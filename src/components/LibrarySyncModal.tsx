import { useState, useEffect, useCallback, useContext } from 'react';
import { useSDCard, isStaticMode } from '../App';
import { ServicesContext } from '../contexts/ServicesContext';
import { useLibrarySync } from './LibrarySyncIndicator';
import { ProgressBar } from './ProgressBar';
import './LibrarySyncModal.css';

interface SyncStatus {
  local: {
    exists: boolean;
    entryCount: number;
    fileSize: number;
    fileSizeFormatted: string;
    lastModified?: string;
  };
  sd: {
    exists: boolean;
    entryCount: number;
    fileSize: number;
    fileSizeFormatted: string;
    lastModified?: string;
  };
  newerVersion: 'local' | 'sd' | 'same' | 'unknown';
}

interface TransferProgress {
  percentage: number;
  bytesWritten: string;
  totalBytes: string;
  speed: string;
  eta: string;
}

type SyncDirection = 'upload' | 'download';
type ModalStep = 'loading' | 'choose' | 'syncing' | 'complete' | 'error';

interface LibrarySyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}

export function LibrarySyncModal({ isOpen, onClose, onSyncComplete }: LibrarySyncModalProps) {
  const { selectedSDCard } = useSDCard();
  const { checkSyncStatus, triggerLibraryRefresh } = useLibrarySync();
  const servicesContext = useContext(ServicesContext);

  const [step, setStep] = useState<ModalStep>('loading');
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<TransferProgress>({
    percentage: 0,
    bytesWritten: '',
    totalBytes: '',
    speed: '',
    eta: '',
  });
  const [syncResult, setSyncResult] = useState<{ entryCount: number; direction: SyncDirection } | null>(null);

  const isSyncing = step === 'syncing';

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Fetch sync status when modal opens
  const fetchStatus = useCallback(async () => {
    if (!selectedSDCard) return;

    setStep('loading');
    setError(null);

    try {
      // Static mode: use browser services
      if (isStaticMode && servicesContext) {
        const { libraryDb, sdCard: sdCardService } = servicesContext.services;
        const browserSDCard = servicesContext.sdCard;

        if (!browserSDCard) {
          throw new Error('SD card not connected');
        }

        // Get local status and data
        const localInfo = await libraryDb.getLocalLibraryDbInfo();
        const localData = localInfo?.exists ? await libraryDb.getLocalLibraryDb() : null;

        // Get SD card status and data
        const sdInfo = await sdCardService.getLibraryDbInfo(browserSDCard);
        const sdData = sdInfo?.exists ? await sdCardService.readLibraryDbFromSD(browserSDCard) : null;

        const data: SyncStatus = {
          local: {
            exists: !!localInfo?.exists,
            entryCount: localInfo?.entryCount || 0,
            fileSize: localInfo?.fileSize || 0,
            fileSizeFormatted: formatSize(localInfo?.fileSize || 0),
            lastModified: localInfo?.lastModified?.toISOString(),
          },
          sd: {
            exists: !!sdInfo?.exists,
            entryCount: sdInfo?.entryCount || 0,
            fileSize: sdInfo?.size || 0,
            fileSizeFormatted: formatSize(sdInfo?.size || 0),
            lastModified: sdInfo?.lastModified?.toISOString(),
          },
          newerVersion: 'unknown',
        };

        // Determine sync status by comparing actual file content
        if (!data.local.exists && !data.sd.exists) {
          data.newerVersion = 'same';
        } else if (!data.local.exists && data.sd.exists) {
          data.newerVersion = 'sd';
        } else if (data.local.exists && !data.sd.exists) {
          data.newerVersion = 'local';
        } else if (localData && sdData) {
          // Both exist - compare actual bytes
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
            data.newerVersion = 'same';
          } else if (data.local.lastModified && data.sd.lastModified) {
            // Content differs - use timestamps to determine which is newer
            const localTime = new Date(data.local.lastModified).getTime();
            const sdTime = new Date(data.sd.lastModified).getTime();
            if (localTime > sdTime) {
              data.newerVersion = 'local';
            } else if (sdTime > localTime) {
              data.newerVersion = 'sd';
            } else {
              data.newerVersion = 'unknown';
            }
          }
        }

        setStatus(data);
        setStep('choose');
        return;
      }

      // Server mode: use API
      const response = await fetch(
        `/api/sync/library/status?sdCardPath=${encodeURIComponent(selectedSDCard.path)}`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to get sync status');
      }

      const data: SyncStatus = await response.json();
      setStatus(data);
      setStep('choose');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sync status');
      setStep('error');
    }
  }, [selectedSDCard, servicesContext]);

  useEffect(() => {
    if (isOpen && selectedSDCard) {
      fetchStatus();
    }
  }, [isOpen, selectedSDCard, fetchStatus]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('loading');
      setStatus(null);
      setError(null);
      setProgress({ percentage: 0, bytesWritten: '', totalBytes: '', speed: '', eta: '' });
      setSyncResult(null);
    }
  }, [isOpen]);

  const handleSync = async (direction: SyncDirection) => {
    if (!selectedSDCard) return;

    setStep('syncing');
    setError(null);
    setProgress({ percentage: 0, bytesWritten: '', totalBytes: '', speed: '', eta: '' });

    // Static mode: use browser services
    if (isStaticMode && servicesContext) {
      const { libraryDb, sdCard: sdCardService } = servicesContext.services;
      const browserSDCard = servicesContext.sdCard;

      if (!browserSDCard) {
        setError('SD card not connected');
        setStep('error');
        return;
      }

      try {
        // Progress callback for real-time updates
        const handleProgress = (progress: { bytesWritten: number; totalBytes: number; percentage: number }) => {
          setProgress({
            percentage: progress.percentage,
            bytesWritten: formatSize(progress.bytesWritten),
            totalBytes: formatSize(progress.totalBytes),
            speed: '',
            eta: '',
          });
        };

        if (direction === 'upload') {
          // Upload local library.db to SD card
          const localData = await libraryDb.getLocalLibraryDb();
          if (!localData) {
            throw new Error('No local library.db to upload');
          }

          // Initial progress
          setProgress({
            percentage: 0,
            bytesWritten: '0 B',
            totalBytes: formatSize(localData.byteLength),
            speed: '',
            eta: '',
          });

          // Write with progress tracking
          await sdCardService.writeLibraryDbToSD(browserSDCard, localData, handleProgress);

          // Update local lastModified timestamp to match when SD was written
          await libraryDb.touchLocalLibraryDb();

          const localInfo = await libraryDb.getLocalLibraryDbInfo();
          const syncedCount = localInfo?.entryCount || 0;
          setSyncResult({ entryCount: syncedCount, direction });
          setStep('complete');
        } else {
          // Download library.db from SD card to local
          const sdInfo = await sdCardService.getLibraryDbInfo(browserSDCard);
          if (!sdInfo?.exists) {
            throw new Error('No library.db found on SD card');
          }

          // Initial progress
          setProgress({
            percentage: 0,
            bytesWritten: '0 B',
            totalBytes: formatSize(sdInfo.size || 0),
            speed: '',
            eta: '',
          });

          // Read with progress tracking
          const sdData = await sdCardService.readLibraryDbFromSD(browserSDCard, handleProgress);
          if (!sdData) {
            throw new Error('Failed to read library.db from SD card');
          }

          // Show importing phase
          setProgress({
            percentage: 95,
            bytesWritten: formatSize(sdData.byteLength),
            totalBytes: formatSize(sdData.byteLength),
            speed: '',
            eta: '',
          });

          await libraryDb.saveLocalLibraryDb(sdData);

          setProgress({
            percentage: 100,
            bytesWritten: formatSize(sdData.byteLength),
            totalBytes: formatSize(sdData.byteLength),
            speed: '',
            eta: '',
          });

          const syncedCount = sdInfo.entryCount || 0;
          setSyncResult({ entryCount: syncedCount, direction });
          setStep('complete');
        }

        checkSyncStatus();
        triggerLibraryRefresh();
        onSyncComplete?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sync failed');
        setStep('error');
      }
      return;
    }

    // Server mode: use SSE streams
    const endpoint = direction === 'upload'
      ? '/api/sync/library/upload-stream'
      : '/api/sync/library/download-stream';

    try {
      const eventSource = new EventSource(
        `${endpoint}?sdCardPath=${encodeURIComponent(selectedSDCard.path)}`
      );

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'start':
            setProgress({
              percentage: 0,
              bytesWritten: '0 B',
              totalBytes: data.totalBytes ? formatSize(data.totalBytes) : '',
              speed: '',
              eta: '',
            });
            break;

          case 'progress':
            setProgress({
              percentage: data.percentage || 0,
              bytesWritten: data.bytesWrittenFormatted || '',
              totalBytes: data.totalBytesFormatted || '',
              speed: data.speed || '',
              eta: data.eta || '',
            });
            break;

          case 'complete':
            setSyncResult({ entryCount: data.entryCount, direction });
            setStep('complete');
            eventSource.close();
            checkSyncStatus();
            triggerLibraryRefresh();
            onSyncComplete?.();
            break;

          case 'error':
            setError(data.error);
            setStep('error');
            eventSource.close();
            break;
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setError('Connection lost during sync');
        setStep('error');
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
      setStep('error');
    }
  };

  const handleClose = () => {
    if (!isSyncing) {
      onClose();
    }
  };

  // Handle escape key - only close if not syncing
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSyncing) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isSyncing, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Determine scenario
  const hasLocal = status?.local.exists && status.local.entryCount > 0;
  const hasSD = status?.sd.exists && status.sd.entryCount > 0;
  const localOnly = hasLocal && !hasSD;
  const sdOnly = hasSD && !hasLocal;
  const bothExist = hasLocal && hasSD;
  const isSynced = bothExist && status?.newerVersion === 'same';
  const needsSync = bothExist && status?.newerVersion !== 'same';

  // Get recommendation based on newer version
  const getRecommendation = () => {
    if (!status) return null;
    switch (status.newerVersion) {
      case 'local':
        return 'Your local library is newer';
      case 'sd':
        return 'SD card library is newer';
      case 'same':
        return 'Both versions appear identical';
      default:
        return null;
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal modal-md library-sync-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2>Sync Library Stats</h2>
          {!isSyncing && (
            <button className="modal-close-btn" onClick={handleClose} aria-label="Close modal">
              &times;
            </button>
          )}
        </div>

        <div className="modal-body">
          {step === 'loading' && (
            <div className="sync-modal-loading">
              <div className="spinner" />
              <p>Checking sync status...</p>
            </div>
          )}

          {step === 'choose' && status && (
            <div className="sync-modal-choose">
              {/* Status Summary - hide when already synced */}
              {!isSynced && (
              <div className="sync-status-summary">
                <div className={`sync-status-item ${hasLocal ? 'has-data' : 'no-data'}`}>
                  <span className="sync-status-label">Local</span>
                  <span className="sync-status-value">
                    {hasLocal
                      ? `${status.local.entryCount} games (${status.local.fileSizeFormatted})`
                      : 'No library data'}
                  </span>
                  {hasLocal && status.local.lastModified && (
                    <span className="sync-status-date">
                      {new Date(status.local.lastModified).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className={`sync-status-item ${hasSD ? 'has-data' : 'no-data'}`}>
                  <span className="sync-status-label">SD Card</span>
                  <span className="sync-status-value">
                    {hasSD
                      ? `${status.sd.entryCount} games (${status.sd.fileSizeFormatted})`
                      : 'No library data'}
                  </span>
                  {hasSD && status.sd.lastModified && (
                    <span className="sync-status-date">
                      {new Date(status.sd.lastModified).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              )}

              {/* Recommendation - only show when sync is needed */}
              {needsSync && getRecommendation() && (
                <div className="sync-recommendation">
                  {getRecommendation()}
                </div>
              )}

              {/* Scenario: Local only - upload to SD */}
              {localOnly && (
                <div className="sync-scenario">
                  <p className="sync-description">
                    Your SD card doesn't have a <span className="text-code">library.db</span> file yet. Syncing will copy your
                    local play stats to the SD card.
                  </p>
                  <div className="sync-actions">
                    <button className="btn-primary" onClick={() => handleSync('upload')}>
                      Upload to SD Card
                    </button>
                    <button className="btn-secondary" onClick={handleClose}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Scenario: SD only - download to local */}
              {sdOnly && (
                <div className="sync-scenario">
                  <p className="sync-description">
                    You don't have any local library data yet. Syncing will download the play stats
                    from your SD card so you can view and edit them in this app.
                  </p>
                  <div className="sync-actions">
                    <button className="btn-primary" onClick={() => handleSync('download')}>
                      Download from SD Card
                    </button>
                    <button className="btn-secondary" onClick={handleClose}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Scenario: Both exist and are synced */}
              {isSynced && (
                <div className="sync-scenario">
                  <div className="sync-success-icon">&#10003;</div>
                  <h3>Already Synced</h3>
                  <p className="sync-description">
                    Your local library and SD card are in sync ({status.local.entryCount} games).
                  </p>
                  <div className="sync-actions">
                    <button className="btn-primary" onClick={handleClose}>
                      Done
                    </button>
                  </div>
                </div>
              )}

              {/* Scenario: Both exist but differ - choose direction */}
              {needsSync && (
                <div className="sync-scenario">
                  <p className="sync-description">
                    Your local machine and SD card have different library data. Choose which version to keep:
                  </p>
                  <div className="sync-direction-options">
                    <button
                      className={`sync-direction-btn ${status.newerVersion === 'local' ? 'recommended' : ''}`}
                      onClick={() => handleSync('upload')}
                    >
                      <span className="sync-direction-title">
                        Use Local Library
                        {status.newerVersion === 'local' && <span className="recommended-badge">Newer</span>}
                      </span>
                      <span className="sync-direction-desc">
                        Replace SD card with your local data ({status.local.entryCount} games)
                      </span>
                    </button>
                    <button
                      className={`sync-direction-btn ${status.newerVersion === 'sd' ? 'recommended' : ''}`}
                      onClick={() => handleSync('download')}
                    >
                      <span className="sync-direction-title">
                        Use SD Card Library
                        {status.newerVersion === 'sd' && <span className="recommended-badge">Newer</span>}
                      </span>
                      <span className="sync-direction-desc">
                        Replace local with SD card data ({status.sd.entryCount} games)
                      </span>
                    </button>
                  </div>
                  <div className="sync-actions">
                    <button className="btn-secondary" onClick={handleClose}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Scenario: Neither has library */}
              {!hasLocal && !hasSD && (
                <div className="sync-scenario">
                  <p className="sync-description">
                    Neither your local machine nor SD card has library data yet.
                    Play some games on your Analogue 3D to generate play statistics.
                  </p>
                  <div className="sync-actions">
                    <button className="btn-secondary" onClick={handleClose}>
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'syncing' && (
            <div className="sync-modal-progress">
              <p className="sync-progress-status">Syncing library data...</p>
              <ProgressBar
                progress={progress.percentage}
                showPercentage
                label="library.db"
                transferDetails={progress.bytesWritten ? {
                  bytesWritten: progress.bytesWritten,
                  totalBytes: progress.totalBytes,
                  speed: progress.speed || undefined,
                  eta: progress.eta || undefined,
                } : undefined}
              />
              <p className="sync-warning">Please do not close this window or remove the SD card.</p>
            </div>
          )}

          {step === 'complete' && syncResult && (
            <div className="sync-modal-complete">
              <div className="sync-success-icon">&#10003;</div>
              <h3>Sync Complete!</h3>
              <p>
                {syncResult.direction === 'upload'
                  ? `Uploaded ${syncResult.entryCount} game stats to SD card.`
                  : `Downloaded ${syncResult.entryCount} game stats from SD card.`}
              </p>
              <div className="sync-actions">
                <button className="btn-primary" onClick={handleClose}>
                  Done
                </button>
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="sync-modal-error">
              <div className="sync-error-icon">!</div>
              <h3>Sync Failed</h3>
              <p className="error-message">{error}</p>
              <div className="sync-actions">
                <button className="btn-secondary" onClick={fetchStatus}>
                  Try Again
                </button>
                <button className="btn-secondary" onClick={handleClose}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
