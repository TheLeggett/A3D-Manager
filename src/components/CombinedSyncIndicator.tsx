import { useLabelSync } from './LabelSyncIndicator';
import { useLibrarySync } from './LibrarySyncIndicator';
import './CombinedSyncIndicator.css';

interface CombinedSyncIndicatorProps {
  onLabelSyncClick?: () => void;
  onLibrarySyncClick?: () => void;
}

export function CombinedSyncIndicator({
  onLabelSyncClick,
  onLibrarySyncClick,
}: CombinedSyncIndicatorProps) {
  const { syncStatus: labelStatus } = useLabelSync();
  const { syncStatus: libraryStatus } = useLibrarySync();

  // Determine overall status and what actions are needed
  const labelNeedsSync = labelStatus === 'sync-required' || labelStatus === 'sd-only';
  const libraryNeedsSync = libraryStatus === 'sync-required' || libraryStatus === 'sd-only';
  const labelSynced = labelStatus === 'synced';
  const librarySynced = libraryStatus === 'synced';
  const labelLocalOnly = labelStatus === 'local-only';
  const libraryLocalOnly = libraryStatus === 'local-only';
  const labelNone = labelStatus === 'none';
  const libraryNone = libraryStatus === 'none';
  const isChecking = labelStatus === 'checking' || libraryStatus === 'checking';

  // Build status text
  const getStatusText = (): string => {
    if (isChecking) return 'Checking...';

    // Both synced
    if (labelSynced && librarySynced) {
      return 'Labels & Library Synced';
    }

    // Both need sync
    if (labelNeedsSync && libraryNeedsSync) {
      return 'Labels & Library Sync Required';
    }

    // Mixed states
    if (labelSynced && libraryNeedsSync) {
      return 'Labels Synced, Library Sync Required';
    }
    if (labelNeedsSync && librarySynced) {
      return 'Labels Sync Required, Library Synced';
    }

    // One synced, one local-only or none
    if (labelSynced && (libraryLocalOnly || libraryNone)) {
      return 'Labels Synced';
    }
    if (librarySynced && (labelLocalOnly || labelNone)) {
      return 'Library Synced';
    }

    // One needs sync, one local-only or none
    if (labelNeedsSync && (libraryLocalOnly || libraryNone)) {
      return 'Labels Sync Required';
    }
    if (libraryNeedsSync && (labelLocalOnly || labelNone)) {
      return 'Library Sync Required';
    }

    // Both local-only
    if (labelLocalOnly && libraryLocalOnly) {
      return 'Local Only';
    }

    // Both none
    if (labelNone && libraryNone) {
      return 'No Local Data';
    }

    // One local-only, one none
    if (labelLocalOnly && libraryNone) {
      return 'Labels Local Only';
    }
    if (libraryLocalOnly && labelNone) {
      return 'Library Local Only';
    }

    return 'Local Only';
  };

  // Determine overall status class
  const getStatusClass = (): string => {
    if (isChecking) return 'checking';
    if (labelNeedsSync || libraryNeedsSync) return 'sync-required';
    if (labelSynced && librarySynced) return 'synced';
    if (labelSynced || librarySynced) return 'partial-synced';
    if (labelNone && libraryNone) return 'none';
    return 'local-only';
  };

  // Should we show sync buttons?
  const showLabelSync = labelNeedsSync;
  const showLibrarySync = libraryNeedsSync;
  const showAnySync = showLabelSync || showLibrarySync;

  return (
    <div className={`combined-sync-indicator ${getStatusClass()}`}>
      <span className="combined-sync-label text-pixel">
        {getStatusText()}
      </span>
      {showAnySync && (
        <div className="combined-sync-buttons">
          {showLabelSync && onLabelSyncClick && (
            <button
              className="combined-sync-button text-pixel"
              onClick={onLabelSyncClick}
              title="Sync labels"
            >
              {showLibrarySync ? 'Labels' : 'Sync'}
            </button>
          )}
          {showLibrarySync && onLibrarySyncClick && (
            <button
              className="combined-sync-button text-pixel"
              onClick={onLibrarySyncClick}
              title="Sync library"
            >
              {showLabelSync ? 'Library' : 'Sync'}
            </button>
          )}
        </div>
      )}
      <span className="combined-sync-light" />
    </div>
  );
}
