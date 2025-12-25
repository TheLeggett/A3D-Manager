import { useState, useRef, useEffect } from 'react';
import { Modal, Button } from './ui';

interface BundleManifest {
  version: number;
  createdAt: string;
  appVersion: string;
  contents: {
    hasLabelsDb: boolean;
    hasOwnedCarts: boolean;
    settingsCount: number;
    gamePaksCount: number;
    cartIds: string[];
  };
}

interface ImportResult {
  success: boolean;
  labelsImported: boolean;
  ownershipMerged: { added: number; skipped: number };
  settingsImported: { added: number; skipped: number; overwritten: number };
  gamePaksImported: { added: number; skipped: number; overwritten: number };
  errors: string[];
}

type MergeStrategy = 'skip' | 'overwrite';

interface ImportBundleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export function ImportBundleModal({
  isOpen,
  onClose,
  onImportComplete,
}: ImportBundleModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [manifest, setManifest] = useState<BundleManifest | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Import options
  const [importLabels, setImportLabels] = useState(true);
  const [importOwnership, setImportOwnership] = useState(true);
  const [importSettings, setImportSettings] = useState(true);
  const [importGamePaks, setImportGamePaks] = useState(true);
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>('skip');
  const [dragActive, setDragActive] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setManifest(null);
      setResult(null);
      setError(null);
      setDragActive(false);
      setImportLabels(true);
      setImportOwnership(true);
      setImportSettings(true);
      setImportGamePaks(true);
      setMergeStrategy('skip');
    }
  }, [isOpen]);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setManifest(null);
    setResult(null);
    setError(null);

    // Get bundle info
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/cartridges/bundle/info', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Invalid bundle file');
      }

      const info: BundleManifest = await response.json();
      setManifest(info);

      // Auto-set options based on what's in the bundle
      setImportLabels(info.contents.hasLabelsDb);
      setImportOwnership(info.contents.hasOwnedCarts);
      setImportSettings(info.contents.settingsCount > 0);
      setImportGamePaks(info.contents.gamePaksCount > 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read bundle');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    try {
      setImporting(true);
      setError(null);
      setResult(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('options', JSON.stringify({
        importLabels,
        importOwnership,
        importSettings,
        importGamePaks,
        mergeStrategy,
      }));

      const response = await fetch('/api/cartridges/bundle/import', {
        method: 'POST',
        body: formData,
      });

      const importResult: ImportResult = await response.json();
      setResult(importResult);

      if (importResult.success) {
        onImportComplete();
      } else {
        setError(importResult.errors.join(', ') || 'Import failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Bundle"
      size="lg"
      className="import-bundle-modal"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={importing}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && manifest && (
            <Button
              variant="primary"
              onClick={handleImport}
              disabled={importing || (!importLabels && !importOwnership && !importSettings && !importGamePaks)}
              loading={importing}
            >
              Import
            </Button>
          )}
        </>
      }
    >
      {!file ? (
        <div
          className={`drop-zone ${dragActive ? 'active' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
        >
          <div className="drop-zone-content">
            <p>Drop <strong>.a3d</strong> bundle file here</p>
            <p className="hint">or click to select</p>
          </div>
        </div>
      ) : loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Reading bundle...</p>
        </div>
      ) : result ? (
        <div className="import-result">
          <h3 className={result.success ? 'success' : 'error'}>
            {result.success ? 'Import Complete!' : 'Import Failed'}
          </h3>

          <div className="result-details">
            {result.labelsImported && (
              <div className="result-item">Labels database imported</div>
            )}
            {(result.ownershipMerged.added > 0 || result.ownershipMerged.skipped > 0) && (
              <div className="result-item">
                Ownership: {result.ownershipMerged.added} added, {result.ownershipMerged.skipped} skipped
              </div>
            )}
            {(result.settingsImported.added > 0 || result.settingsImported.skipped > 0 || result.settingsImported.overwritten > 0) && (
              <div className="result-item">
                Settings: {result.settingsImported.added} added
                {result.settingsImported.overwritten > 0 && `, ${result.settingsImported.overwritten} updated`}
                {result.settingsImported.skipped > 0 && `, ${result.settingsImported.skipped} skipped`}
              </div>
            )}
            {(result.gamePaksImported.added > 0 || result.gamePaksImported.skipped > 0 || result.gamePaksImported.overwritten > 0) && (
              <div className="result-item">
                Game Paks: {result.gamePaksImported.added} added
                {result.gamePaksImported.overwritten > 0 && `, ${result.gamePaksImported.overwritten} updated`}
                {result.gamePaksImported.skipped > 0 && `, ${result.gamePaksImported.skipped} skipped`}
              </div>
            )}
          </div>

          {result.errors.length > 0 && (
            <div className="result-errors">
              {result.errors.map((err, i) => (
                <div key={i} className="error-message">{err}</div>
              ))}
            </div>
          )}
        </div>
      ) : manifest ? (
        <>
          <div className="bundle-info">
            <h4 className="text-label">Bundle Contents</h4>
            <div className="bundle-details">
              <div className="detail-row">
                <span>Created:</span>
                <span>{new Date(manifest.createdAt).toLocaleString()}</span>
              </div>
              {manifest.contents.hasLabelsDb && (
                <div className="detail-row">
                  <span>Labels Database:</span>
                  <span>Included</span>
                </div>
              )}
              {manifest.contents.hasOwnedCarts && (
                <div className="detail-row">
                  <span>Ownership Data:</span>
                  <span>Included</span>
                </div>
              )}
              {manifest.contents.settingsCount > 0 && (
                <div className="detail-row">
                  <span>Game Settings:</span>
                  <span>{manifest.contents.settingsCount} games</span>
                </div>
              )}
              {manifest.contents.gamePaksCount > 0 && (
                <div className="detail-row">
                  <span>Game Paks:</span>
                  <span>{manifest.contents.gamePaksCount} saves</span>
                </div>
              )}
            </div>
          </div>

          <div className="import-options">
            <h4>Import Options</h4>

            <label className={`import-option ${!manifest.contents.hasLabelsDb ? 'disabled' : ''}`}>
              <input
                type="checkbox"
                checked={importLabels}
                onChange={(e) => setImportLabels(e.target.checked)}
                disabled={importing || !manifest.contents.hasLabelsDb}
              />
              <span>Labels Database</span>
            </label>

            <label className={`import-option ${!manifest.contents.hasOwnedCarts ? 'disabled' : ''}`}>
              <input
                type="checkbox"
                checked={importOwnership}
                onChange={(e) => setImportOwnership(e.target.checked)}
                disabled={importing || !manifest.contents.hasOwnedCarts}
              />
              <span>Ownership Data</span>
            </label>

            <label className={`import-option ${manifest.contents.settingsCount === 0 ? 'disabled' : ''}`}>
              <input
                type="checkbox"
                checked={importSettings}
                onChange={(e) => setImportSettings(e.target.checked)}
                disabled={importing || manifest.contents.settingsCount === 0}
              />
              <span>Game Settings ({manifest.contents.settingsCount})</span>
            </label>

            <label className={`import-option ${manifest.contents.gamePaksCount === 0 ? 'disabled' : ''}`}>
              <input
                type="checkbox"
                checked={importGamePaks}
                onChange={(e) => setImportGamePaks(e.target.checked)}
                disabled={importing || manifest.contents.gamePaksCount === 0}
              />
              <span>Game Paks ({manifest.contents.gamePaksCount})</span>
            </label>
          </div>

          <div className="merge-strategy">
            <h4>When data already exists:</h4>
            <div className="strategy-options">
              <label>
                <input
                  type="radio"
                  name="mergeStrategy"
                  value="skip"
                  checked={mergeStrategy === 'skip'}
                  onChange={() => setMergeStrategy('skip')}
                  disabled={importing}
                />
                <span>Keep existing (skip duplicates)</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="mergeStrategy"
                  value="overwrite"
                  checked={mergeStrategy === 'overwrite'}
                  onChange={() => setMergeStrategy('overwrite')}
                  disabled={importing}
                />
                <span>Overwrite with imported data</span>
              </label>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}
        </>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept=".a3d,.zip"
        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
        style={{ display: 'none' }}
      />
    </Modal>
  );
}
