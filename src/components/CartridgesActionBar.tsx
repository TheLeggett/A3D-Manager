import './CartridgesActionBar.css';

interface CartridgesActionBarProps {
  hasLabels: boolean;
  hasSDCard: boolean;
  selectionMode: boolean;
  onImportLabels: () => void;
  onAddCartridge: () => void;
  onImportFromSD: () => void;
  onExportBundle: () => void;
  onImportBundle: () => void;
  onToggleSelectionMode: () => void;
  onClearAllLabels: () => void;
}

export function CartridgesActionBar({
  hasLabels,
  hasSDCard,
  selectionMode,
  onImportLabels,
  onAddCartridge,
  onImportFromSD,
  onExportBundle,
  onImportBundle,
  onToggleSelectionMode,
  onClearAllLabels,
}: CartridgesActionBarProps) {
  return (
    <div className="cartridges-action-bar">
      <div className="action-bar-left">
        <button className="btn-primary" onClick={onImportLabels}>
          Import labels.db
        </button>

        <button className="btn-secondary" onClick={onAddCartridge}>
          Add Cartridge
        </button>

        {hasSDCard && (
          <button className="btn-secondary" onClick={onImportFromSD}>
            Import from SD
          </button>
        )}

        {hasLabels && (
          <>
            <button className="btn-secondary" onClick={onExportBundle}>
              Export Bundle
            </button>
            <button className="btn-secondary" onClick={onImportBundle}>
              Import Bundle
            </button>
          </>
        )}
      </div>

      {hasLabels && (
        <div className="action-bar-right">
          <div className="selection-mode-toggle">
            <button
              className={`btn-ghost ${selectionMode ? 'active' : ''}`}
              onClick={onToggleSelectionMode}
            >
              {selectionMode ? 'Exit Select' : 'Select'}
            </button>
          </div>
          <button
            className="btn-ghost btn-danger-text"
            onClick={onClearAllLabels}
          >
            Clear All Labels
          </button>
        </div>
      )}
    </div>
  );
}
