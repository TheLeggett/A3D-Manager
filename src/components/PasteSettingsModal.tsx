import { useState, useEffect, useContext } from 'react';
import { useSettingsClipboard, isStaticMode } from '../App';
import { ServicesContext } from '../contexts/ServicesContext';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import './PasteSettingsModal.css';

interface PasteSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPasteComplete: () => void;
  selectedCartIds: string[];
  cartIdToName: Record<string, string | undefined>;
  sdCardPath?: string;
}

export function PasteSettingsModal({
  isOpen,
  onClose,
  onPasteComplete,
  selectedCartIds,
  cartIdToName,
  sdCardPath,
}: PasteSettingsModalProps) {
  const { copiedSettings } = useSettingsClipboard();
  const servicesContext = useContext(ServicesContext);
  const [isPasting, setIsPasting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ success: number; failed: number } | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsPasting(false);
      setError(null);
      setResults(null);
    }
  }, [isOpen]);

  const handlePaste = async () => {
    if (!copiedSettings) return;
    setIsPasting(true);
    setError(null);
    setResults(null);

    let successCount = 0;
    let failCount = 0;

    try {
      for (const targetCartId of selectedCartIds) {
        try {
          // Determine the appropriate title for this target cartridge
          // Priority: existing target title > system game name > fallback to "Unknown Cartridge"
          let targetTitle = 'Unknown Cartridge';

          // Static mode: use browser services
          if (isStaticMode && servicesContext) {
            const { settings: settingsService } = servicesContext.services;
            const browserSDCard = servicesContext.sdCard;

            // First, try to get the target's existing settings
            try {
              const existingInfo = await settingsService.getLocalSettings(targetCartId);
              if (existingInfo.exists && existingInfo.settings?.title &&
                  existingInfo.settings.title !== 'Unknown Cartridge') {
                targetTitle = existingInfo.settings.title;
              }
            } catch {
              // Ignore errors fetching existing settings
            }

            // If still "Unknown Cartridge", try the system game name
            if (targetTitle === 'Unknown Cartridge') {
              const systemName = cartIdToName[targetCartId];
              if (systemName && systemName !== 'Unknown Cartridge') {
                targetTitle = systemName;
              }
            }

            // Create settings for target cart with the appropriate title
            const settingsForTarget = {
              ...copiedSettings.settings,
              title: targetTitle,
            };

            // Save settings to local
            await settingsService.saveLocalSettings(targetCartId, settingsForTarget);

            // If SD card is connected, also upload to SD
            if (browserSDCard) {
              await settingsService.uploadSettingsToSD(browserSDCard, targetCartId, targetTitle);
            }

            successCount++;
            continue;
          }

          // Server mode: use API
          // First, try to get the target's existing settings
          try {
            const existingResponse = await fetch(`/api/cartridges/${targetCartId}/settings`);
            if (existingResponse.ok) {
              const existingData = await existingResponse.json();
              if (existingData.local?.settings?.title &&
                  existingData.local.settings.title !== 'Unknown Cartridge') {
                targetTitle = existingData.local.settings.title;
              }
            }
          } catch {
            // Ignore errors fetching existing settings
          }

          // If still "Unknown Cartridge", try the system game name
          if (targetTitle === 'Unknown Cartridge') {
            const systemName = cartIdToName[targetCartId];
            if (systemName && systemName !== 'Unknown Cartridge') {
              targetTitle = systemName;
            }
          }

          // Create settings for target cart with the appropriate title
          const settingsForTarget = {
            ...copiedSettings.settings,
            title: targetTitle,
          };

          // Save settings to local
          const response = await fetch(`/api/cartridges/${targetCartId}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settingsForTarget),
          });

          if (!response.ok) {
            throw new Error(`Failed to save settings for ${targetCartId}`);
          }

          // If SD card is connected, also upload to SD
          if (sdCardPath) {
            await fetch(`/api/cartridges/${targetCartId}/settings/upload`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sdCardPath }),
            });
          }

          successCount++;
        } catch (err) {
          console.error(`Failed to paste settings to ${targetCartId}:`, err);
          failCount++;
        }
      }

      setResults({ success: successCount, failed: failCount });

      // If all succeeded, auto-close after a brief delay
      if (failCount === 0) {
        setTimeout(() => {
          // Reset state before closing so next open shows confirmation
          setResults(null);
          setError(null);
          setIsPasting(false);
          onPasteComplete();
        }, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Paste failed');
    } finally {
      setIsPasting(false);
    }
  };

  const handleClose = () => {
    setResults(null);
    setError(null);
    onClose();
  };

  const footer = results ? (
    <div className="paste-results-footer">
      {results.failed === 0 ? (
        <span className="paste-success-message">All settings applied successfully!</span>
      ) : (
        <Button variant="primary" onClick={handleClose}>
          Done
        </Button>
      )}
    </div>
  ) : (
    <>
      <Button variant="ghost" onClick={handleClose} disabled={isPasting}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handlePaste} disabled={isPasting}>
        {isPasting ? 'Pasting...' : `Paste to ${selectedCartIds.length} Cartridge${selectedCartIds.length !== 1 ? 's' : ''}`}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Paste Settings"
      footer={footer}
      size="sm"
    >
      <div className="paste-settings-content">
        {!results ? (
          <>
            <div className="paste-info">
              <div className="paste-source">
                <span className="paste-label">Copy settings from:</span>
                <span className="paste-value">{copiedSettings?.gameName ?? 'Unknown'}</span>
                <code className="paste-cart-id">{copiedSettings?.cartId ?? ''}</code>
              </div>
              <div className="paste-arrow">→</div>
              <div className="paste-target">
                <span className="paste-label">Apply to:</span>
                <span className="paste-value">
                  {selectedCartIds.length} cartridge{selectedCartIds.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            <div className="paste-note">
              <p>This will copy all display and hardware settings to the selected cartridges.</p>
              {sdCardPath && (
                <p className="paste-sd-note">Settings will also be synced to the connected SD card.</p>
              )}
            </div>
          </>
        ) : (
          <div className="paste-results">
            {results.success > 0 && (
              <div className="paste-result-success">
                <span className="result-icon">✓</span>
                <span>Successfully applied settings to {results.success} cartridge{results.success !== 1 ? 's' : ''}</span>
              </div>
            )}
            {results.failed > 0 && (
              <div className="paste-result-failed">
                <span className="result-icon">✗</span>
                <span>Failed to apply settings to {results.failed} cartridge{results.failed !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        )}

        {error && <div className="error-message">{error}</div>}
      </div>
    </Modal>
  );
}
