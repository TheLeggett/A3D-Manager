import { useState, useCallback, useContext } from 'react';
import { useSDCard, isStaticMode } from '../App';
import { ServicesContext } from '../contexts/ServicesContext';
import { ConnectionIndicator } from './ConnectionIndicator';
import { CombinedSyncIndicator } from './CombinedSyncIndicator';
import { LabelSyncModal } from './LabelSyncModal';
import { LibrarySyncModal } from './LibrarySyncModal';
import './SDCardSelector.css';

export function SDCardSelector() {
  // Use ServicesContext in static mode, legacy context in server mode
  // Note: In static mode, ServicesProvider wraps this component
  // In server mode, ServicesContext will be null
  const legacyContext = useSDCard();
  const servicesContext = useContext(ServicesContext);

  // Get connection state from the appropriate context
  const isConnected = isStaticMode && servicesContext
    ? servicesContext.isSDCardConnected
    : legacyContext.selectedSDCard !== null;

  const sdCardName = isStaticMode && servicesContext
    ? servicesContext.sdCard?.name
    : legacyContext.selectedSDCard?.name;

  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showLibrarySyncModal, setShowLibrarySyncModal] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);

  // Handle clicking on the SD card status to select/change SD card
  const handleSDCardClick = useCallback(async () => {
    if (!isStaticMode || !servicesContext) return;

    setIsSelecting(true);
    try {
      // Try to select SD card - the API will throw if not supported
      await servicesContext.selectSDCard();
    } catch (err) {
      if (err instanceof Error) {
        // Show user-friendly error for API not available
        if (err.message.includes('File System Access API')) {
          alert(err.message);
        } else {
          console.error('Error selecting SD card:', err);
        }
      }
    } finally {
      setIsSelecting(false);
    }
  }, [servicesContext]);

  // Handle disconnecting SD card
  const handleDisconnect = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isStaticMode && servicesContext) {
      servicesContext.disconnectSDCard();
    }
  }, [servicesContext]);

  // Determine the display text
  const getStatusText = () => {
    if (isSelecting) return 'Selecting...';
    if (isConnected && sdCardName) return `Connected: ${sdCardName}`;
    if (isConnected) return 'SD Card Connected';
    if (isStaticMode) return 'Click to Select SD Card';
    return 'SD Card Disconnected';
  };

  return (
    <div className="sd-card-status-group">
      <div
        className={`sd-card-status ${isStaticMode ? 'sd-card-status--clickable' : ''}`}
        onClick={isStaticMode ? handleSDCardClick : undefined}
        role={isStaticMode ? 'button' : undefined}
        tabIndex={isStaticMode ? 0 : undefined}
        onKeyDown={isStaticMode ? (e) => e.key === 'Enter' && handleSDCardClick() : undefined}
        title={isStaticMode ? (isConnected ? 'Click to change SD card' : 'Click to select your Analogue 3D SD card folder') : undefined}
      >
        <span className="sd-card-label text-pixel">
          {getStatusText()}
        </span>
        <ConnectionIndicator connected={isConnected} />
        {isStaticMode && isConnected && (
          <button
            className="sd-card-disconnect-btn"
            onClick={handleDisconnect}
            title="Disconnect SD card"
            aria-label="Disconnect SD card"
          >
            ✕
          </button>
        )}
      </div>
      <CombinedSyncIndicator
        onLabelSyncClick={() => setShowSyncModal(true)}
        onLibrarySyncClick={() => setShowLibrarySyncModal(true)}
      />
      <LabelSyncModal
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
      />
      <LibrarySyncModal
        isOpen={showLibrarySyncModal}
        onClose={() => setShowLibrarySyncModal(false)}
      />
    </div>
  );
}
