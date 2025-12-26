import { useState, useEffect } from 'react';
import { Modal, Button } from './ui';

interface DeleteSDLabelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
  sdCardPath: string;
}

export function DeleteSDLabelsModal({ isOpen, onClose, onDeleted, sdCardPath }: DeleteSDLabelsModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setConfirmText('');
      setError(null);
    }
  }, [isOpen]);

  const isConfirmed = confirmText.toLowerCase() === 'delete';

  const handleDelete = async () => {
    try {
      setDeleting(true);
      setError(null);

      const response = await fetch(`/api/sd-card/labels?sdCardPath=${encodeURIComponent(sdCardPath)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete labels.db');
      }

      setConfirmText('');
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete labels.db');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Labels from SD Card"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={!isConfirmed || deleting}
            loading={deleting}
          >
            Delete labels.db
          </Button>
        </>
      }
    >
      <div className="warning-box warning-box--with-icon">
        <span className="warning-box__icon">⚠️</span>
        <div>
          <strong className="warning-box__title">This action cannot be undone</strong>
          <p>
            This will permanently delete the <span className="text-code">labels.db</span> file
            from your SD card. This file stores all of your custom cartridge artwork that
            displays on your Analogue 3D.
          </p>
        </div>
      </div>

      <div className="info-box" style={{ marginTop: '1rem' }}>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
          <strong>SD Card:</strong> {sdCardPath}
        </p>
      </div>

      {error && (
        <div className="warning-box" style={{ marginTop: '1rem' }}>
          <p><strong>Error:</strong> {error}</p>
        </div>
      )}

      <div className="form-group" style={{ marginTop: '1.5rem' }}>
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
