import { useState, useEffect, useCallback, useContext } from 'react';
import { useImageCache, useSDCard, isStaticMode } from '../App';
import { ServicesContext } from '../contexts/ServicesContext';
import { ConnectionIndicator } from './ConnectionIndicator';
import { DeleteSDLabelsModal } from './DeleteSDLabelsModal';
import { DeleteLocalDataModal, type LocalDataType } from './DeleteLocalDataModal';
import { ExportBundleModal } from './ExportBundleModal';
import { ImportBundleModal } from './ImportBundleModal';
import { AddCartridgeModal } from './AddCartridgeModal';
import { LabelsImportModal } from './LabelsImportModal';
import { useLabelSync } from './LabelSyncIndicator';
import { Button } from './ui';
import { usePageTitle, SEO_TITLES } from '../lib/seo';
import './SettingsPage.css';

interface QuickCompareResult {
  identical: boolean;
  reason?: string;
  localSize: number;
  otherSize: number;
  localEntryCount: number;
  otherEntryCount: number;
  durationMs: number;
}

interface DetailedCompareResult {
  identical: boolean;
  onlyInLocal: string[];
  onlyInOther: string[];
  modified: string[];
  totalCompared: number;
  durationMs: number;
  breakdown: {
    idTableReadMs: number;
    idCompareMs: number;
    imageCompareMs: number;
  };
}

interface LocalDataStatus {
  labels: { exists: boolean; entryCount?: number; fileSize?: number };
  ownedCarts: { exists: boolean; count: number };
  userCarts: { exists: boolean; count: number };
  gameData: { exists: boolean; folderCount: number; totalSize: number };
}

