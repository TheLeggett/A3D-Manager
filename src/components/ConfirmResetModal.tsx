import { useState, useEffect } from 'react';
import { Modal, Button } from './ui';

interface ConfirmResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  entryCount?: number;
}

export function ConfirmResetModal({ isOpen, onClose, onConfirm, entryCount }: ConfirmResetModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setConfirmText('');
    }
  }, [isOpen]);

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Clear All Labels"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={resetting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleReset}
            disabled={!isConfirmed || resetting}
            loading={resetting}
          >
            Delete All Labels
          </Button>
        </>
      }
    >
      <div className="warning-box warning-box--with-icon">
        <span className="warning-box__icon">⚠️</span>
        <div>
          <strong className="warning-box__title">This action cannot be undone</strong>
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
    </Modal>
  );
}
