import { useState, useEffect } from 'react';

interface CartDbStatus {
  exists: boolean;
  version?: number;
  generatedAt?: string;
  source?: string;
  totalEntries?: number;
  namedEntries?: number;
  unnamedEntries?: number;
  message?: string;
}

interface SettingsProps {
  sdCardPath?: string;
  onClose: () => void;
}

export function Settings({ sdCardPath, onClose }: SettingsProps) {
  const [status, setStatus] = useState<CartDbStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/cart-db/status');
      if (!response.ok) throw new Error('Failed to fetch status');
      const data = await response.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setError(null);
      setSuccess(null);

      const params = sdCardPath ? `?sdCardPath=${encodeURIComponent(sdCardPath)}` : '';
      const response = await fetch(`/api/cart-db/generate${params}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Generation failed');
      }

      const result = await response.json();
      setSuccess(`Generated database with ${result.namedEntries} named games out of ${result.totalEntries} total entries.`);

      // Refresh status
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate database');
    } finally {
      setGenerating(false);
    }
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <section className="settings-section">
            <h3>Cart Database</h3>
            <p className="settings-description">
              The cart database maps hex cart IDs to game names. It's populated from
              game folders on your SD card (e.g., "Super Mario 64 b393776d").
            </p>

            {loading ? (
              <div className="loading">Loading status...</div>
            ) : status ? (
              <div className="cart-db-status">
                {status.exists ? (
                  <>
                    <div className="status-row">
                      <span className="status-label">Status</span>
                      <span className="status-value status-ok">Database exists</span>
                    </div>
                    <div className="status-row">
                      <span className="status-label">Source</span>
                      <span className="status-value">{status.source}</span>
                    </div>
                    <div className="status-row">
                      <span className="status-label">Generated</span>
                      <span className="status-value">{formatDate(status.generatedAt!)}</span>
                    </div>
                    <div className="status-row">
                      <span className="status-label">Total Entries</span>
                      <span className="status-value">{status.totalEntries}</span>
                    </div>
                    <div className="status-row">
                      <span className="status-label">Named Games</span>
                      <span className="status-value status-named">{status.namedEntries}</span>
                    </div>
                    <div className="status-row">
                      <span className="status-label">Unnamed (Hex only)</span>
                      <span className="status-value status-unnamed">{status.unnamedEntries}</span>
                    </div>
                  </>
                ) : (
                  <div className="status-row">
                    <span className="status-value status-missing">{status.message}</span>
                  </div>
                )}
              </div>
            ) : null}

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <div className="settings-actions">
              <button
                className="btn-primary"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? 'Generating...' : status?.exists ? 'Regenerate Database' : 'Generate Database'}
              </button>
              {sdCardPath && (
                <p className="settings-hint">
                  Will scan: {sdCardPath}
                </p>
              )}
              {!sdCardPath && (
                <p className="settings-hint">
                  No SD card selected. Will use sd-card-example folder.
                </p>
              )}
            </div>

            <div className="settings-info">
              <h4>How to add more game names:</h4>
              <ol>
                <li>Insert a cartridge into your Analogue 3D</li>
                <li>The console creates a folder like "GoldenEye 007 ac631da0"</li>
                <li>Come back here and click "Regenerate Database"</li>
                <li>The new game name will be available in the Labels Browser</li>
              </ol>
              <p className="settings-note">
                Folders named "Unknown Cartridge" are skipped - rename them first on your SD card.
              </p>
            </div>
          </section>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
