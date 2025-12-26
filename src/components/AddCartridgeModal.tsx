import { useState, useRef, useEffect, useCallback } from 'react';
import { Modal, Button } from './ui';
import { useLabelSync } from './LabelSyncIndicator';

interface AddCartridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: () => void;
}

interface LookupResult {
  found: boolean;
  source?: 'internal' | 'user';
  cartId: string;
  name?: string;
  region?: string;
  languages?: string[];
  videoMode?: string;
  gameCode?: string;
}

export function AddCartridgeModal({ isOpen, onClose, onAdd }: AddCartridgeModalProps) {
  const { markLocalChanges } = useLabelSync();
  const [cartId, setCartId] = useState('');
  const [gameName, setGameName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isValidCartId = /^[0-9a-fA-F]{8}$/.test(cartId);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCartId('');
      setGameName('');
      setFile(null);
      setPreview(null);
      setError(null);
      setLookupResult(null);
    }
  }, [isOpen]);

  // Look up cart ID when valid
  const lookupCartId = useCallback(async (id: string) => {
    if (!/^[0-9a-fA-F]{8}$/.test(id)) {
      setLookupResult(null);
      return;
    }

    try {
      setLookingUp(true);
      setError(null);
      const response = await fetch(`/api/labels/lookup/${id.toLowerCase()}`);
      if (!response.ok) throw new Error('Lookup failed');
      const data: LookupResult = await response.json();
      setLookupResult(data);

      // Pre-fill name if found
      if (data.found && data.name) {
        setGameName(data.name);
      } else {
        setGameName('');
      }
    } catch (err) {
      console.error('Lookup error:', err);
      setLookupResult(null);
    } finally {
      setLookingUp(false);
    }
  }, []);

  // Debounced lookup when cart ID changes
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (isValidCartId) {
        lookupCartId(cartId);
      } else {
        setLookupResult(null);
        setGameName('');
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [cartId, isValidCartId, lookupCartId, isOpen]);

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

  const handleSubmit = async () => {
    if (!isValidCartId || !file) {
      setError('Please provide a valid cart ID and label image');
      return;
    }

    // Require name for unknown carts
    const needsName = !lookupResult?.found || lookupResult.source === 'user';
    if (needsName && !gameName.trim()) {
      setError('Please provide a game name for this cartridge');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // If this is a new unknown cart, save the user cart entry first
      if (!lookupResult?.found && gameName.trim()) {
        const userCartResponse = await fetch(`/api/labels/user-cart/${cartId.toLowerCase()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: gameName.trim() }),
        });

        if (!userCartResponse.ok) {
          const data = await userCartResponse.json();
          throw new Error(data.error || 'Failed to save cart name');
        }
      }

      // Now add the label image
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`/api/labels/add/${cartId.toLowerCase()}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add cartridge');
      }

      markLocalChanges(); // Update sync status indicator
      onAdd();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add cartridge');
    } finally {
      setSaving(false);
    }
  };

  // Determine if name field should be shown and if it's editable
  const showNameField = isValidCartId && !lookingUp;
  const isNameEditable = !lookupResult?.found || lookupResult.source === 'user';
  const isNameRequired = isNameEditable && !lookupResult?.found;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add New Cartridge"
      size="md"
      className="add-cartridge-modal"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!isValidCartId || !file || saving || (isNameRequired && !gameName.trim())}
            loading={saving}
          >
            Add Cartridge
          </Button>
        </>
      }
    >
      <p className="modal-description">
        Enter the 8-character hex cart ID. If we recognize it, the game name will
        be filled automatically.
      </p>

      <div className="form-group">
        <label>Cart ID</label>
        <input
          type="text"
          value={cartId}
          onChange={(e) => setCartId(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 8))}
          placeholder="e.g., b393776d"
          maxLength={8}
          className={cartId && !isValidCartId ? 'invalid' : ''}
          autoFocus
        />
        {cartId && !isValidCartId && (
          <span className="field-hint error">Must be exactly 8 hex characters</span>
        )}
        {lookingUp && (
          <span className="field-hint">Looking up cart ID...</span>
        )}
      </div>

      {showNameField && (
        <div className="form-group">
          <label>
            Game Name
            {lookupResult?.found && lookupResult.source === 'internal' && (
              <span className="label-badge label-badge-internal">Known Game</span>
            )}
            {lookupResult?.found && lookupResult.source === 'user' && (
              <span className="label-badge label-badge-user">Custom Name</span>
            )}
            {!lookupResult?.found && (
              <span className="label-badge label-badge-unknown">Unknown Cart</span>
            )}
          </label>
          {isNameEditable ? (
            <input
              type="text"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder={isNameRequired ? "Enter game name (required)" : "Enter game name"}
              className={isNameRequired && !gameName.trim() ? 'needs-input' : ''}
            />
          ) : (
            <div className="readonly-field">{gameName}</div>
          )}
          {lookupResult?.found && lookupResult.source === 'internal' && lookupResult.region && (
            <span className="field-hint">
              {lookupResult.region}
              {lookupResult.videoMode && lookupResult.videoMode !== 'Unknown' && ` • ${lookupResult.videoMode}`}
            </span>
          )}
          {!lookupResult?.found && (
            <span className="field-hint">
              This cart ID isn't in our database. This name is for your reference in A3D Manager only — the Analogue 3D will display its own internal name or "Unknown Cartridge".
            </span>
          )}
        </div>
      )}

      {showNameField && (
        <div className="form-group">
          <label>Label Image</label>
          <div
            className={`drop-zone ${dragActive ? 'active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            style={{ display: 'none' }}
          />
          <span className="field-hint">Image will be resized to 74×86 pixels</span>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
    </Modal>
  );
}
