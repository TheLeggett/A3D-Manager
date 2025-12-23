import { useState } from 'react';
import type { Game } from '../types';

interface GameEditorProps {
  game: Game;
  onSave: (id: string, updates: { title?: string }) => Promise<void>;
  onClose: () => void;
}

export function GameEditor({ game, onSave, onClose }: GameEditorProps) {
  const [title, setTitle] = useState(game.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title cannot be empty');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSave(game.id, { title: title.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Game</h2>
          <button className="close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter game title"
            />
          </div>

          <div className="form-group">
            <label>Cartridge ID</label>
            <code className="readonly">{game.id}</code>
          </div>

          <div className="form-group">
            <label>Folder Name Preview</label>
            <code className="readonly">
              {title.trim() || 'Untitled'} {game.id}
            </code>
          </div>

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
