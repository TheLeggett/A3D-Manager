import { useState, useEffect, useCallback } from 'react';
import { useImageCache, useSDCard } from '../App';
import { ConnectionIndicator } from './ConnectionIndicator';
import { ProgressBar } from './ProgressBar';
import { DeleteSDLabelsModal } from './DeleteSDLabelsModal';
import { DeleteLocalDataModal, type LocalDataType } from './DeleteLocalDataModal';
import { ExportBundleModal } from './ExportBundleModal';
import { ImportBundleModal } from './ImportBundleModal';
import { AddCartridgeModal } from './AddCartridgeModal';
import { LabelsImportModal } from './LabelsImportModal';
import { useLabelSync } from './LabelSyncIndicator';
import { Button } from './ui';
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

interface DetailedCompareBreakdown {
  idTableReadMs: number;
  idCompareMs: number;
  imageCompareMs: number;
}

interface PartialSyncBreakdown {
  compareMs: number;
  writeMs: number;
}

interface BenchmarkResults {
  uploadToSD: { durationMs: number; bytesWritten: number };
  createLocalDiffs: { durationMs: number; modifiedCartIds: string[] };
  quickCheck: { durationMs: number; identical: boolean };
  detailedCompare: { durationMs: number; modified: number; breakdown: DetailedCompareBreakdown };
  partialSync: { durationMs: number; entriesUpdated: number; bytesWritten: number; breakdown: PartialSyncBreakdown };
}

interface ChunkBenchmarkResult {
  label: string;
  chunkSize: number;
  chunkSizeFormatted: string;
  fsyncPerChunk: boolean;
  runs: Array<{ durationMs: number; avgSpeed: number }>;
  avgDurationMs: number;
  avgSpeed: number;
  avgSpeedFormatted: string;
}

interface LocalDataStatus {
  labels: { exists: boolean; entryCount?: number; fileSize?: number };
  ownedCarts: { exists: boolean; count: number };
  userCarts: { exists: boolean; count: number };
  gameData: { exists: boolean; folderCount: number; totalSize: number };
}

