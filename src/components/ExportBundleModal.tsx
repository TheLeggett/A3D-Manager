import { useState, useEffect, useContext } from 'react';
import { Modal, Button } from './ui';
import { isStaticMode } from '../App';
import { ServicesContext } from '../contexts/ServicesContext';
import { trackBundleExported } from '../lib/analytics';

interface ExportBundleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExportComplete?: () => void;
  selectedCartIds?: string[]; // If provided, export only these carts
}

export function ExportBundleModal({
  isOpen,
  onClose,
  onExportComplete,
  selectedCartIds,
}: ExportBundleModalProps) {
  const servicesContext = useContext(ServicesContext);
  const [includeLabels, setIncludeLabels] = useState(true);
  const [includeOwnership, setIncludeOwnership] = useState(true);
  const [includeSettings, setIncludeSettings] = useState(true);
  const [includeGamePaks, setIncludeGamePaks] = useState(true);
  const [includeGamePakBackups, setIncludeGamePakBackups] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSelectionExport = selectedCartIds && selectedCartIds.length > 0;

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIncludeLabels(true);
      setIncludeOwnership(true);
      setIncludeSettings(true);
      setIncludeGamePaks(true);
      setIncludeGamePakBackups(true);
      setError(null);
    }
  }, [isOpen]);

  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);

      const exportOptions = {
        includeLabels,
        includeOwnership,
        includeSettings,
        includeGamePaks,
        includeGamePakBackups,
        ...(isSelectionExport && { cartIds: selectedCartIds }),
      };

      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = isSelectionExport
        ? `a3d-selection-${timestamp}.a3d`
        : `a3d-backup-${timestamp}.a3d`;

      // Static mode: use browser services
      if (isStaticMode && servicesContext) {
        const { bundle } = servicesContext.services;
        await bundle.downloadBundle(filename, exportOptions);
        trackBundleExported(includeLabels, includeSettings, includeGamePaks);
        onExportComplete?.();
        onClose();
        return;
      }

      // Server mode: use API
      const response = await fetch('/api/cartridges/bundle/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportOptions),
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
      a.download = filenameMatch?.[1] || filename;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      trackBundleExported(includeLabels, includeSettings, includeGamePaks);
      onExportComplete?.();
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
            disabled={exporting || (!includeLabels && !includeOwnership && !includeSettings && !includeGamePaks && !includeGamePakBackups)}
            loading={exporting}
          >
            Export
          </Button>
        </>
      }
    >
      <p className="export-info">
        {isSelectionExport
          ? <>Export data for <strong>{selectedCartIds.length}</strong> selected cartridge{selectedCartIds.length !== 1 ? 's' : ''}.</>
          : 'Create a backup bundle (.a3d) containing your cartridge data.'
        }
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
            <span className="option-label">Labels</span>
            <span className="option-desc">
              {isSelectionExport
                ? 'Label artwork for selected cartridges'
                : 'All cartridge label artwork (labels.db)'
              }
            </span>
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
            <span className="option-label">Settings</span>
            <span className="option-desc">
              {isSelectionExport
                ? 'Display and hardware settings for selected cartridges'
                : 'Per-game display and hardware settings'
              }
            </span>
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
            <span className="option-desc">
              {isSelectionExport
                ? 'Controller pak save data for selected cartridges'
                : 'Controller pak save data'
              }
            </span>
          </div>
        </label>

        <label className="export-option">
          <input
            type="checkbox"
            checked={includeGamePakBackups}
            onChange={(e) => setIncludeGamePakBackups(e.target.checked)}
            disabled={exporting}
          />
          <div className="option-content">
            <span className="option-label">Game Pak Backups</span>
            <span className="option-desc">
              {isSelectionExport
                ? 'Backup saves for selected cartridges'
                : 'All backed up game pak saves'
              }
            </span>
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
            <span className="option-desc">
              {isSelectionExport
                ? 'Mark selected cartridges as owned on import'
                : 'Your list of owned cartridges'
              }
            </span>
          </div>
        </label>
      </div>

      {error && <div className="error-message">{error}</div>}
    </Modal>
  );
}
