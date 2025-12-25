import { useState, useEffect } from 'react';
import { Modal, Button } from './ui';

interface ExportBundleModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCartIds?: string[]; // If provided, export only these carts
}

export function ExportBundleModal({
  isOpen,
  onClose,
  selectedCartIds,
}: ExportBundleModalProps) {
  const [includeLabels, setIncludeLabels] = useState(true);
  const [includeOwnership, setIncludeOwnership] = useState(true);
  const [includeSettings, setIncludeSettings] = useState(true);
  const [includeGamePaks, setIncludeGamePaks] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSelectionExport = selectedCartIds && selectedCartIds.length > 0;

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setIncludeLabels(true);
      setIncludeOwnership(true);
      setIncludeSettings(true);
      setIncludeGamePaks(true);
    }
  }, [isOpen]);

  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);

      const endpoint = isSelectionExport
        ? '/api/cartridges/bundle/export-selection'
        : '/api/cartridges/bundle/export';

      const body = isSelectionExport
        ? { cartIds: selectedCartIds }
        : {
            includeLabels,
            includeOwnership,
            includeSettings,
            includeGamePaks,
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Export failed');
      }

      // Download the file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Get filename from Content-Disposition header or use default
      const disposition = response.headers.get('Content-Disposition');
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      a.download = filenameMatch?.[1] || 'a3d-backup.a3d';

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isSelectionExport ? 'Export Selection' : 'Export Bundle'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={exporting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleExport}
            disabled={exporting || (!isSelectionExport && !includeLabels && !includeOwnership && !includeSettings && !includeGamePaks)}
            loading={exporting}
          >
            Export Bundle
          </Button>
        </>
      }
    >
      {isSelectionExport ? (
        <p className="export-info">
          Export settings and game paks for <strong>{selectedCartIds.length}</strong> selected cartridge{selectedCartIds.length !== 1 ? 's' : ''}.
        </p>
      ) : (
        <>
          <p className="export-info">
            Create a backup bundle (.a3d) containing your cartridge data.
          </p>

          <div className="export-options">
            <h4>Include in bundle:</h4>

            <label className="export-option">
              <input
                type="checkbox"
                checked={includeLabels}
                onChange={(e) => setIncludeLabels(e.target.checked)}
                disabled={exporting}
              />
              <div className="option-content">
                <span className="option-label">Labels Database</span>
                <span className="option-desc">All cartridge label artwork (labels.db)</span>
              </div>
            </label>

            <label className="export-option">
              <input
                type="checkbox"
                checked={includeOwnership}
                onChange={(e) => setIncludeOwnership(e.target.checked)}
                disabled={exporting}
              />
              <div className="option-content">
                <span className="option-label">Ownership Data</span>
                <span className="option-desc">Your list of owned cartridges</span>
              </div>
            </label>

            <label className="export-option">
              <input
                type="checkbox"
                checked={includeSettings}
                onChange={(e) => setIncludeSettings(e.target.checked)}
                disabled={exporting}
              />
              <div className="option-content">
                <span className="option-label">Game Settings</span>
                <span className="option-desc">Per-game display and hardware settings</span>
              </div>
            </label>

            <label className="export-option">
              <input
                type="checkbox"
                checked={includeGamePaks}
                onChange={(e) => setIncludeGamePaks(e.target.checked)}
                disabled={exporting}
              />
              <div className="option-content">
                <span className="option-label">Game Paks</span>
                <span className="option-desc">Controller pak save data</span>
              </div>
            </label>
          </div>
        </>
      )}

      {error && <div className="error-message">{error}</div>}
    </Modal>
  );
}
