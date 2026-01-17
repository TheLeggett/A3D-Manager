import { useState, useEffect, useContext } from 'react';
import { isStaticMode } from '../App';
import { ServicesContext } from '../contexts/ServicesContext';
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CartridgesEmptyState({
  sdCardPath,
  onImportLabelsDb,
  onImportFromSD,
  onSyncLabelsFromSD,
}: CartridgesEmptyStateProps) {
  const servicesContext = useContext(ServicesContext);
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
        // In static mode, use browser services
        if (isStaticMode && servicesContext) {
          const { sdCard: sdCardService } = servicesContext.services;
          const browserSDCard = servicesContext.sdCard;

          if (!browserSDCard?.handle) {
            setSdStatus({ labels: null, games: null });
            return;
          }

          // Check for labels.db
          const labelsInfo = await sdCardService.getLabelsDbInfo(browserSDCard);
          const labels = labelsInfo?.exists ? {
            exists: true,
            fileSize: labelsInfo.size || 0,
            fileSizeFormatted: formatBytes(labelsInfo.size || 0),
            entryCount: labelsInfo.entryCount || 0,
          } : null;

          // Check for games
          const gameFolders = await sdCardService.listGameFolders(browserSDCard);
          const games = gameFolders.length > 0 ? {
            exists: true,
            gameCount: gameFolders.length,
          } : null;

          setSdStatus({ labels, games });
          return;
        }

        // Server mode - use API calls
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
  }, [sdCardPath, servicesContext]);

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
            <h3>Import Owned from SD Card</h3>
            <p>
              Scan your SD card and mark your existing cartridges as owned. Optionally download
              their settings and game pak files. This won't import label artwork.
            </p>
            {isConnected && hasGamesOnSD && (
              <p className="card-meta">
                {sdStatus.games?.gameCount} cartridges found on SD card
              </p>
            )}
            {isConnected && !hasGamesOnSD && !loading && (
              <p className="card-meta muted">No cartridges found on SD card</p>
            )}
            {!isConnected && (
              <p className="card-meta muted">Connect your SD card to import</p>
            )}
          </div>
          <button
            className="btn-secondary"
            onClick={onImportFromSD}
            disabled={!isConnected || !hasGamesOnSD}
          >
            Import Owned from SD
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
              community artwork collections like{' '}
              <a
                href="https://github.com/retrogamecorps/Analogue-3D-Images"
                target="_blank"
                rel="noopener noreferrer"
              >
                Retro Game Corps
              </a>.
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
