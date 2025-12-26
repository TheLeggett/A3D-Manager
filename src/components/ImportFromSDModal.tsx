import { useState, useEffect } from 'react';
import { Modal, Button } from './ui';

interface CartridgeInfo {
  cartId: string;
  folderName: string;
  hasSettings: boolean;
  hasGamePak: boolean;
  alreadyOwned: boolean;
}

interface ScanResult {
  sdCardPath: string;
  cartridges: CartridgeInfo[];
  summary: {
    total: number;
    withSettings: number;
    withGamePak: number;
    alreadyOwned: number;
  };
}

interface ImportProgress {
  step: 'ownership' | 'settings' | 'gamePaks' | 'done' | 'error';
  status: string;
  current?: number;
  total?: number;
  cartId?: string;
  added?: number;
  skipped?: number;
  downloaded?: number;
  errors?: string[];
  error?: string;
}

interface ImportFromSDModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  sdCardPath: string;
}

export function ImportFromSDModal({
  isOpen,
  onClose,
  onImportComplete,
  sdCardPath,
}: ImportFromSDModalProps) {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloadSettings, setDownloadSettings] = useState(true);
  const [downloadGamePaks, setDownloadGamePaks] = useState(true);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Scan SD card when modal opens
  useEffect(() => {
    if (isOpen && sdCardPath) {
      scanSDCard();
    } else {
      // Reset state when modal closes
      setScanResult(null);
      setSelectedIds(new Set());
      setDownloadSettings(true);
      setDownloadGamePaks(true);
      setProgress(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sdCardPath]);

  const scanSDCard = async () => {
    try {
      setScanning(true);
      setError(null);

      const response = await fetch('/api/cartridges/owned/import-from-sd/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdCardPath }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to scan SD card');
      }

      const result: ScanResult = await response.json();
      setScanResult(result);

      // Pre-select cartridges that aren't already owned
      const newSelection = new Set<string>();
      result.cartridges.forEach(c => {
        if (!c.alreadyOwned) {
          newSelection.add(c.cartId);
        }
      });
      setSelectedIds(newSelection);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan SD card');
    } finally {
      setScanning(false);
    }
  };

  const toggleCartridge = (cartId: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(cartId)) {
      newSelection.delete(cartId);
    } else {
      newSelection.add(cartId);
    }
    setSelectedIds(newSelection);
  };

  const selectAll = () => {
    if (scanResult) {
      setSelectedIds(new Set(scanResult.cartridges.map(c => c.cartId)));
    }
  };

  const selectNone = () => {
    setSelectedIds(new Set());
  };

  const selectNew = () => {
    if (scanResult) {
      setSelectedIds(new Set(
        scanResult.cartridges.filter(c => !c.alreadyOwned).map(c => c.cartId)
      ));
    }
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) return;

    try {
      setImporting(true);
      setError(null);
      setProgress(null);

      const response = await fetch('/api/cartridges/owned/import-from-sd/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdCardPath,
          cartIds: Array.from(selectedIds),
          downloadSettings,
          downloadGamePaks,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start import');
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as ImportProgress;
              setProgress(data);

              if (data.step === 'done') {
                onImportComplete();
                setTimeout(() => onClose(), 1500);
              } else if (data.step === 'error') {
                setError(data.error || 'Import failed');
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const selectedWithSettings = scanResult?.cartridges.filter(
    c => selectedIds.has(c.cartId) && c.hasSettings
  ).length || 0;

  const selectedWithGamePaks = scanResult?.cartridges.filter(
    c => selectedIds.has(c.cartId) && c.hasGamePak
  ).length || 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Owned Cartridges from SD"
      size="lg"
      className="import-sd-modal"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleImport}
            disabled={importing || selectedIds.size === 0 || !scanResult}
            loading={importing}
          >
            Mark {selectedIds.size} as Owned
          </Button>
        </>
      }
    >
      {scanning ? (
        <div className="scanning-status">
          <div className="spinner"></div>
          <p>Scanning SD card for cartridges...</p>
        </div>
      ) : error && !scanResult ? (
        <div className="error-state">
          <div className="error-message">{error}</div>
          <Button variant="secondary" onClick={scanSDCard}>
            Retry
          </Button>
        </div>
      ) : scanResult ? (
        <>
          {/* Summary */}
          <div className="scan-summary">
            <p>
              Found <strong>{scanResult.summary.total}</strong> cartridges on SD card.
              {scanResult.summary.alreadyOwned > 0 && (
                <span className="already-owned-note">
                  {' '}({scanResult.summary.alreadyOwned} already marked as owned)
                </span>
              )}
            </p>
            <p className="scan-summary-hint">
              Select cartridges below to mark them as owned in your collection.
            </p>
          </div>

          {/* Selection Controls */}
          <div className="selection-controls">
            <Button variant="ghost" size="sm" onClick={selectAll}>
              Select All
            </Button>
            <Button variant="ghost" size="sm" onClick={selectNone}>
              Select None
            </Button>
            {scanResult.summary.alreadyOwned > 0 && (
              <Button variant="ghost" size="sm" onClick={selectNew}>
                Select New Only
              </Button>
            )}
            <span className="selection-count">{selectedIds.size} selected</span>
          </div>

          {/* Cartridge List */}
          <div className="cartridge-list">
            {scanResult.cartridges.map((cart) => (
              <label
                key={cart.cartId}
                className={`cartridge-item ${selectedIds.has(cart.cartId) ? 'selected' : ''} ${cart.alreadyOwned ? 'already-owned' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(cart.cartId)}
                  onChange={() => toggleCartridge(cart.cartId)}
                  disabled={importing}
                />
                <div className="cartridge-info">
                  <span className="cartridge-name">{cart.folderName}</span>
                  <span className="cartridge-id">{cart.cartId}</span>
                </div>
                <div className="cartridge-badges">
                  {cart.hasSettings && <span className="badge badge-settings">Settings</span>}
                  {cart.hasGamePak && <span className="badge badge-pak">Pak</span>}
                  {cart.alreadyOwned && <span className="badge badge-owned">Owned</span>}
                </div>
              </label>
            ))}
          </div>

          {/* Download Options */}
          {(selectedWithSettings > 0 || selectedWithGamePaks > 0) && (
            <div className="download-options">
              <h4>Optional: Also copy data to local storage</h4>
              <p className="download-options-hint">
                Back up settings and save data from your SD card.
              </p>
              {selectedWithSettings > 0 && (
                <label className="download-option">
                  <input
                    type="checkbox"
                    checked={downloadSettings}
                    onChange={(e) => setDownloadSettings(e.target.checked)}
                    disabled={importing}
                  />
                  <span>
                    Settings ({selectedWithSettings} available)
                  </span>
                </label>
              )}
              {selectedWithGamePaks > 0 && (
                <label className="download-option">
                  <input
                    type="checkbox"
                    checked={downloadGamePaks}
                    onChange={(e) => setDownloadGamePaks(e.target.checked)}
                    disabled={importing}
                  />
                  <span>
                    Game Paks ({selectedWithGamePaks} available)
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Progress */}
          {progress && (
            <div className="import-progress">
              {progress.step === 'ownership' && (
                <div className="progress-step">
                  {progress.status === 'completed' ? (
                    <p>Added {progress.added} cartridges to your collection{progress.skipped ? ` (${progress.skipped} already owned)` : ''}</p>
                  ) : (
                    <p>Adding cartridges to your collection...</p>
                  )}
                </div>
              )}
              {progress.step === 'settings' && (
                <div className="progress-step">
                  {progress.status === 'completed' ? (
                    <p>Downloaded {progress.downloaded} settings files</p>
                  ) : (
                    <p>
                      Downloading settings... ({progress.current}/{progress.total})
                    </p>
                  )}
                </div>
              )}
              {progress.step === 'gamePaks' && (
                <div className="progress-step">
                  {progress.status === 'completed' ? (
                    <p>Downloaded {progress.downloaded} game paks</p>
                  ) : (
                    <p>
                      Downloading game paks... ({progress.current}/{progress.total})
                    </p>
                  )}
                </div>
              )}
              {progress.step === 'done' && (
                <div className="progress-step success">
                  <p>Import complete!</p>
                </div>
              )}
            </div>
          )}

          {error && <div className="error-message">{error}</div>}
        </>
      ) : null}
    </Modal>
  );
}
