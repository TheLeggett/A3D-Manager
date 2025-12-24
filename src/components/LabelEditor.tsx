import { useState, useRef, useEffect } from 'react';

interface LabelEditorProps {
  cartId: string;
  gameName?: string;
  sdCardPath?: string;
  onClose: () => void;
  onUpdate: () => void;
  onDelete?: () => void;
}

interface LookupResult {
  found: boolean;
  source?: 'internal' | 'user';
  cartId: string;
  name?: string;
  region?: string;
  videoMode?: string;
}

export function LabelEditor({ cartId, gameName, onClose, onUpdate, onDelete }: LabelEditorProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // User cart editing state
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [editableName, setEditableName] = useState(gameName || '');
  const [savingName, setSavingName] = useState(false);
  const [nameChanged, setNameChanged] = useState(false);

  // Now reads from local storage only
  const imageUrl = `/api/labels/${cartId}`;

  // Look up cart source on mount
  useEffect(() => {
    const lookupCart = async () => {
      try {
        const response = await fetch(`/api/labels/lookup/${cartId}`);
        if (response.ok) {
          const data: LookupResult = await response.json();
          setLookupResult(data);
          if (data.found && data.name) {
            setEditableName(data.name);
          }
        }
      } catch (err) {
        console.error('Failed to lookup cart:', err);
      }
    };
    lookupCart();
  }, [cartId]);

  const isUserCart = lookupResult?.source === 'user';
  const isUnknownCart = lookupResult && !lookupResult.found;
  const canEditName = isUserCart || isUnknownCart;

  const handleFile = (selectedFile: File) => {
    if (!selectedFile.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    setFile(selectedFile);
    setError(null);

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleNameChange = (newName: string) => {
    setEditableName(newName);
    setNameChanged(newName !== (lookupResult?.name || ''));
  };

  const handleSaveName = async () => {
    if (!editableName.trim()) {
      setError('Name cannot be empty');
      return;
    }

    try {
      setSavingName(true);
      setError(null);

      const response = await fetch(`/api/labels/user-cart/${cartId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editableName.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save name');
      }

      setNameChanged(false);
      // Update lookup result
      setLookupResult(prev => prev ? { ...prev, found: true, source: 'user', name: editableName.trim() } : null);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save name');
    } finally {
      setSavingName(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('image', file);

      // Saves to local storage only
      const response = await fetch(`/api/labels/${cartId}`, {
        method: 'PUT',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      onUpdate();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete label for ${cartId}? This cannot be undone.`)) {
      return;
    }

    try {
      setDeleting(true);
      setError(null);

      const response = await fetch(`/api/labels/${cartId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Delete failed');
      }

      // Also delete user cart entry if exists
      if (isUserCart) {
        await fetch(`/api/labels/user-cart/${cartId}`, { method: 'DELETE' });
      }

      onDelete?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const displayName = editableName || gameName;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal label-editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Label</h2>
          <button className="close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="label-info">
            <label>
              Game Name
              {lookupResult?.source === 'internal' && (
                <span className="label-badge label-badge-internal">Known Game</span>
              )}
              {lookupResult?.source === 'user' && (
                <span className="label-badge label-badge-user">Custom Name</span>
              )}
              {isUnknownCart && (
                <span className="label-badge label-badge-unknown">Unknown Cart</span>
              )}
            </label>
            {canEditName ? (
              <div className="name-editor">
                <input
                  type="text"
                  value={editableName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Enter game name"
                />
                {nameChanged && (
                  <button
                    className="btn-primary btn-small"
                    onClick={handleSaveName}
                    disabled={savingName || !editableName.trim()}
                  >
                    {savingName ? 'Saving...' : 'Save'}
                  </button>
                )}
              </div>
            ) : (
              displayName && <span className="readonly">{displayName}</span>
            )}
            {lookupResult?.source === 'internal' && lookupResult.region && (
              <span className="field-hint" style={{ marginTop: '0.25rem' }}>
                {lookupResult.region}
                {lookupResult.videoMode && lookupResult.videoMode !== 'Unknown' && ` • ${lookupResult.videoMode}`}
              </span>
            )}

            <label style={{ marginTop: '1rem' }}>Cart ID</label>
            <code className="readonly">{cartId}</code>
          </div>

          <div className="label-comparison">
            <div className="label-current">
              <h4>Current Label</h4>
              <div className="cart-sprite">
                <img
                  className="cart-artwork"
                  src={imageUrl}
                  alt="Current label"
                />
                <img className="cart-overlay" src="/n64-cart-dark.png" alt="" />
              </div>
            </div>

            <div className="label-new">
              <h4>Select New Label</h4>
              <div
                className={`drop-zone ${dragActive ? 'active' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
              >
                {preview ? (
                  <img src={preview} alt="Preview" className="preview-image" />
                ) : (
                  <div className="drop-zone-content">
                    <p>Drop image here</p>
                    <p className="hint">or click to select</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            style={{ display: 'none' }}
          />

          <p className="artwork-note">
            Image will be resized to 74x86 pixels.
          </p>

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="modal-footer modal-footer-split">
          <button
            className="btn-ghost btn-danger-text"
            onClick={handleDelete}
            disabled={uploading || deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Cartridge'}
          </button>
          <div className="modal-footer-actions">
            <button className="btn-secondary" onClick={onClose} disabled={uploading || deleting}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleUpload}
              disabled={!file || uploading || deleting}
            >
              {uploading ? 'Uploading...' : 'Update Label'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
