import { useState, useRef } from 'react';

interface LabelEditorProps {
  cartId: string;
  gameName?: string;
  sdCardPath?: string;
  onClose: () => void;
  onUpdate: () => void;
}

// Strip hex ID from name if it's an "Unknown Cartridge XXXXXXXX" format
function extractCleanName(name: string | undefined, cartId: string): string {
  if (!name) return '';
  // Remove "Unknown Cartridge XXXXXXXX" pattern - just return empty for these
  if (/^Unknown Cartridge\s+[0-9a-fA-F]{8}$/i.test(name)) {
    return '';
  }
  // Remove trailing hex ID if present (e.g., "Game Name abcd1234")
  const hexPattern = new RegExp(`\\s+${cartId}$`, 'i');
  return name.replace(hexPattern, '').trim();
}

export function LabelEditor({ cartId, gameName, onClose, onUpdate }: LabelEditorProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [editedName, setEditedName] = useState(() => extractCleanName(gameName, cartId));
  const [savingName, setSavingName] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const cleanOriginalName = extractCleanName(gameName, cartId);

  // Now reads from local storage only
  const imageUrl = `/api/labels/${cartId}`;

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

  const handleSaveName = async () => {
    if (!editedName.trim()) return;

    try {
      setSavingName(true);
      setError(null);
      setNameSuccess(false);

      const response = await fetch(`/api/cart-db/${cartId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editedName.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save name');
      }

      setNameSuccess(true);
      // Trigger refresh so the list updates
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save name');
    } finally {
      setSavingName(false);
    }
  };

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
            <label>Game Name</label>
            <div className="name-editor">
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                placeholder="Enter game name..."
                disabled={savingName}
              />
              <button
                className="btn-secondary btn-small"
                onClick={handleSaveName}
                disabled={savingName || !editedName.trim() || editedName === cleanOriginalName}
              >
                {savingName ? 'Saving...' : nameSuccess ? 'Saved!' : 'Save Name'}
              </button>
            </div>
            <label>Cart ID</label>
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

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={uploading}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleUpload}
            disabled={!file || uploading}
          >
            {uploading ? 'Uploading...' : 'Update Label'}
          </button>
        </div>
      </div>
    </div>
  );
}
