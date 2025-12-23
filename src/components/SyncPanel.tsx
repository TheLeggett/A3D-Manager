import type { SDCard, SyncDiff } from '../types';

interface SyncPanelProps {
  sdCards: SDCard[];
  selectedSDCard: SDCard | null;
  onSelectSDCard: (card: SDCard) => void;
  diff: SyncDiff | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onImport: () => Promise<void>;
  onExport: () => Promise<void>;
}

export function SyncPanel({
  sdCards,
  selectedSDCard,
  onSelectSDCard,
  diff,
  loading,
  error,
  onRefresh,
  onImport,
  onExport,
}: SyncPanelProps) {
  return (
    <div className="sync-panel">
      <div className="sync-header">
        <h2>SD Card Sync</h2>
        <button className="btn-icon" onClick={onRefresh} disabled={loading}>
          Refresh
        </button>
      </div>

      {sdCards.length === 0 ? (
        <div className="no-sd-card">
          <p>No Analogue 3D SD cards detected.</p>
          <p className="hint">Insert your SD card and click Refresh.</p>
        </div>
      ) : (
        <>
          <div className="sd-card-selector">
            <label>SD Card:</label>
            <select
              value={selectedSDCard?.path || ''}
              onChange={(e) => {
                const card = sdCards.find((c) => c.path === e.target.value);
                if (card) onSelectSDCard(card);
              }}
            >
              {sdCards.map((card) => (
                <option key={card.path} value={card.path}>
                  {card.name}
                </option>
              ))}
            </select>
          </div>

          {error && <div className="error-message">{error}</div>}

          {diff && (
            <div className="diff-summary">
              <h3>Changes</h3>

              {diff.onlySD.length > 0 && (
                <div className="diff-section">
                  <h4>Only on SD Card ({diff.onlySD.length})</h4>
                  <ul>
                    {diff.onlySD.map((g) => (
                      <li key={g.id}>{g.title}</li>
                    ))}
                  </ul>
                </div>
              )}

              {diff.onlyLocal.length > 0 && (
                <div className="diff-section">
                  <h4>Only Local ({diff.onlyLocal.length})</h4>
                  <ul>
                    {diff.onlyLocal.map((g) => (
                      <li key={g.id}>{g.title}</li>
                    ))}
                  </ul>
                </div>
              )}

              {diff.modified.length > 0 && (
                <div className="diff-section">
                  <h4>Modified ({diff.modified.length})</h4>
                  <ul>
                    {diff.modified.map((g) => (
                      <li key={g.id}>
                        <span className="old">{g.sdTitle}</span>
                        <span className="arrow"> → </span>
                        <span className="new">{g.localTitle}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {diff.same.length > 0 && (
                <div className="diff-section same">
                  <h4>Unchanged ({diff.same.length})</h4>
                </div>
              )}

              {diff.onlySD.length === 0 &&
                diff.onlyLocal.length === 0 &&
                diff.modified.length === 0 && (
                  <p className="no-changes">No differences found.</p>
                )}
            </div>
          )}

          <div className="sync-actions">
            <button
              className="btn-secondary"
              onClick={onImport}
              disabled={loading}
            >
              {loading ? 'Working...' : 'Import from SD'}
            </button>
            <button
              className="btn-primary"
              onClick={onExport}
              disabled={loading}
            >
              {loading ? 'Working...' : 'Export to SD'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
