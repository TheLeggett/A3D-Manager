import { useState } from 'react';

interface ConfirmResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  entryCount?: number;
}

export function ConfirmResetModal({ isOpen, onClose, onConfirm, entryCount }: ConfirmResetModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);

  if (!isOpen) return null;

  const isConfirmed = confirmText.toLowerCase() === 'delete';

  const handleReset = async () => {
    try {
      setResetting(true);

      const response = await fetch('/api/labels/reset', {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reset');
      }

      setConfirmText('');
      onConfirm();
      onClose();
    } catch (err) {
      console.error('Reset failed:', err);
    } finally {
      setResetting(false);
    }
  };

  const handleClose = () => {
    setConfirmText('');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal confirm-reset-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Clear All Labels</h2>
          <button className="close-btn" onClick={handleClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="warning-banner">
            <span className="warning-icon">⚠️</span>
            <div>
              <strong>This action cannot be undone</strong>
              <p>
                This will permanently delete {entryCount ? `all ${entryCount} cartridge labels` : 'your labels database'}.
                You can import a new labels.db or add cartridges individually afterward.
              </p>
            </div>
          </div>

          <div className="form-group">
            <label>Type "delete" to confirm</label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="delete"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={handleClose} disabled={resetting}>
            Cancel
          </button>
          <button
            className="btn-danger"
            onClick={handleReset}
            disabled={!isConfirmed || resetting}
          >
            {resetting ? 'Deleting...' : 'Delete All Labels'}
          </button>
        </div>
      </div>
    </div>
  );
}
