import { useState, useEffect, useCallback } from 'react';
import { useSDCard } from '../App';

interface SyncPreview {
  folderRenames: Array<{ from: string; to: string; cartId: string }>;
  settingsUpdates: Array<{ folder: string; cartId: string; from: string; to: string }>;
  labels: {
    hasLocalLabels: boolean;
    localLabelCount: number;
    labelsDbExists: boolean;
    newCartsToAdd: string[];
  };
}

interface SyncResults {
  folderRenames: { success: number; failed: number; skipped: number; errors: string[]; details: string[] };
  labels: { success: boolean; exported: number; added: number; error: string | null };
}

type SyncStep = 'preview' | 'syncing' | 'complete';

export function SyncPage() {
  const { selectedSDCard } = useSDCard();
  const [step, setStep] = useState<SyncStep>('preview');
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [results, setResults] = useState<SyncResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });

  const fetchPreview = useCallback(async () => {
    if (!selectedSDCard) {
      setPreview(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/api/sync/full/preview?sdCardPath=${encodeURIComponent(selectedSDCard.path)}`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to load preview');
      }

      const data: SyncPreview = await response.json();
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preview');
    } finally {
      setLoading(false);
    }
  }, [selectedSDCard]);

  useEffect(() => {
    fetchPreview();
    // Reset to preview step when SD card changes
    setStep('preview');
    setResults(null);
  }, [fetchPreview]);

  const handleSync = async () => {
    if (!selectedSDCard || !preview) return;

    try {
      setStep('syncing');
      setError(null);
      setProgress({ current: 0, total: 0, status: 'Connecting...' });

      // Use Server-Sent Events for real-time progress
      const eventSource = new EventSource(
        `/api/sync/full/apply-stream?sdCardPath=${encodeURIComponent(selectedSDCard.path)}`
      );

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'start':
            setProgress({
              current: 0,
              total: data.total,
              status: `Starting sync (${data.folderCount} folders, ${data.labelCount} labels)...`,
            });
            break;

          case 'progress':
            setProgress({
              current: data.current,
              total: data.total,
              status: data.detail,
            });
            break;

          case 'complete':
            setResults(data.results);
            setProgress({ current: data.results ? 100 : 0, total: 100, status: 'Complete!' });
            setStep('complete');
            eventSource.close();
            break;

          case 'error':
            setError(data.error);
            setStep('preview');
            eventSource.close();
            break;
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setError('Connection to sync stream lost');
        setStep('preview');
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
      setStep('preview');
    }
  };

  const handleReset = () => {
    setStep('preview');
    setResults(null);
    fetchPreview();
  };

  const hasChanges =
    preview &&
    (preview.folderRenames.length > 0 ||
     preview.settingsUpdates?.length > 0 ||
     preview.labels.hasLocalLabels ||
     preview.labels.newCartsToAdd?.length > 0);

  if (!selectedSDCard) {
    return (
      <div className="sync-page">
        <div className="page-header">
          <h2>Sync to SD Card</h2>
        </div>
        <div className="sync-no-card">
          <p>No SD card selected.</p>
          <p className="hint">Select an SD card from the dropdown in the header to sync your changes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sync-page">
      <div className="page-header">
        <h2>Sync to SD Card</h2>
        <span className="sd-card-path">{selectedSDCard.path}</span>
      </div>

      {loading ? (
        <div className="sync-loading">
          <div className="spinner" />
          <p>Analyzing changes...</p>
        </div>
      ) : error ? (
        <div className="sync-error">
          <p className="error-message">{error}</p>
          <button className="btn-secondary" onClick={fetchPreview}>
            Retry
          </button>
        </div>
      ) : step === 'preview' && preview ? (
        <div className="sync-preview">
          <p className="sync-description">
            This will apply your local changes to the SD card.
          </p>

          {!hasChanges ? (
            <div className="sync-no-changes">
              <p>No changes to sync.</p>
              <p className="hint">
                Name some unknown cartridges or modify label artwork first.
              </p>
            </div>
          ) : (
            <>
              {/* Folder Renames */}
              <div className="sync-section">
                <h3>Game Folder Renames</h3>
                {preview.folderRenames.length === 0 ? (
                  <p className="sync-none">No folder renames needed</p>
                ) : (
                  <>
                    <p className="sync-count">
                      {preview.folderRenames.length} folder(s) will be renamed
                    </p>
                    <ul className="sync-list">
                      {preview.folderRenames.map((rename) => (
                        <li key={rename.cartId} className="sync-rename-item">
                          <span className="rename-from">{rename.from}</span>
                          <span className="rename-arrow">-&gt;</span>
                          <span className="rename-to">{rename.to}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              {/* Settings.json Updates */}
              {preview.settingsUpdates?.length > 0 && (
                <div className="sync-section">
                  <h3>Settings.json Title Updates</h3>
                  <p className="sync-count">
                    {preview.settingsUpdates.length} game(s) need title updates
                  </p>
                  <ul className="sync-list">
                    {preview.settingsUpdates.map((update) => (
                      <li key={update.cartId} className="sync-rename-item">
                        <span className="rename-from">"{update.from}"</span>
                        <span className="rename-arrow">-&gt;</span>
                        <span className="rename-to">"{update.to}"</span>
                        <span className="rename-folder">({update.folder})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Labels Export */}
              <div className="sync-section">
                <h3>Label Artwork</h3>
                {!preview.labels.hasLocalLabels && preview.labels.newCartsToAdd?.length === 0 ? (
                  <p className="sync-none">No local labels to export</p>
                ) : (
                  <>
                    {preview.labels.hasLocalLabels && (
                      <p className="sync-count">
                        {preview.labels.localLabelCount} label(s) will be written
                        to labels.db
                        {preview.labels.labelsDbExists && (
                          <span className="sync-warning">
                            {' '}
                            (existing file will be backed up)
                          </span>
                        )}
                      </p>
                    )}
                    {preview.labels.newCartsToAdd?.length > 0 && (
                      <p className="sync-count" style={{ marginTop: '0.5rem' }}>
                        {preview.labels.newCartsToAdd.length} new cart(s) will be
                        added to labels.db:{' '}
                        <code>{preview.labels.newCartsToAdd.join(', ')}</code>
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="sync-actions">
                <button
                  className="btn-primary btn-large"
                  onClick={handleSync}
                  disabled={!hasChanges || loading}
                >
                  Sync to SD Card
                </button>
              </div>
            </>
          )}
        </div>
      ) : step === 'syncing' ? (
        <div className="sync-progress">
          <div className="progress-bar">
            <div
              className={`progress-fill ${progress.total === 0 ? 'indeterminate' : ''}`}
              style={progress.total > 0 ? { width: `${Math.round((progress.current / progress.total) * 100)}%` } : undefined}
            />
          </div>
          {progress.total > 0 && (
            <p className="progress-percent">
              {progress.current} / {progress.total} ({Math.round((progress.current / progress.total) * 100)}%)
            </p>
          )}
          <p className="progress-status">{progress.status}</p>
          <p className="progress-hint">
            Writing to SD card...
          </p>
        </div>
      ) : step === 'complete' && results ? (
        <div className="sync-complete">
          <div className="sync-success-icon">&#10003;</div>
          <h3>Sync Complete!</h3>

          <div className="sync-results">
            {results.folderRenames.success > 0 && (
              <p className="result-success">
                Renamed {results.folderRenames.success} game folder(s) and updated settings.json
              </p>
            )}
            {results.folderRenames.skipped > 0 && (
              <p className="result-info">
                Skipped {results.folderRenames.skipped} unknown cartridge(s) without names
              </p>
            )}
            {results.folderRenames.failed > 0 && (
              <p className="result-error">
                Failed to rename {results.folderRenames.failed} folder(s)
              </p>
            )}
            {results.labels.success && (
              <p className="result-success">
                Exported {results.labels.exported} labels to SD card
                {results.labels.added > 0 && (
                  <> (added {results.labels.added} new cart entries)</>
                )}
              </p>
            )}
            {results.labels.error && (
              <p className="result-error">{results.labels.error}</p>
            )}

            {/* Show details */}
            {results.folderRenames.details.length > 0 && (
              <div className="sync-details">
                <h4>Details:</h4>
                <ul>
                  {results.folderRenames.details.map((detail, i) => (
                    <li key={i}>{detail}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Show errors */}
            {results.folderRenames.errors.length > 0 && (
              <div className="sync-errors">
                <h4>Errors:</h4>
                <ul>
                  {results.folderRenames.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <p className="sync-note">
            Eject your SD card safely before removing it.
          </p>

          <div className="sync-actions">
            <button className="btn-secondary" onClick={handleReset}>
              Check for More Changes
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
