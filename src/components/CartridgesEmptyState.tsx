import { useState, useEffect } from 'react';
import './CartridgesEmptyState.css';

interface SDCardStatus {
  labels: {
    exists: boolean;
    fileSize: number;
    fileSizeFormatted: string;
    entryCount: number;
  } | null;
  games: {
    exists: boolean;
    gameCount: number;
  } | null;
}

interface CartridgesEmptyStateProps {
  sdCardPath: string | null;
  onImportLabelsDb: () => void;
  onImportFromSD: () => void;
  onSyncLabelsFromSD: () => void;
}

export function CartridgesEmptyState({
  sdCardPath,
  onImportLabelsDb,
  onImportFromSD,
  onSyncLabelsFromSD,
}: CartridgesEmptyStateProps) {
  const [sdStatus, setSdStatus] = useState<SDCardStatus>({ labels: null, games: null });
  const [loading, setLoading] = useState(false);

  // Check SD card status when connected
  useEffect(() => {
    if (!sdCardPath) {
      setSdStatus({ labels: null, games: null });
      return;
    }

    const checkSDStatus = async () => {
      setLoading(true);
      try {
        const [labelsRes, gamesRes] = await Promise.all([
          fetch(`/api/sync/labels/exists?sdCardPath=${encodeURIComponent(sdCardPath)}`),
          fetch(`/api/sync/games/exists?sdCardPath=${encodeURIComponent(sdCardPath)}`),
        ]);

        const labels = labelsRes.ok ? await labelsRes.json() : null;
        const games = gamesRes.ok ? await gamesRes.json() : null;

        setSdStatus({ labels, games });
      } catch (err) {
        console.error('Failed to check SD status:', err);
      } finally {
        setLoading(false);
      }
    };

    checkSDStatus();
  }, [sdCardPath]);

  const isConnected = sdCardPath !== null;
  const hasLabelsOnSD = sdStatus.labels?.exists ?? false;
  const hasGamesOnSD = sdStatus.games?.exists ?? false;

  return (
    <div className="cartridges-empty-state">
      <div className="empty-state-header">
        <div className="empty-icon">🎮</div>
        <h2>Get Started with A3D Manager</h2>
        <p className="empty-state-subtitle">
          Choose how you'd like to set up your cartridge collection.
        </p>
      </div>

      <div className="empty-state-options">
        {/* Import Games from SD Card */}
        <div className={`empty-state-card ${!isConnected || !hasGamesOnSD ? 'disabled' : ''}`}>
          <div className="card-icon">📂</div>
          <div className="card-content">
            <h3>Import Games from SD Card</h3>
            <p>
              Scan your SD card and import your existing game collection. This will mark games as
              owned, download their settings and game pak files, but won't import label artwork.
            </p>
            {isConnected && hasGamesOnSD && (
              <p className="card-meta">
                {sdStatus.games?.gameCount} games found on SD card
              </p>
            )}
            {isConnected && !hasGamesOnSD && !loading && (
              <p className="card-meta muted">No games found on SD card</p>
            )}
            {!isConnected && (
              <p className="card-meta muted">Connect your SD card to import games</p>
            )}
          </div>
          <button
            className="btn-secondary"
            onClick={onImportFromSD}
            disabled={!isConnected || !hasGamesOnSD}
          >
            Scan SD Card
          </button>
        </div>

        {/* Import Labels from SD Card */}
        <div className={`empty-state-card ${!isConnected || !hasLabelsOnSD ? 'disabled' : ''}`}>
          <div className="card-icon">🏷️</div>
          <div className="card-content">
            <h3>Import Labels from SD Card</h3>
            <p>
              Download the label artwork already on your SD card. This is the fastest way to get
              started if you've previously set up labels on your Analogue 3D.
            </p>
            {isConnected && hasLabelsOnSD && sdStatus.labels && (
              <p className="card-meta">
                {sdStatus.labels.entryCount} labels ({sdStatus.labels.fileSizeFormatted})
              </p>
            )}
            {isConnected && !hasLabelsOnSD && !loading && (
              <p className="card-meta muted">No labels.db found on SD card</p>
            )}
            {!isConnected && (
              <p className="card-meta muted">Connect your SD card to import labels</p>
            )}
          </div>
          <button
            className="btn-primary"
            onClick={onSyncLabelsFromSD}
            disabled={!isConnected || !hasLabelsOnSD}
          >
            Download Labels
          </button>
        </div>

        {/* Import labels.db from Computer */}
        <div className="empty-state-card">
          <div className="card-icon">💾</div>
          <div className="card-content">
            <h3>Import labels.db File</h3>
            <p>
              Import a labels.db file from your computer. Great for restoring a backup or using
              a community-shared collection.
            </p>
            <p className="card-meta">
              <a
                href="https://github.com/retrogamecorps/Analogue-3D-Images"
                target="_blank"
                rel="noopener noreferrer"
              >
                Browse community labels &rarr;
              </a>
            </p>
          </div>
          <button className="btn-secondary" onClick={onImportLabelsDb}>
            Choose File
          </button>
        </div>
      </div>
    </div>
  );
}