export function SettingsPage() {
  usePageTitle(SEO_TITLES.settings);
  const { invalidateImageCache, lastInvalidated } = useImageCache();
  const { selectedSDCard } = useSDCard();
  const { checkSyncStatus } = useLabelSync();
  const servicesContext = useContext(ServicesContext);
  const isConnected = selectedSDCard !== null;

  const [quickResult, setQuickResult] = useState<QuickCompareResult | null>(null);
  const [detailedResult, setDetailedResult] = useState<DetailedCompareResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  // Delete SD labels modal state
  const [showDeleteSDLabelsModal, setShowDeleteSDLabelsModal] = useState(false);

  // Export/Import bundle modal state
  const [showExportBundleModal, setShowExportBundleModal] = useState(false);
  const [showImportBundleModal, setShowImportBundleModal] = useState(false);

  // Add cartridge modal state
  const [showAddCartridgeModal, setShowAddCartridgeModal] = useState(false);

  // Labels import modal state
  const [showLabelsImportModal, setShowLabelsImportModal] = useState(false);

  // Advanced settings visibility
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Local data state
  const [localDataStatus, setLocalDataStatus] = useState<LocalDataStatus | null>(null);
  const [showDeleteLocalDataModal, setShowDeleteLocalDataModal] = useState(false);
  const [deleteDataType, setDeleteDataType] = useState<LocalDataType>('labels');

  const fetchLocalDataStatus = useCallback(async () => {
    try {
      // Static mode: use browser services
      if (isStaticMode && servicesContext) {
        const { storage, labelsDb, settings, gamePak } = servicesContext.services;

        // Get labels status
        const labelsStatus = await labelsDb.getLabelsDbStatus();

        // Get owned carts count
        const ownedCartIds = await storage.getOwnedCartIds();

        // Get user carts count
        const userCarts = await storage.getUserCarts();

        // Get settings and game pak counts
        const settingsCartIds = await settings.getCartIdsWithSettings();
        const gamePakCartIds = await gamePak.getCartIdsWithGamePaks();

        // Combine for unique game folder count
        const gameDataIds = new Set([...settingsCartIds, ...gamePakCartIds]);

        const data: LocalDataStatus = {
          labels: {
            exists: !!labelsStatus?.exists,
            entryCount: labelsStatus?.entryCount,
            fileSize: labelsStatus?.fileSize,
          },
          ownedCarts: {
            exists: ownedCartIds.length > 0,
            count: ownedCartIds.length,
          },
          userCarts: {
            exists: userCarts.length > 0,
            count: userCarts.length,
          },
          gameData: {
            exists: gameDataIds.size > 0,
            folderCount: gameDataIds.size,
            totalSize: 0, // Could calculate if needed
          },
        };

        setLocalDataStatus(data);
        return;
      }

      // Server mode: use API
      const response = await fetch('/api/local-data/status');
      if (response.ok) {
        const data = await response.json();
        setLocalDataStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch local data status:', err);
    }
  }, [servicesContext]);

  useEffect(() => {
    fetchLocalDataStatus();
  }, [fetchLocalDataStatus]);

  const handleDeleteLocalData = (type: LocalDataType) => {
    setDeleteDataType(type);
    setShowDeleteLocalDataModal(true);
  };

  const handleClearCache = () => {
    invalidateImageCache();
  };

  const handleQuickCompare = async () => {
    setComparing(true);
    setCompareError(null);
    setQuickResult(null);
    setDetailedResult(null);

    try {
      const response = await fetch('/api/labels/compare/quick');
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Comparison failed');
      }
      const result = await response.json();
      setQuickResult(result);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setComparing(false);
    }
  };

  const handleDetailedCompare = async (fullHash = false) => {
    setComparing(true);
    setCompareError(null);
    setDetailedResult(null);

    try {
      const response = await fetch(`/api/labels/compare/detailed?fullHash=${fullHash}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Comparison failed');
      }
      const result = await response.json();
      setDetailedResult(result);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setComparing(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="settings-page">
      <div className="settings-content">
        <h1>Settings</h1>

        {/* Backup & Restore */}
        <section className="settings-section">
          <h2>Backup & Restore</h2>
          <p>
            Create portable backups of your data or restore from a previous backup.
            Bundles use the <span className="text-code">.a3d</span> format and can be shared between devices.
          </p>

          <div className="setting-row">
            <div className="setting-info">
              <h3>Export Bundle</h3>
              <p className="setting-description">
                Create a backup file containing your labels, owned cartridge list, per-game settings,
                and controller pak saves. Use this to back up your data or transfer it to another computer.
              </p>
            </div>
            <Button variant="primary" onClick={() => setShowExportBundleModal(true)}>
              Export Bundle
            </Button>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <h3>Import Bundle</h3>
              <p className="setting-description">
                Restore data from a previously exported <span className="text-code">.a3d</span> bundle file.
                You can choose which data to import and how to handle conflicts with existing data.
              </p>
            </div>
            <Button variant="secondary" onClick={() => setShowImportBundleModal(true)}>
              Import Bundle
            </Button>
          </div>
        </section>

        {/* Import labels.db */}
        <section className="settings-section">
          <h2>Import Labels Database</h2>
          <p>
            Import a <span className="text-code">labels.db</span> file containing cartridge label artwork.
            This file displays on the N64 game carousel in the Analogue 3D UI.
          </p>

          <div className="setting-row">
            <div className="setting-info">
              <h3>Import labels.db</h3>
              <p className="setting-description">
                Import a labels.db file from your computer. This is useful for restoring from a backup
                or using a community-shared collection like{' '}
                <a
                  href="https://github.com/retrogamecorps/Analogue-3D-Images"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  retrogamecorps/Analogue-3D-Images
                </a>.
              </p>
              {localDataStatus?.labels.exists && (
                <p className="setting-meta">
                  Current: {localDataStatus.labels.entryCount} labels ({formatBytes(localDataStatus.labels.fileSize || 0)})
                </p>
              )}
            </div>
            <Button variant="secondary" onClick={() => setShowLabelsImportModal(true)}>
              Import labels.db
            </Button>
          </div>
        </section>

        <section className="settings-section">
          <h2>Image Cache</h2>
          <p>
            If you're seeing stale or incorrect label artwork, you can clear the image cache
            to force all images to be reloaded from the server.
          </p>

          <div className="setting-row">
            <div className="setting-info">
              <h3>Clear Image Cache</h3>
              <p className="setting-description">
                Invalidates the client-side cache for all label images. This will cause
                all images to be re-fetched on the next page load.
              </p>
              {lastInvalidated > 0 && (
                <p className="setting-meta">
                  Last cleared: {new Date(lastInvalidated).toLocaleString()}
                </p>
              )}
            </div>
            <button className="btn-primary" onClick={handleClearCache}>
              Clear Cache
            </button>
          </div>
        </section>

        {/* Local Data Management */}
        <section className="settings-section settings-section--danger">
          <h2>Local Data</h2>
          <p>
            Manage data stored locally by the application. Deleting this data cannot be undone.
          </p>

          {localDataStatus && (
            <>
              <div className="setting-row setting-row--danger">
                <div className="setting-info">
                  <h3>Labels Database</h3>
                  <p className="setting-description">
                    Your local <span className="text-code">labels.db</span> containing cartridge artwork.
                  </p>
                  {localDataStatus.labels.exists ? (
                    <p className="setting-meta">
                      {localDataStatus.labels.entryCount} cartridges ({formatBytes(localDataStatus.labels.fileSize || 0)})
                    </p>
                  ) : (
                    <p className="setting-meta">No labels database</p>
                  )}
                </div>
                <Button
                  variant="danger"
                  onClick={() => handleDeleteLocalData('labels')}
                  disabled={!localDataStatus.labels.exists}
                >
                  Delete
                </Button>
              </div>

              <div className="setting-row setting-row--danger">
                <div className="setting-info">
                  <h3>Owned Cartridges</h3>
                  <p className="setting-description">
                    Your list of cartridges marked as owned.
                  </p>
                  <p className="setting-meta">
                    {localDataStatus.ownedCarts.count} cartridges
                  </p>
                </div>
                <Button
                  variant="danger"
                  onClick={() => handleDeleteLocalData('owned-carts')}
                  disabled={localDataStatus.ownedCarts.count === 0}
                >
                  Clear
                </Button>
              </div>

              <div className="setting-row setting-row--danger">
                <div className="setting-info">
                  <h3>Custom Cart Names</h3>
                  <p className="setting-description">
                    Names you've assigned to unrecognized cartridges.
                  </p>
                  <p className="setting-meta">
                    {localDataStatus.userCarts.count} custom names
                  </p>
                </div>
                <Button
                  variant="danger"
                  onClick={() => handleDeleteLocalData('user-carts')}
                  disabled={!localDataStatus.userCarts.exists || localDataStatus.userCarts.count === 0}
                >
                  Delete
                </Button>
              </div>

              <div className="setting-row setting-row--danger">
                <div className="setting-info">
                  <h3>Game Settings & Data</h3>
                  <p className="setting-description">
                    Per-game settings and <span className="text-code">game_pak.bin</span> files stored locally.
                  </p>
                  <p className="setting-meta">
                    {localDataStatus.gameData.folderCount} games ({formatBytes(localDataStatus.gameData.totalSize)})
                  </p>
                </div>
                <Button
                  variant="danger"
                  onClick={() => handleDeleteLocalData('game-data')}
                  disabled={localDataStatus.gameData.folderCount === 0}
                >
                  Delete
                </Button>
              </div>

              <div className="setting-row setting-row--danger setting-row--reset">
                <div className="setting-info">
                  <h3>Reset All Local Data</h3>
                  <p className="setting-description">
                    Delete all local data and completely reset the application to its initial state.
                  </p>
                </div>
                <Button
                  variant="danger"
                  onClick={() => handleDeleteLocalData('all')}
                >
                  Reset Everything
                </Button>
              </div>
            </>
          )}
        </section>

        {/* SD Card Danger Zone - only show when SD card connected */}
        {isConnected && selectedSDCard && (
          <section className="settings-section settings-section--danger">
            <h2>SD Card</h2>
            <p>
              Destructive actions on your connected SD card. These cannot be undone.
            </p>

            <div className="setting-row setting-row--danger">
              <div className="setting-info">
                <h3>Delete Labels from SD Card</h3>
                <p className="setting-description">
                  Permanently delete the <span className="text-code">labels.db</span> file from your connected SD card.
                  This will remove all custom cartridge artwork from your Analogue 3D.
                </p>
                <p className="setting-meta">
                  SD Card: {selectedSDCard.path}
                </p>
              </div>
              <Button
                variant="danger"
                onClick={() => setShowDeleteSDLabelsModal(true)}
              >
                Delete labels.db
              </Button>
            </div>
          </section>
        )}

        {/* Advanced Settings Toggle */}
        <Button
          variant="secondary"
          onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
          style={{ marginBottom: 24 }}
        >
          {showAdvancedSettings ? 'Hide' : 'Show'} Advanced Settings
        </Button>

        {showAdvancedSettings && (
          <>
            {/* Add Cartridge Manually */}
            <section className="settings-section">
              <h2>Add Cartridge Manually</h2>
              <p>
                This is an advanced feature for users who need to add label artwork for a cartridge
                they don't physically own, or when automatic detection isn't available.
              </p>

              <div className="setting-row">
                <div className="setting-info">
                  <h3>Why Cart IDs Are Required</h3>
                  <p className="setting-description">
                    The Analogue 3D identifies each N64 cartridge using an 8-character hex ID (e.g., <span className="text-code">b393776d</span>).
                    This ID is computed by taking a CRC32 checksum of the first 8 KiB of the ROM data.
                    When you insert a cartridge, the console reads this data and generates the ID to look up
                    the corresponding artwork in <span className="text-code">labels.db</span>.
                  </p>
                  <p className="setting-description">
                    <strong>For most users:</strong> The easiest approach is to insert your cartridges into your Analogue 3D,
                    then use "Import Games from SD Card" on the Cartridges page. This automatically discovers
                    the correct Cart IDs for all your games.
                  </p>
                  <p className="setting-meta">
                    If you need to compute a Cart ID from a ROM file, use the included helper script:<br />
                    <span className="text-code">npx tsx scripts/compute-a3d-id.ts path/to/game.z64</span>
                  </p>
                </div>
                <Button variant="secondary" onClick={() => setShowAddCartridgeModal(true)}>
                  Add by Cart ID
                </Button>
              </div>
            </section>

            <section className="settings-section">
              <h2>Labels Database Comparison</h2>
              <p>
                Compare your local labels.db with the one on your SD card to detect differences.
              </p>

          <div className="setting-row">
            <div className="setting-info">
              <div className="compare-status">
                <ConnectionIndicator connected={isConnected} />
                <span>{isConnected ? 'SD Card Connected' : 'SD Card Not Connected'}</span>
              </div>
              <p className="setting-description">
                <strong>Quick Check:</strong> Compares file sizes and ID tables (~4KB read).
                Fast but won't detect modified images with same cart IDs.
              </p>
            </div>
            <button
              className="btn-secondary"
              onClick={handleQuickCompare}
              disabled={!isConnected || comparing}
            >
              {comparing ? 'Comparing...' : 'Quick Check'}
            </button>
          </div>

          <div className="setting-row">
            <div className="setting-info">
              <p className="setting-description">
                <strong>Detailed Compare:</strong> Finds exactly which entries differ by comparing
                image data hashes. Uses sampling (first + last 1KB per image) for speed.
              </p>
            </div>
            <div className="button-group">
              <button
                className="btn-secondary"
                onClick={() => handleDetailedCompare(false)}
                disabled={!isConnected || comparing}
              >
                {comparing ? 'Comparing...' : 'Detailed (Fast)'}
              </button>
              <button
                className="btn-ghost"
                onClick={() => handleDetailedCompare(true)}
                disabled={!isConnected || comparing}
                title="Compares full image data - slower but more accurate"
              >
                Full Hash
              </button>
            </div>
          </div>

          {compareError && (
            <div className="compare-error">
              {compareError}
            </div>
          )}

          {quickResult && (
            <div className="compare-results">
              <h4>Quick Compare Results</h4>
              <div className={`result-badge ${quickResult.identical ? 'identical' : 'different'}`}>
                {quickResult.identical ? 'Identical' : 'Different'}
              </div>
              <dl className="result-details">
                <dt>Duration</dt>
                <dd>{quickResult.durationMs.toFixed(2)} ms</dd>
                <dt>Local</dt>
                <dd>{formatBytes(quickResult.localSize)} ({quickResult.localEntryCount} entries)</dd>
                <dt>SD Card</dt>
                <dd>{formatBytes(quickResult.otherSize)} ({quickResult.otherEntryCount} entries)</dd>
                {quickResult.reason && (
                  <>
                    <dt>Reason</dt>
                    <dd>{quickResult.reason.replace(/_/g, ' ')}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {detailedResult && (
            <div className="compare-results">
              <h4>Detailed Compare Results</h4>
              <div className={`result-badge ${detailedResult.identical ? 'identical' : 'different'}`}>
                {detailedResult.identical ? 'Identical' : `${detailedResult.onlyInLocal.length + detailedResult.onlyInOther.length + detailedResult.modified.length} Differences`}
              </div>
              <dl className="result-details">
                <dt>Total Duration</dt>
                <dd>{detailedResult.durationMs.toFixed(2)} ms</dd>
                <dt>ID Table Read</dt>
                <dd>{detailedResult.breakdown.idTableReadMs.toFixed(2)} ms</dd>
                <dt>ID Compare</dt>
                <dd>{detailedResult.breakdown.idCompareMs.toFixed(2)} ms</dd>
                <dt>Image Compare</dt>
                <dd>{detailedResult.breakdown.imageCompareMs.toFixed(2)} ms ({detailedResult.totalCompared} images)</dd>
              </dl>

              {!detailedResult.identical && (
                <div className="diff-summary">
                  {detailedResult.onlyInLocal.length > 0 && (
                    <div className="diff-group">
                      <h5>Only in Local ({detailedResult.onlyInLocal.length})</h5>
                      <p className="diff-ids">{detailedResult.onlyInLocal.slice(0, 10).join(', ')}{detailedResult.onlyInLocal.length > 10 ? '...' : ''}</p>
                    </div>
                  )}
                  {detailedResult.onlyInOther.length > 0 && (
                    <div className="diff-group">
                      <h5>Only on SD Card ({detailedResult.onlyInOther.length})</h5>
                      <p className="diff-ids">{detailedResult.onlyInOther.slice(0, 10).join(', ')}{detailedResult.onlyInOther.length > 10 ? '...' : ''}</p>
                    </div>
                  )}
                  {detailedResult.modified.length > 0 && (
                    <div className="diff-group">
                      <h5>Modified Images ({detailedResult.modified.length})</h5>
                      <p className="diff-ids">{detailedResult.modified.slice(0, 10).join(', ')}{detailedResult.modified.length > 10 ? '...' : ''}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
          </>
        )}
      </div>

      {/* Modals */}
      {selectedSDCard && (
        <DeleteSDLabelsModal
          isOpen={showDeleteSDLabelsModal}
          onClose={() => setShowDeleteSDLabelsModal(false)}
          onDeleted={() => {
            checkSyncStatus(); // Update sync indicator
          }}
          sdCardPath={selectedSDCard.path}
        />
      )}

      <DeleteLocalDataModal
        isOpen={showDeleteLocalDataModal}
        onClose={() => setShowDeleteLocalDataModal(false)}
        onDeleted={() => {
          fetchLocalDataStatus();
          checkSyncStatus(); // Update sync indicator
        }}
        dataType={deleteDataType}
      />

      <ExportBundleModal
        isOpen={showExportBundleModal}
        onClose={() => setShowExportBundleModal(false)}
      />

      <ImportBundleModal
        isOpen={showImportBundleModal}
        onClose={() => setShowImportBundleModal(false)}
        onImportComplete={() => {
          fetchLocalDataStatus();
          checkSyncStatus();
        }}
      />

      <AddCartridgeModal
        isOpen={showAddCartridgeModal}
        onClose={() => setShowAddCartridgeModal(false)}
        onAdd={() => {
          fetchLocalDataStatus();
          checkSyncStatus();
        }}
      />

      <LabelsImportModal
        isOpen={showLabelsImportModal}
        onClose={() => setShowLabelsImportModal(false)}
        onImportComplete={() => {
          fetchLocalDataStatus();
          checkSyncStatus();
        }}
        currentStatus={localDataStatus?.labels.exists ? {
          hasLabels: true,
          entryCount: localDataStatus.labels.entryCount,
          fileSizeMB: localDataStatus.labels.fileSize
            ? (localDataStatus.labels.fileSize / (1024 * 1024)).toFixed(2)
            : undefined,
        } : null}
      />
    </div>
  );
}
