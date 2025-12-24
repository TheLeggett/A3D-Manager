import { useState, useEffect, useCallback } from 'react';
import { useSDCard } from '../App';

interface SyncPreview {
  labels: {
    hasLocalLabels: boolean;
    localLabelCount: number;
  };
}

interface SyncResults {
  labels: { success: boolean; entryCount: number; error: string | null };
}

type SyncStep = 'preview' | 'syncing' | 'complete';

interface TransferProgress {
  percentage: number;
  fileName: string;
  bytesWritten: string;
  totalBytes: string;
  speed: string;
  eta: string;
  status: string;
}

export function SyncPage() {
  const { selectedSDCard } = useSDCard();
  const [step, setStep] = useState<SyncStep>('preview');
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [results, setResults] = useState<SyncResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<TransferProgress>({
    percentage: 0,
    fileName: '',
    bytesWritten: '',
    totalBytes: '',
    speed: '',
    eta: '',
    status: 'Connecting...',
  });
  const [exporting, setExporting] = useState(false);

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
      setProgress({
        percentage: 0,
        fileName: '',
        bytesWritten: '',
        totalBytes: '',
        speed: '',
        eta: '',
        status: 'Connecting...',
      });

      // Use Server-Sent Events for real-time progress
      const eventSource = new EventSource(
        `/api/sync/full/apply-stream?sdCardPath=${encodeURIComponent(selectedSDCard.path)}`
      );

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'start':
            setProgress({
              percentage: 0,
              fileName: '',
              bytesWritten: '',
              totalBytes: '',
              speed: '',
              eta: '',
              status: `Starting sync (${data.labelCount} labels)...`,
            });
            break;

          case 'progress':
            setProgress({
              percentage: data.percentage || 0,
              fileName: data.fileName || '',
              bytesWritten: data.bytesWrittenFormatted || '',
              totalBytes: data.totalBytesFormatted || '',
              speed: data.speed || '',
              eta: data.eta || '',
              status: `Copying ${data.fileName || 'file'}...`,
            });
            break;

          case 'complete':
            setResults(data.results);
            setProgress({
              percentage: 100,
              fileName: '',
              bytesWritten: '',
              totalBytes: '',
              speed: '',
              eta: '',
              status: 'Complete!',
            });
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

  const handleExport = async () => {
    try {
      setExporting(true);
      const response = await fetch('/api/labels/export');
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'labels.db';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleReset = () => {
    setStep('preview');
    setResults(null);
    fetchPreview();
  };

  const hasChanges = preview && preview.labels.hasLocalLabels;

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

        <div className="sync-manual-section">
          <h3>Manual Export</h3>
          <p className="sync-description">
            If you're unable to connect your SD card directly (e.g., no card reader, or the card
            isn't being detected), you can export your labels.db file and copy it manually.
          </p>

          <div className="manual-export-actions">
            <button
              className="btn-primary"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? 'Exporting...' : 'Export labels.db'}
            </button>
          </div>

          <div className="manual-instructions">
            <h4>Where to place labels.db on your SD card:</h4>
            <ol>
              <li>Insert your Analogue 3D SD card into your computer</li>
              <li>Navigate to the <code>System</code> folder on the SD card</li>
              <li>Inside <code>System</code>, open the <code>Library</code> folder</li>
              <li>Inside <code>Library</code>, open the <code>Images</code> folder</li>
              <li>Copy <code>labels.db</code> into the <code>Images</code> folder</li>
            </ol>
            <p className="path-example">
              Full path: <code>/System/Library/Images/labels.db</code>
            </p>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
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
                Add or modify label artwork first.
              </p>
            </div>
          ) : (
            <>
              {/* Labels Export */}
              <div className="sync-section">
                <h3>Label Artwork</h3>
                <p className="sync-count">
                  labels.db with {preview.labels.localLabelCount} label(s) will be
                  copied to SD card
                </p>
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

          <div className="sync-manual-section">
            <h3>Manual Export</h3>
            <p className="sync-description">
              Prefer to copy the file manually? Export your labels.db and place it at:
            </p>
            <p className="path-example">
              <code>{selectedSDCard.path}/System/Library/Images/labels.db</code>
            </p>
            <div className="manual-export-actions">
              <button
                className="btn-secondary"
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? 'Exporting...' : 'Export labels.db'}
              </button>
            </div>
          </div>
        </div>
      ) : step === 'syncing' ? (
        <div className="sync-progress">
          <div className="progress-bar">
            <div
              className={`progress-fill ${progress.percentage === 0 && !progress.bytesWritten ? 'indeterminate' : ''}`}
              style={progress.percentage > 0 ? { width: `${progress.percentage}%` } : undefined}
            />
          </div>

          {/* Percentage and file name */}
          <div className="progress-header">
            <span className="progress-percent">{progress.percentage}%</span>
            {progress.fileName && (
              <span className="progress-filename">{progress.fileName}</span>
            )}
          </div>

          {/* Transfer details */}
          {progress.bytesWritten && (
            <div className="progress-details">
              <span className="progress-bytes">
                {progress.bytesWritten} / {progress.totalBytes}
              </span>
              {progress.speed && (
                <>
                  <span className="progress-separator">•</span>
                  <span className="progress-speed">{progress.speed}</span>
                </>
              )}
              {progress.eta && progress.eta !== '0ms' && (
                <>
                  <span className="progress-separator">•</span>
                  <span className="progress-eta">~{progress.eta} remaining</span>
                </>
              )}
            </div>
          )}

          <p className="progress-status">{progress.status}</p>
        </div>
      ) : step === 'complete' && results ? (
        <div className="sync-complete">
          <div className="sync-success-icon">&#10003;</div>
          <h3>Sync Complete!</h3>

          <div className="sync-results">
            {results.labels.success && (
              <p className="result-success">
                Copied labels.db with {results.labels.entryCount} labels to SD card
              </p>
            )}
            {results.labels.error && (
              <p className="result-error">{results.labels.error}</p>
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