export function SettingsPage() {
  const { invalidateImageCache, lastInvalidated } = useImageCache();
  const { selectedSDCard } = useSDCard();
  const { checkSyncStatus } = useLabelSync();
  const isConnected = selectedSDCard !== null;

  const [quickResult, setQuickResult] = useState<QuickCompareResult | null>(null);
  const [detailedResult, setDetailedResult] = useState<DetailedCompareResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  // Debug benchmark state
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkPhase, setBenchmarkPhase] = useState<string>('');
  const [benchmarkProgress, setBenchmarkProgress] = useState<{
    percentage: number;
    bytesWritten: string;
    totalBytes: string;
    speed?: string;
    eta?: string;
  } | null>(null);
  const [benchmarkResults, setBenchmarkResults] = useState<BenchmarkResults | null>(null);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);

  // Chunk benchmark state
  const [chunkBenchmarkRunning, setChunkBenchmarkRunning] = useState(false);
  const [chunkBenchmarkPhase, setChunkBenchmarkPhase] = useState<string>('');
  const [chunkBenchmarkProgress, setChunkBenchmarkProgress] = useState<{
    configIndex: number;
    totalConfigs: number;
    iteration: number;
    totalIterations: number;
    label: string;
    percentage?: number;
    speed?: string;
  } | null>(null);
  const [chunkBenchmarkResults, setChunkBenchmarkResults] = useState<ChunkBenchmarkResult[] | null>(null);
  const [chunkBenchmarkError, setChunkBenchmarkError] = useState<string | null>(null);

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
      const response = await fetch('/api/local-data/status');
      if (response.ok) {
        const data = await response.json();
        setLocalDataStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch local data status:', err);
    }
  }, []);

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

  const handleDebugBenchmark = () => {
    setBenchmarkRunning(true);
    setBenchmarkError(null);
    setBenchmarkResults(null);
    setBenchmarkProgress(null);
    setBenchmarkPhase('Connecting...');

    const eventSource = new EventSource('/api/labels/debug/benchmark-stream');

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'start':
          setBenchmarkPhase('Starting benchmark...');
          break;

        case 'phase':
          setBenchmarkPhase(data.message);
          // Clear progress when entering a non-upload phase
          if (data.phase !== 'upload') {
            setBenchmarkProgress(null);
          }
          break;

        case 'progress':
          // Update progress during upload phase
          setBenchmarkProgress({
            percentage: data.percentage,
            bytesWritten: data.bytesWrittenFormatted,
            totalBytes: data.totalBytesFormatted,
            speed: data.speed,
            eta: data.eta,
          });
          break;

        case 'complete':
          setBenchmarkResults(data.results);
          setBenchmarkPhase('');
          setBenchmarkProgress(null);
          setBenchmarkRunning(false);
          eventSource.close();
          break;

        case 'error':
          setBenchmarkError(data.error);
          setBenchmarkPhase('');
          setBenchmarkProgress(null);
          setBenchmarkRunning(false);
          eventSource.close();
          break;
      }
    };

    eventSource.onerror = () => {
      setBenchmarkError('Connection to server lost');
      setBenchmarkPhase('');
      setBenchmarkProgress(null);
      setBenchmarkRunning(false);
      eventSource.close();
    };
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatMs = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(2)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  };

  const handleChunkBenchmark = () => {
    setChunkBenchmarkRunning(true);
    setChunkBenchmarkError(null);
    setChunkBenchmarkResults(null);
    setChunkBenchmarkProgress(null);
    setChunkBenchmarkPhase('Connecting...');

    const eventSource = new EventSource('/api/labels/debug/chunk-benchmark-stream?iterations=2');

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'start':
          setChunkBenchmarkPhase(`Testing ${data.totalConfigs} configurations (${data.iterations} runs each)...`);
          break;

        case 'config_start':
          setChunkBenchmarkPhase(`Testing: ${data.label}`);
          setChunkBenchmarkProgress({
            configIndex: data.configIndex,
            totalConfigs: data.totalConfigs,
            iteration: 0,
            totalIterations: 2,
            label: data.label,
          });
          break;

        case 'iteration_start':
          setChunkBenchmarkProgress(prev => prev ? {
            ...prev,
            iteration: data.iteration,
            totalIterations: data.totalIterations,
            percentage: undefined,
            speed: undefined,
          } : null);
          break;

        case 'progress':
          setChunkBenchmarkProgress(prev => prev ? {
            ...prev,
            percentage: data.percentage,
            speed: data.speed,
          } : null);
          break;

        case 'iteration_complete':
          // Progress will update on next iteration_start
          break;

        case 'config_complete':
          // Config done, will start next one
          break;

        case 'complete':
          setChunkBenchmarkResults(data.results);
          setChunkBenchmarkPhase('');
          setChunkBenchmarkProgress(null);
          setChunkBenchmarkRunning(false);
          eventSource.close();
          break;

        case 'error':
          setChunkBenchmarkError(data.error);
          setChunkBenchmarkPhase('');
          setChunkBenchmarkProgress(null);
          setChunkBenchmarkRunning(false);
          eventSource.close();
          break;
      }
    };

    eventSource.onerror = () => {
      setChunkBenchmarkError('Connection to server lost');
      setChunkBenchmarkPhase('');
      setChunkBenchmarkProgress(null);
      setChunkBenchmarkRunning(false);
      eventSource.close();
    };
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

        <section className="settings-section">
          <h2>Debug Benchmark</h2>
          <p>
            Run a comprehensive benchmark to test SD card sync performance. This will:
          </p>
          <ol className="benchmark-steps">
            <li>Upload <code>labels.db</code> from project root to SD Card <code>/Debug</code> folder</li>
            <li>Create a local <code>labels.db</code> with 50 modified entries</li>
            <li>Run Quick Check comparison</li>
            <li>Run Detailed comparison</li>
            <li>Sync only the 50 changed entries to SD Card (partial update)</li>
          </ol>

          <div className="setting-row">
            <div className="setting-info">
              <div className="compare-status">
                <ConnectionIndicator connected={isConnected} />
                <span>{isConnected ? 'SD Card Connected' : 'SD Card Not Connected'}</span>
              </div>
              {benchmarkRunning && benchmarkPhase && (
                <ProgressBar
                  progress={benchmarkProgress?.percentage}
                  showPercentage={!!benchmarkProgress}
                  label={benchmarkPhase}
                  transferDetails={benchmarkProgress ? {
                    bytesWritten: benchmarkProgress.bytesWritten,
                    totalBytes: benchmarkProgress.totalBytes,
                    speed: benchmarkProgress.speed,
                    eta: benchmarkProgress.eta,
                  } : undefined}
                  className="benchmark-progress-bar"
                />
              )}
            </div>
            <button
              className="btn-primary"
              onClick={handleDebugBenchmark}
              disabled={!isConnected || benchmarkRunning}
            >
              {benchmarkRunning ? 'Running...' : 'Run Benchmark'}
            </button>
          </div>

          {benchmarkError && (
            <div className="compare-error">
              {benchmarkError}
            </div>
          )}

          {benchmarkResults && (
            <div className="benchmark-results">
              <h4>Benchmark Results</h4>

              <div className="benchmark-card">
                <div className="benchmark-metric">
                  <span className="metric-label">Upload to SD Card</span>
                  <span className="metric-value">{formatMs(benchmarkResults.uploadToSD.durationMs)}</span>
                  <span className="metric-detail">{formatBytes(benchmarkResults.uploadToSD.bytesWritten)} written</span>
                </div>
              </div>

              <div className="benchmark-card">
                <div className="benchmark-metric">
                  <span className="metric-label">Quick Check</span>
                  <span className="metric-value">{formatMs(benchmarkResults.quickCheck.durationMs)}</span>
                  <span className="metric-detail">
                    {benchmarkResults.quickCheck.identical ? 'Identical' : 'Different'}
                  </span>
                </div>
              </div>

              <div className="benchmark-card">
                <div className="benchmark-metric">
                  <span className="metric-label">Detailed Compare</span>
                  <span className="metric-value">{formatMs(benchmarkResults.detailedCompare.durationMs)}</span>
                  <span className="metric-detail">
                    {benchmarkResults.detailedCompare.modified} modified entries found
                  </span>
                </div>
                <dl className="metric-breakdown">
                  <dt>ID Table Read</dt>
                  <dd>{formatMs(benchmarkResults.detailedCompare.breakdown.idTableReadMs)}</dd>
                  <dt>ID Compare</dt>
                  <dd>{formatMs(benchmarkResults.detailedCompare.breakdown.idCompareMs)}</dd>
                  <dt>Image Compare</dt>
                  <dd>{formatMs(benchmarkResults.detailedCompare.breakdown.imageCompareMs)}</dd>
                </dl>
              </div>

              <div className="benchmark-card highlight">
                <div className="benchmark-metric">
                  <span className="metric-label">Partial Sync (50 entries)</span>
                  <span className="metric-value">{formatMs(benchmarkResults.partialSync.durationMs)}</span>
                  <span className="metric-detail">
                    {benchmarkResults.partialSync.entriesUpdated} entries, {formatBytes(benchmarkResults.partialSync.bytesWritten)} written
                  </span>
                </div>
                <dl className="metric-breakdown">
                  <dt>Compare Time</dt>
                  <dd>{formatMs(benchmarkResults.partialSync.breakdown.compareMs)}</dd>
                  <dt>Write Time</dt>
                  <dd>{formatMs(benchmarkResults.partialSync.breakdown.writeMs)}</dd>
                </dl>
              </div>

              <div className="benchmark-summary">
                <h5>Summary</h5>
                <p>
                  Full upload: <strong>{formatMs(benchmarkResults.uploadToSD.durationMs)}</strong> for {formatBytes(benchmarkResults.uploadToSD.bytesWritten)}
                </p>
                <p>
                  Partial sync: <strong>{formatMs(benchmarkResults.partialSync.durationMs)}</strong> for {benchmarkResults.partialSync.entriesUpdated} entries ({formatBytes(benchmarkResults.partialSync.bytesWritten)})
                </p>
                <p className="speedup">
                  Partial sync is <strong>{(benchmarkResults.uploadToSD.durationMs / benchmarkResults.partialSync.durationMs).toFixed(1)}x faster</strong> than full upload
                </p>
              </div>

              <div className="modified-ids">
                <h5>Modified Cart IDs</h5>
                <p className="diff-ids">{benchmarkResults.createLocalDiffs.modifiedCartIds.join(', ')}</p>
              </div>
            </div>
          )}
        </section>

        <section className="settings-section">
          <h2>Chunk Size Benchmark</h2>
          <p>
            Test different write chunk sizes and sync settings to find the optimal configuration
            for your SD card. This uploads <code>labels.db</code> multiple times with different settings.
          </p>

          <div className="setting-row">
            <div className="setting-info">
              <div className="compare-status">
                <ConnectionIndicator connected={isConnected} />
                <span>{isConnected ? 'SD Card Connected' : 'SD Card Not Connected'}</span>
              </div>
              {chunkBenchmarkRunning && chunkBenchmarkPhase && (
                <div className="chunk-benchmark-status">
                  <ProgressBar
                    progress={chunkBenchmarkProgress?.percentage}
                    showPercentage={!!chunkBenchmarkProgress?.percentage}
                    label={chunkBenchmarkPhase}
                    className="benchmark-progress-bar"
                  />
                  {chunkBenchmarkProgress && (
                    <div className="chunk-progress-detail">
                      <span>Config {chunkBenchmarkProgress.configIndex + 1}/{chunkBenchmarkProgress.totalConfigs}</span>
                      <span>Run {chunkBenchmarkProgress.iteration + 1}/{chunkBenchmarkProgress.totalIterations}</span>
                      {chunkBenchmarkProgress.speed && <span className="text-accent">{chunkBenchmarkProgress.speed}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              className="btn-primary"
              onClick={handleChunkBenchmark}
              disabled={!isConnected || chunkBenchmarkRunning || benchmarkRunning}
            >
              {chunkBenchmarkRunning ? 'Running...' : 'Run Chunk Benchmark'}
            </button>
          </div>

          {chunkBenchmarkError && (
            <div className="compare-error">
              {chunkBenchmarkError}
            </div>
          )}

          {chunkBenchmarkResults && (
            <div className="chunk-benchmark-results">
              <h4>Results (sorted by speed)</h4>
              <table className="chunk-results-table">
                <thead>
                  <tr>
                    <th>Configuration</th>
                    <th>Avg Duration</th>
                    <th>Avg Speed</th>
                    <th>Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {chunkBenchmarkResults.map((result, index) => (
                    <tr key={result.label} className={index === 0 ? 'fastest' : ''}>
                      <td>
                        <span className="config-label">{result.label}</span>
                      </td>
                      <td className="text-mono">{formatMs(result.avgDurationMs)}</td>
                      <td className="text-mono text-accent">{result.avgSpeedFormatted}</td>
                      <td>
                        {index === 0 && <span className="rank-badge fastest">Fastest</span>}
                        {index === chunkBenchmarkResults.length - 1 && <span className="rank-badge slowest">Slowest</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="chunk-benchmark-summary">
                <p>
                  <strong>Recommendation:</strong> Use <code>{chunkBenchmarkResults[0].label}</code> for best performance
                  ({chunkBenchmarkResults[0].avgSpeedFormatted})
                </p>
                {chunkBenchmarkResults.length > 1 && (
                  <p className="text-muted">
                    Fastest is <strong>{(chunkBenchmarkResults[0].avgSpeed / chunkBenchmarkResults[chunkBenchmarkResults.length - 1].avgSpeed).toFixed(1)}x</strong> faster than slowest ({chunkBenchmarkResults[chunkBenchmarkResults.length - 1].label})
                  </p>
                )}
              </div>
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
