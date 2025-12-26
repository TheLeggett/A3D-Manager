import { useState } from 'react';
import { useSDCard } from '../App';
import { ConnectionIndicator } from './ConnectionIndicator';
import { LabelSyncIndicator } from './LabelSyncIndicator';
import { LabelSyncModal } from './LabelSyncModal';
import './SDCardSelector.css';

export function SDCardSelector() {
  const { selectedSDCard } = useSDCard();
  const isConnected = selectedSDCard !== null;
  const [showSyncModal, setShowSyncModal] = useState(false);

  return (
    <div className="sd-card-status-group">
      <div className="sd-card-status">
        <span className="sd-card-label text-pixel">
          {isConnected ? 'SD Card Connected' : 'SD Card Disconnected'}
        </span>
        <ConnectionIndicator connected={isConnected} />
      </div>
      <LabelSyncIndicator onSyncClick={() => setShowSyncModal(true)} />
      <LabelSyncModal
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
      />
    </div>
  );
}
