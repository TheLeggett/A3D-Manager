import './CartridgesActionBar.css';

interface CartridgesActionBarProps {
  hasLabels: boolean;
  hasSDCard: boolean;
  selectionMode: boolean;
  onImportFromSD: () => void;
  onToggleSelectionMode: () => void;
}

export function CartridgesActionBar({
  hasLabels,
  hasSDCard,
  selectionMode,
  onImportFromSD,
  onToggleSelectionMode,
}: CartridgesActionBarProps) {
  return (
    <div className="cartridges-action-bar">
      <div className="action-bar-left">
        {hasSDCard && hasLabels && (
          <button className="btn-secondary" onClick={onImportFromSD}>
            Import from SD
          </button>
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
        </div>
      )}
    </div>
  );
}
