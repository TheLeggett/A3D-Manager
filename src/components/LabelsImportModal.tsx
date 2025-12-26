import { useState, useRef, useEffect } from 'react';
import { Modal, Button } from './ui';
import { useLabelSync } from './LabelSyncIndicator';

type ImportMode = 'replace' | 'merge-overwrite' | 'merge-skip';

interface LabelsImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  currentStatus: {
    hasLabels: boolean;
    entryCount?: number;
    fileSizeMB?: string;
  } | null;
}

export function LabelsImportModal({
  isOpen,
  onClose,
  onImportComplete,
  currentStatus,
}: LabelsImportModalProps) {
  const { markLocalChanges } = useLabelSync();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('replace');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setDragActive(false);
      setImportMode('replace');
    }
  }, [isOpen]);

  const handleFileSelect = async (file: File) => {
    if (!file.name.endsWith('.db')) {
      setError('Please select a labels.db file');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', currentStatus?.hasLabels ? importMode : 'replace');

      const response = await fetch('/api/labels/import', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Import failed');
      }

      await response.json();

      markLocalChanges(); // Mark that local labels have changed
      onImportComplete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={currentStatus?.hasLabels ? 'Update labels.db' : 'Import labels.db'}
      size="lg"
      className="labels-import-modal"
      footer={
        <Button variant="secondary" onClick={onClose} disabled={uploading}>
          Cancel
        </Button>
      }
    >
      {/* Current Status */}
      {currentStatus?.hasLabels && (
        <div className="current-status">
          <strong>Current:</strong> {currentStatus.entryCount} labels ({currentStatus.fileSizeMB} MB)
        </div>
      )}

      {/* Import Mode Selection - only when there's existing data */}
      {currentStatus?.hasLabels && (
        <div className="import-mode-section">
          <h4>Import Mode</h4>
          <div className="import-mode-options">
            <label className={`import-mode-option ${importMode === 'replace' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="importMode"
                value="replace"
                checked={importMode === 'replace'}
                onChange={() => setImportMode('replace')}
              />
              <div className="option-content">
                <strong>Replace All</strong>
                <span>Remove existing labels and use only the imported file</span>
              </div>
            </label>

            <label className={`import-mode-option ${importMode === 'merge-overwrite' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="importMode"
                value="merge-overwrite"
                checked={importMode === 'merge-overwrite'}
                onChange={() => setImportMode('merge-overwrite')}
              />
              <div className="option-content">
                <strong>Merge &amp; Update</strong>
                <span>Add new labels and update any that already exist</span>
              </div>
            </label>

            <label className={`import-mode-option ${importMode === 'merge-skip' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="importMode"
                value="merge-skip"
                checked={importMode === 'merge-skip'}
                onChange={() => setImportMode('merge-skip')}
              />
              <div className="option-content">
                <strong>Add Missing Only</strong>
                <span>Only add labels for cartridges you don't have yet</span>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Explanation */}
      <div className="info-section">
        <h4>What is labels.db?</h4>
        <p>
          The <code>labels.db</code> file contains cartridge label artwork that displays
          on the N64 game carousel in the Analogue 3D UI. This file is user-generated —
          the Analogue 3D doesn't ship with one.
        </p>
      </div>

      {/* Location on Analogue 3D */}
      <div className="info-section">
        <h4>Location on your SD Card</h4>
        <code className="file-path">/Library/N64/Images/labels.db</code>
      </div>

      {/* Community Resource */}
      <div className="info-section">
        <h4>Need a starting point?</h4>
        <p>
          GitHub user <strong>retrogamecorps</strong> has shared stock label images
          that were provided to Analogue 3D reviewers:
        </p>
        <a
          href="https://github.com/retrogamecorps/Analogue-3D-Images"
          target="_blank"
          rel="noopener noreferrer"
          className="resource-link"
        >
          github.com/retrogamecorps/Analogue-3D-Images
        </a>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* File Upload */}
      <div
        className={`drop-zone ${dragActive ? 'active' : ''}`}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".db"
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />
        {uploading ? (
          <div className="drop-zone-content">
            <p>Importing...</p>
          </div>
        ) : (
          <div className="drop-zone-content">
            <p>Drop <strong>labels.db</strong> here</p>
            <p className="hint">or click to select</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
