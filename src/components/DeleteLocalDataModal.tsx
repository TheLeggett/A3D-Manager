import { useState, useEffect } from 'react';
import { Modal, Button } from './ui';

export type LocalDataType = 'labels' | 'owned-carts' | 'user-carts' | 'game-data' | 'all';

interface DeleteLocalDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
  dataType: LocalDataType;
}

const DATA_TYPE_INFO: Record<LocalDataType, {
  title: string;
  description: string;
  warning: string;
  endpoint: string;
}> = {
  labels: {
    title: 'Delete Local Labels Database',
    description: 'This will delete your local labels.db file containing all cartridge artwork.',
    warning: 'You will need to re-import a labels.db file to see cartridge artwork again.',
    endpoint: '/api/local-data/labels',
  },
  'owned-carts': {
    title: 'Delete Owned Cartridges List',
    description: 'This will clear your list of owned cartridges.',
    warning: 'You can re-import your owned cartridges from your SD card at any time.',
    endpoint: '/api/local-data/owned-carts',
  },
  'user-carts': {
    title: 'Delete Custom Cart Names',
    description: 'This will delete all custom names you\'ve added for unrecognized cartridges.',
    warning: 'Cartridges without names in our database will show as unnamed.',
    endpoint: '/api/local-data/user-carts',
  },
  'game-data': {
    title: 'Delete Game Settings & Data',
    description: 'This will delete all per-game settings and game_pak.bin files stored locally.',
    warning: 'Game settings can be re-imported from your SD card.',
    endpoint: '/api/local-data/game-data',
  },
  all: {
    title: 'Reset All Local Data',
    description: 'This will delete ALL local data and completely reset the application.',
    warning: 'This includes: labels database, owned cartridges, custom cart names, and all game settings.',
    endpoint: '/api/local-data/all',
  },
};

export function DeleteLocalDataModal({ isOpen, onClose, onDeleted, dataType }: DeleteLocalDataModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const info = DATA_TYPE_INFO[dataType];
  const confirmWord = dataType === 'all' ? 'reset' : 'delete';

  useEffect(() => {
    if (!isOpen) {
      setConfirmText('');
      setError(null);
    }
  }, [isOpen]);

  const isConfirmed = confirmText.toLowerCase() === confirmWord;

  const handleDelete = async () => {
    try {
      setDeleting(true);
      setError(null);

      const response = await fetch(info.endpoint, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Delete failed');
      }

      setConfirmText('');
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={info.title}
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
            {dataType === 'all' ? 'Reset Everything' : 'Delete'}
          </Button>
        </>
      }
    >
      <div className="warning-box warning-box--with-icon">
        <span className="warning-box__icon">⚠️</span>
        <div>
          <strong className="warning-box__title">This action cannot be undone</strong>
          <p>{info.description}</p>
          <p>{info.warning}</p>
        </div>
      </div>

      {error && (
        <div className="warning-box" style={{ marginTop: '1rem' }}>
          <p><strong>Error:</strong> {error}</p>
        </div>
      )}

      <div className="form-group" style={{ marginTop: '1.5rem' }}>
        <label>Type "{confirmWord}" to confirm</label>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={confirmWord}
          autoComplete="off"
        />
      </div>
    </Modal>
  );
}
