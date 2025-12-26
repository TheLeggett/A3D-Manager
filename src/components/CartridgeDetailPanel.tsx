import { useState, useRef, useEffect, useCallback } from 'react';
import { useImageCache } from '../App';
import { IconButton, OptionSelector, ToggleSwitch } from './controls';
import { CartridgeSprite } from './CartridgeSprite';
import { ConnectionIndicator } from './ConnectionIndicator';
import { useLabelSync } from './LabelSyncIndicator';
import './CartridgeDetailPanel.css';

interface CartridgeDetailPanelProps {
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

// Settings types matching backend and settings.md
type BeamConvergence = 'Off' | 'Consumer' | 'Professional';
type ImageSize = 'Fill' | 'Integer' | 'Integer+';
type ImageFit = 'Original' | 'Stretch' | 'Cinema Zoom';
type Sharpness = 'Very Soft' | 'Soft' | 'Medium' | 'Sharp' | 'Very Sharp';
type Region = 'Auto' | 'NTSC' | 'PAL';
type Overclock = 'Auto' | 'Enhanced' | 'Enhanced+' | 'Unleashed';
type DisplayMode = 'bvm' | 'pvm' | 'crt' | 'scanlines' | 'clean';
type InterpolationAlg = 'BC Spline' | 'Bilinear' | 'Blackman Harris' | 'Lanczos2';
type GammaTransfer = 'Tube' | 'Modern' | 'Professional';

interface CRTModeSettings {
  horizontalBeamConvergence: BeamConvergence;
  verticalBeamConvergence: BeamConvergence;
  enableEdgeOvershoot: boolean;
  enableEdgeHardness: boolean;
  imageSize: ImageSize;
  imageFit: ImageFit;
}

interface CleanModeSettings {
  interpolationAlg: InterpolationAlg;
  gammaTransferFunction: GammaTransfer;
  sharpness: Sharpness;
  imageSize: ImageSize;
  imageFit: ImageFit;
}

interface DisplayCatalog {
  bvm: CRTModeSettings;
  pvm: CRTModeSettings;
  crt: CRTModeSettings;
  scanlines: CRTModeSettings;
  clean: CleanModeSettings;
}

interface DisplaySettings {
  odm: DisplayMode;
  catalog: DisplayCatalog;
}

interface HardwareSettings {
  virtualExpansionPak: boolean;
  region: Region;
  disableDeblur: boolean;
  enable32BitColor: boolean;
  disableTextureFiltering: boolean;
  disableAntialiasing: boolean;
  forceOriginalHardware: boolean;
  overclock: Overclock;
}

// Option arrays for controls
const DISPLAY_MODE_OPTIONS: DisplayMode[] = ['bvm', 'pvm', 'crt', 'scanlines', 'clean'];
const DISPLAY_MODE_LABELS: Record<DisplayMode, string> = {
  bvm: 'BVM',
  pvm: 'PVM',
  crt: 'CRT',
  scanlines: 'Scanlines',
  clean: 'Clean',
};
const BEAM_CONVERGENCE_OPTIONS: BeamConvergence[] = ['Off', 'Consumer', 'Professional'];
const IMAGE_SIZE_OPTIONS: ImageSize[] = ['Fill', 'Integer', 'Integer+'];
const IMAGE_FIT_OPTIONS: ImageFit[] = ['Original', 'Stretch', 'Cinema Zoom'];
const SHARPNESS_OPTIONS: Sharpness[] = ['Very Soft', 'Soft', 'Medium', 'Sharp', 'Very Sharp'];
const INTERPOLATION_OPTIONS: InterpolationAlg[] = ['BC Spline', 'Bilinear', 'Blackman Harris', 'Lanczos2'];
const GAMMA_OPTIONS: GammaTransfer[] = ['Tube', 'Modern', 'Professional'];
const REGION_OPTIONS: Region[] = ['Auto', 'NTSC', 'PAL'];
const OVERCLOCK_OPTIONS: Overclock[] = ['Auto', 'Enhanced', 'Enhanced+', 'Unleashed'];
const EDGE_HARDNESS_OPTIONS = ['Soft', 'Hard'];
const BIT_COLOR_OPTIONS = ['Off', 'Auto'];

interface CartridgeSettings {
  title: string;
  display: DisplaySettings;
  hardware: HardwareSettings;
}

// API response types matching backend
interface SettingsInfoItem {
  exists: boolean;
  source: 'local' | 'sd';
  path: string;
  lastModified?: string;
  settings?: CartridgeSettings;
}

interface SettingsInfoResponse {
  local: SettingsInfoItem;
  sd: SettingsInfoItem | null;
}

interface GamePakSaveInfo {
  pagesUsed: number;
  pagesFree: number;
  percentUsed: number;
}

interface GamePakInfoItem {
  exists: boolean;
  source: 'local' | 'sd';
  path: string;
  size?: number;
  lastModified?: string;
  isValidSize?: boolean;
  saveInfo?: GamePakSaveInfo;
}

interface GamePakInfoResponse {
  local: GamePakInfoItem;
  sd: GamePakInfoItem | null;
}

type TabId = 'label' | 'settings' | 'gamepak';

export function CartridgeDetailPanel({
  cartId,
  gameName,
  sdCardPath,
  onClose,
  onUpdate,
  onDelete,
}: CartridgeDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('label');
  const [isOwned, setIsOwned] = useState(false);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const { imageCacheBuster: globalCacheBuster } = useImageCache();
  const [localCacheBuster, setLocalCacheBuster] = useState(Date.now());
  // Combine global and local cache busters
  const imageCacheBuster = Math.max(globalCacheBuster, localCacheBuster);

  // Check ownership status
  useEffect(() => {
    const checkOwnership = async () => {
      try {
        const response = await fetch('/api/cartridges/owned');
        if (response.ok) {
          const data = await response.json();
          const ownedIds = data.cartridges.map((c: { cartId: string }) => c.cartId.toLowerCase());
          setIsOwned(ownedIds.includes(cartId.toLowerCase()));
        }
      } catch (err) {
        console.error('Failed to check ownership:', err);
      }
    };
    checkOwnership();
  }, [cartId]);

  // Look up cart info on mount
  useEffect(() => {
    const lookupCart = async () => {
      try {
        const response = await fetch(`/api/labels/lookup/${cartId}`);
        if (response.ok) {
          const data: LookupResult = await response.json();
          setLookupResult(data);
        }
      } catch (err) {
        console.error('Failed to lookup cart:', err);
      }
    };
    lookupCart();
  }, [cartId]);

  const handleToggleOwned = async (newValue: boolean) => {
    try {
      if (newValue) {
        await fetch(`/api/cartridges/owned/${cartId}`, { method: 'POST' });
      } else {
        await fetch(`/api/cartridges/owned/${cartId}`, { method: 'DELETE' });
      }
      setIsOwned(newValue);
    } catch (err) {
      console.error('Failed to toggle ownership:', err);
    }
  };

  const displayName = lookupResult?.name || gameName || 'Unknown Cartridge';

  return (
    <div className="slide-over-overlay" onClick={onClose}>
      <div className="slide-over-panel" onClick={(e) => e.stopPropagation()}>
        <div className="slide-over-header">
          <CartridgeSprite
            artworkUrl={`/api/labels/${cartId}?v=${imageCacheBuster}`}
            alt={displayName}
            color="dark"
            size="small"
          />
          <div className="slide-over-title">
            <h2>{displayName}</h2>
            <code className="text-label text-accent">{cartId}</code>
          </div>
          <IconButton onClick={onClose} aria-label="Close panel">
            &times;
          </IconButton>
        </div>

        {/* Tabs & Ownership Toggle */}
        <div className="slide-over-tabs">
          <div className="slide-over-tabs-left">
            <button
              className={`tab-btn ${activeTab === 'label' ? 'active' : ''}`}
              onClick={() => setActiveTab('label')}
            >
              Label
            </button>
            <button
              className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              Settings
            </button>
          </div>
          <div className="ownership-toggle">
            <ToggleSwitch
              label=""
              checked={isOwned}
              onChange={handleToggleOwned}
              onText="OWNED"
              offText="NOT OWNED"
            />
          </div>
        </div>

        <div className="slide-over-content">
          {activeTab === 'label' && (
            <LabelTab
              cartId={cartId}
              lookupResult={lookupResult}
              setLookupResult={setLookupResult}
              imageCacheBuster={imageCacheBuster}
              onImageUpdate={() => setLocalCacheBuster(Date.now())}
              onUpdate={onUpdate}
              onClose={onClose}
              onDelete={onDelete}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsTab
              cartId={cartId}
              sdCardPath={sdCardPath}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Label Tab - moved from LabelEditor
// ============================================================================

interface LabelTabProps {
  cartId: string;
  lookupResult: LookupResult | null;
  setLookupResult: React.Dispatch<React.SetStateAction<LookupResult | null>>;
  imageCacheBuster: number;
  onImageUpdate: () => void;
  onUpdate: () => void;
  onClose: () => void;
  onDelete?: () => void;
}

function LabelTab({
  cartId,
  lookupResult,
  setLookupResult,
  imageCacheBuster,
  onImageUpdate,
  onUpdate,
  onClose,
  onDelete,
}: LabelTabProps) {
  const { markLocalChanges } = useLabelSync();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // User cart editing state
  const [editableName, setEditableName] = useState(lookupResult?.name || '');
  const [savingName, setSavingName] = useState(false);
  const [nameChanged, setNameChanged] = useState(false);

  // Update editable name when lookup result changes
  useEffect(() => {
    if (lookupResult?.name) {
      setEditableName(lookupResult.name);
    }
  }, [lookupResult?.name]);

  const imageUrl = `/api/labels/${cartId}?v=${imageCacheBuster}`;

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

      const response = await fetch(`/api/labels/${cartId}`, {
        method: 'PUT',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      setFile(null);
      setPreview(null);
      onImageUpdate();
      onUpdate();
      markLocalChanges(); // Mark that local labels have changed
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

      if (isUserCart) {
        await fetch(`/api/labels/user-cart/${cartId}`, { method: 'DELETE' });
      }

      markLocalChanges(); // Mark that local labels have changed
      onDelete?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="tab-content label-tab">
      {/* Game Name */}
      <div className="field-group">
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
            <div className="name-editor-row">
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
            {lookupResult?.source === 'user' && (
              <span className="text-caption">
                This cart ID isn't in our database. You can edit the name above.
              </span>
            )}
            {isUnknownCart && (
              <span className="text-caption">
                This cart ID isn't in our database. Add a name above to identify it.
              </span>
            )}
          </div>
        ) : (
          <div className="known-game-info">
            <span className="readonly">{editableName || 'Unknown'}</span>
            {lookupResult?.source === 'internal' && lookupResult.region && (
              <span className="text-subtle">
                {lookupResult.region}
                {lookupResult.videoMode && lookupResult.videoMode !== 'Unknown' && ` • ${lookupResult.videoMode}`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Label Preview & Upload */}
      <div className="label-comparison">
        <div className="label-current">
          <h4 className="text-label">Current Label</h4>
          <CartridgeSprite
            artworkUrl={imageUrl}
            alt="Current label"
            color="dark"
            size="large"
          />
        </div>

        <div className="label-new">
          <h4 className="text-label">New Label</h4>
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

      <p className="artwork-note text-muted">
        Image will be resized to 74x86 pixels.
      </p>

      {error && <div className="error-message">{error}</div>}

      {/* Actions */}
      <div className="tab-actions">
        <button
          className="btn-ghost btn-danger-text"
          onClick={handleDelete}
          disabled={uploading || deleting}
        >
          {deleting ? 'Deleting...' : 'Delete Cartridge'}
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
  );
}

// ============================================================================
// Settings Tab
// ============================================================================

interface SettingsTabProps {
  cartId: string;
  sdCardPath?: string;
}

// Helper to compare settings objects (shallow comparison of key values)
function settingsAreDifferent(a: CartridgeSettings | undefined, b: CartridgeSettings | undefined): boolean {
  if (!a || !b) return true;
  // Compare JSON strings for deep equality
  return JSON.stringify(a) !== JSON.stringify(b);
}

// Default settings factory
function createDefaultSettings(title: string = 'Unknown Cartridge'): CartridgeSettings {
  const defaultCRTSettings: CRTModeSettings = {
    horizontalBeamConvergence: 'Professional',
    verticalBeamConvergence: 'Professional',
    enableEdgeOvershoot: false,
    enableEdgeHardness: false,
    imageSize: 'Fill',
    imageFit: 'Original',
  };

  return {
    title,
    display: {
      odm: 'crt',
      catalog: {
        bvm: { ...defaultCRTSettings },
        pvm: { ...defaultCRTSettings, enableEdgeOvershoot: true },
        crt: { ...defaultCRTSettings, enableEdgeOvershoot: true, horizontalBeamConvergence: 'Consumer', verticalBeamConvergence: 'Consumer' },
        scanlines: { ...defaultCRTSettings, horizontalBeamConvergence: 'Off', verticalBeamConvergence: 'Off' },
        clean: {
          interpolationAlg: 'BC Spline',
          gammaTransferFunction: 'Tube',
          sharpness: 'Medium',
          imageSize: 'Fill',
          imageFit: 'Original',
        },
      },
    },
    hardware: {
      virtualExpansionPak: true,
      region: 'Auto',
      disableDeblur: false,
      enable32BitColor: true,
      disableTextureFiltering: false,
      disableAntialiasing: false,
      forceOriginalHardware: false,
      overclock: 'Auto',
    },
  };
}

type ConflictResolution = 'pending' | 'use-local' | 'use-sd' | 'resolved';

function SettingsTab({ cartId, sdCardPath }: SettingsTabProps) {
  const [info, setInfo] = useState<SettingsInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [conflictState, setConflictState] = useState<ConflictResolution>('resolved');
  const [autoImported, setAutoImported] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isConnected = !!sdCardPath;

  const fetchInfo = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = sdCardPath ? `?sdCardPath=${encodeURIComponent(sdCardPath)}` : '';
      const response = await fetch(`/api/cartridges/${cartId}/settings${params}`);
      if (response.ok) {
        const data = await response.json();
        setInfo(data);
        return data;
      } else {
        const emptyInfo = { local: { exists: false, source: 'local' as const, path: '' }, sd: null };
        setInfo(emptyInfo);
        return emptyInfo;
      }
    } catch (err) {
      setError('Failed to load settings info');
      return null;
    } finally {
      setLoading(false);
    }
  }, [cartId, sdCardPath]);

  // Initial load and auto-import logic
  useEffect(() => {
    const loadAndCheck = async () => {
      const data = await fetchInfo();
      if (!data) return;

      const hasLocal = data.local?.exists;
      const hasSD = data.sd?.exists;

      // Auto-import from SD if no local settings but SD has them
      if (!hasLocal && hasSD && sdCardPath && !autoImported) {
        setAutoImported(true);
        setSyncing(true);
        try {
          const response = await fetch(`/api/cartridges/${cartId}/settings/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sdCardPath }),
          });
          if (response.ok) {
            await fetchInfo();
          }
        } catch (err) {
          console.error('Auto-import failed:', err);
        } finally {
          setSyncing(false);
        }
        return;
      }

      // Check for conflicts if both exist
      if (hasLocal && hasSD && data.local.settings && data.sd?.settings) {
        if (settingsAreDifferent(data.local.settings, data.sd.settings)) {
          setConflictState('pending');
        } else {
          setConflictState('resolved');
        }
      } else {
        setConflictState('resolved');
      }
    };

    loadAndCheck();
  }, [cartId, sdCardPath, autoImported, fetchInfo]);

  const handleResolveConflict = async (choice: 'use-local' | 'use-sd') => {
    if (!sdCardPath) return;
    setSyncing(true);
    setError(null);

    try {
      if (choice === 'use-local') {
        // Upload local to SD
        const response = await fetch(`/api/cartridges/${cartId}/settings/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdCardPath }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to sync to SD card');
        }
      } else {
        // Download SD to local
        const response = await fetch(`/api/cartridges/${cartId}/settings/download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdCardPath }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to sync from SD card');
        }
      }

      setConflictState('resolved');
      await fetchInfo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateDefaults = async () => {
    setSyncing(true);
    setError(null);

    try {
      const defaultSettings = createDefaultSettings();
      const response = await fetch(`/api/cartridges/${cartId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaultSettings),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create settings');
      }

      await fetchInfo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create settings');
    } finally {
      setSyncing(false);
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      setError(null);
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`/api/cartridges/${cartId}/settings/import`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Import failed');
      }

      // If connected, also upload to SD
      if (sdCardPath) {
        await fetch(`/api/cartridges/${cartId}/settings/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdCardPath }),
        });
      }

      await fetchInfo();
      setConflictState('resolved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch(`/api/cartridges/${cartId}/settings/export`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Export failed');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cartId}-settings.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete local settings? This cannot be undone.')) return;
    try {
      setError(null);
      const response = await fetch(`/api/cartridges/${cartId}/settings`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Delete failed');
      }
      setConflictState('resolved');
      await fetchInfo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  if (loading || syncing) {
    return (
      <div className="tab-content loading">
        {syncing ? 'Syncing settings...' : 'Loading settings...'}
      </div>
    );
  }

  const hasLocal = info?.local?.exists;
  const hasSD = info?.sd?.exists;

  return (
    <div className="tab-content settings-tab">
      {/* Connection Status Banner */}
      <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
        <ConnectionIndicator connected={isConnected} />
        <span className="status-text">
          {isConnected ? 'SD Card Connected' : 'SD Card Not Connected'}
        </span>
        <span className="status-note">
          {isConnected ? 'Changes will sync to both local and SD card' : 'Changes will only save locally'}
        </span>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Conflict Resolution UI */}
      {conflictState === 'pending' && (
        <div className="conflict-resolution">
          <h4>Settings Conflict Detected</h4>
          <p>Your local settings differ from the SD card. Which version would you like to use?</p>
          <div className="conflict-options">
            <button
              className="btn-secondary conflict-btn"
              onClick={() => handleResolveConflict('use-local')}
            >
              <span className="conflict-btn-title">Use Local Settings</span>
              <span className="conflict-btn-desc">Update SD card to match your local settings</span>
            </button>
            <button
              className="btn-secondary conflict-btn"
              onClick={() => handleResolveConflict('use-sd')}
            >
              <span className="conflict-btn-title">Use SD Card Settings</span>
              <span className="conflict-btn-desc">Replace local with SD card settings</span>
            </button>
          </div>
        </div>
      )}

      {/* No settings - show create option */}
      {!hasLocal && !hasSD && conflictState === 'resolved' && (
        <div className="no-settings">
          <p className="empty-message">
            No settings found for this cartridge.
          </p>
          <div className="create-settings-options">
            <button className="btn-primary" onClick={handleCreateDefaults}>
              Create Default Settings
            </button>
            <button
              className="btn-secondary"
              onClick={() => inputRef.current?.click()}
            >
              Import from File
            </button>
          </div>
        </div>
      )}

      {/* Settings Editor - only show when conflict is resolved and we have settings */}
      {hasLocal && info?.local?.settings && conflictState === 'resolved' && (
        <>
          <SettingsEditor
            cartId={cartId}
            settings={info.local.settings}
            sdCardPath={sdCardPath}
            onSave={fetchInfo}
          />

          {/* Secondary Actions */}
          <div className="settings-secondary-actions">
            <button className="btn-ghost" onClick={handleExport}>
              Export to File
            </button>
            <button
              className="btn-ghost"
              onClick={() => inputRef.current?.click()}
            >
              Import from File
            </button>
            <button className="btn-ghost btn-danger-text" onClick={handleDelete}>
              Delete Settings
            </button>
          </div>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])}
        style={{ display: 'none' }}
      />
    </div>
  );
}

// ============================================================================
// Settings Editor Component
// ============================================================================

interface SettingsEditorProps {
  cartId: string;
  settings: CartridgeSettings;
  sdCardPath?: string;
  onSave: () => void;
}

type SettingsEditorTab = 'display' | 'hardware';

function SettingsEditor({ cartId, settings: initialSettings, sdCardPath, onSave }: SettingsEditorProps) {
  const [activeTab, setActiveTab] = useState<SettingsEditorTab>('display');
  const [settings, setSettings] = useState<CartridgeSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const currentDisplayMode = settings.display.odm;
  const isCleanMode = currentDisplayMode === 'clean';

  // Helper to update display settings
  const updateDisplayMode = (mode: DisplayMode) => {
    setSettings(prev => ({
      ...prev,
      display: { ...prev.display, odm: mode }
    }));
    setHasChanges(true);
  };

  // Helper to update CRT mode settings
  const updateCRTSetting = <K extends keyof CRTModeSettings>(
    mode: DisplayMode,
    key: K,
    value: CRTModeSettings[K]
  ) => {
    if (mode === 'clean') return;
    setSettings(prev => ({
      ...prev,
      display: {
        ...prev.display,
        catalog: {
          ...prev.display.catalog,
          [mode]: {
            ...prev.display.catalog[mode as keyof Omit<DisplayCatalog, 'clean'>],
            [key]: value
          }
        }
      }
    }));
    setHasChanges(true);
  };

  // Helper to update Clean mode settings
  const updateCleanSetting = <K extends keyof CleanModeSettings>(
    key: K,
    value: CleanModeSettings[K]
  ) => {
    setSettings(prev => ({
      ...prev,
      display: {
        ...prev.display,
        catalog: {
          ...prev.display.catalog,
          clean: {
            ...prev.display.catalog.clean,
            [key]: value
          }
        }
      }
    }));
    setHasChanges(true);
  };

  // Helper to update hardware settings
  const updateHardwareSetting = <K extends keyof HardwareSettings>(
    key: K,
    value: HardwareSettings[K]
  ) => {
    setSettings(prev => ({
      ...prev,
      hardware: { ...prev.hardware, [key]: value }
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      // Save to local
      const response = await fetch(`/api/cartridges/${cartId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      // If SD card is connected, also save to SD
      if (sdCardPath) {
        const uploadResponse = await fetch(`/api/cartridges/${cartId}/settings/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdCardPath }),
        });

        if (!uploadResponse.ok) {
          const data = await uploadResponse.json();
          throw new Error(data.error || 'Failed to sync to SD card');
        }
      }

      setHasChanges(false);
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Get current CRT mode settings
  const getCRTSettings = (): CRTModeSettings | null => {
    if (isCleanMode) return null;
    return settings.display.catalog[currentDisplayMode as keyof Omit<DisplayCatalog, 'clean'>] as CRTModeSettings;
  };

  const crtSettings = getCRTSettings();

  // Determine if Edge Overshoot is locked based on display mode
  const isEdgeOvershootLocked = currentDisplayMode === 'pvm' || currentDisplayMode === 'crt' || currentDisplayMode === 'scanlines';
  const edgeOvershootLockedValue = currentDisplayMode === 'scanlines' ? false : true;

  return (
    <div className="settings-editor">
      {/* Tab Switcher */}
      <div className="settings-editor-tabs">
        <button
          className={`settings-tab-btn ${activeTab === 'display' ? 'active' : ''}`}
          onClick={() => setActiveTab('display')}
        >
          Display
        </button>
        <button
          className={`settings-tab-btn ${activeTab === 'hardware' ? 'active' : ''}`}
          onClick={() => setActiveTab('hardware')}
        >
          Hardware
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Display Settings */}
      {activeTab === 'display' && (
        <div className="settings-editor-content">
          <OptionSelector
            label="Display Mode"
            options={DISPLAY_MODE_OPTIONS.map(m => DISPLAY_MODE_LABELS[m])}
            value={DISPLAY_MODE_LABELS[currentDisplayMode]}
            onChange={(val) => {
              const mode = DISPLAY_MODE_OPTIONS.find(m => DISPLAY_MODE_LABELS[m] === val);
              if (mode) updateDisplayMode(mode);
            }}
          />

          {/* CRT-based mode settings (BVM, PVM, CRT, Scanlines) */}
          {!isCleanMode && crtSettings && (
            <>
              <OptionSelector
                label="Horiz. Beam Convergence"
                options={BEAM_CONVERGENCE_OPTIONS}
                value={crtSettings.horizontalBeamConvergence}
                onChange={(val) => updateCRTSetting(currentDisplayMode, 'horizontalBeamConvergence', val as BeamConvergence)}
              />

              <OptionSelector
                label="Vert. Beam Convergence"
                options={BEAM_CONVERGENCE_OPTIONS}
                value={crtSettings.verticalBeamConvergence}
                onChange={(val) => updateCRTSetting(currentDisplayMode, 'verticalBeamConvergence', val as BeamConvergence)}
              />

              {isEdgeOvershootLocked ? (
                <div className="control-row disabled">
                  <span className="control-label">Edge Overshoot</span>
                  <div className="toggle-container">
                    <span className={`toggle-text ${edgeOvershootLockedValue ? 'on' : 'off'}`}>
                      {edgeOvershootLockedValue ? 'ON' : 'OFF'}
                    </span>
                    <div className={`toggle-switch disabled ${edgeOvershootLockedValue ? 'on' : 'off'}`}>
                      <span className="toggle-thumb">
                        {edgeOvershootLockedValue && <span className="toggle-thumb-dot" />}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <ToggleSwitch
                  label="Edge Overshoot"
                  checked={crtSettings.enableEdgeOvershoot}
                  onChange={(val) => updateCRTSetting(currentDisplayMode, 'enableEdgeOvershoot', val)}
                />
              )}

              <OptionSelector
                label="Edge Hardness"
                options={EDGE_HARDNESS_OPTIONS}
                value={crtSettings.enableEdgeHardness ? 'Hard' : 'Soft'}
                onChange={(val) => updateCRTSetting(currentDisplayMode, 'enableEdgeHardness', val === 'Hard')}
              />

              <OptionSelector
                label="Image Size"
                options={IMAGE_SIZE_OPTIONS}
                value={crtSettings.imageSize}
                onChange={(val) => updateCRTSetting(currentDisplayMode, 'imageSize', val as ImageSize)}
              />

              <OptionSelector
                label="Image Fit"
                options={IMAGE_FIT_OPTIONS}
                value={crtSettings.imageFit}
                onChange={(val) => updateCRTSetting(currentDisplayMode, 'imageFit', val as ImageFit)}
              />
            </>
          )}

          {/* Clean mode settings */}
          {isCleanMode && settings.display.catalog.clean && (
            <>
              <OptionSelector
                label="Interp. Algorithm"
                options={INTERPOLATION_OPTIONS}
                value={settings.display.catalog.clean.interpolationAlg}
                onChange={(val) => updateCleanSetting('interpolationAlg', val as InterpolationAlg)}
              />

              <OptionSelector
                label="Gamma Transfer"
                options={GAMMA_OPTIONS}
                value={settings.display.catalog.clean.gammaTransferFunction}
                onChange={(val) => updateCleanSetting('gammaTransferFunction', val as GammaTransfer)}
              />

              <OptionSelector
                label="Sharpness"
                options={SHARPNESS_OPTIONS}
                value={settings.display.catalog.clean.sharpness}
                onChange={(val) => updateCleanSetting('sharpness', val as Sharpness)}
              />

              <OptionSelector
                label="Image Size"
                options={IMAGE_SIZE_OPTIONS}
                value={settings.display.catalog.clean.imageSize}
                onChange={(val) => updateCleanSetting('imageSize', val as ImageSize)}
              />

              <OptionSelector
                label="Image Fit"
                options={IMAGE_FIT_OPTIONS}
                value={settings.display.catalog.clean.imageFit}
                onChange={(val) => updateCleanSetting('imageFit', val as ImageFit)}
              />
            </>
          )}
        </div>
      )}

      {/* Hardware Settings */}
      {activeTab === 'hardware' && (
        <div className="settings-editor-content">
          <ToggleSwitch
            label="Virtual Expansion Pak"
            checked={settings.hardware.virtualExpansionPak}
            onChange={(val) => updateHardwareSetting('virtualExpansionPak', val)}
          />

          <OptionSelector
            label="Region"
            options={REGION_OPTIONS}
            value={settings.hardware.region}
            onChange={(val) => updateHardwareSetting('region', val as Region)}
          />

          {/* De-Blur: Note the inverted logic - disableDeblur=false means ON */}
          <ToggleSwitch
            label="De-Blur"
            checked={!settings.hardware.disableDeblur}
            onChange={(val) => updateHardwareSetting('disableDeblur', !val)}
          />

          <OptionSelector
            label="32bit Color"
            options={BIT_COLOR_OPTIONS}
            value={settings.hardware.enable32BitColor ? 'Auto' : 'Off'}
            onChange={(val) => updateHardwareSetting('enable32BitColor', val === 'Auto')}
          />

          <ToggleSwitch
            label="Disable Texture Filtering"
            checked={settings.hardware.disableTextureFiltering}
            onChange={(val) => updateHardwareSetting('disableTextureFiltering', val)}
          />

          <ToggleSwitch
            label="Disable Antialiasing"
            checked={settings.hardware.disableAntialiasing}
            onChange={(val) => updateHardwareSetting('disableAntialiasing', val)}
          />

          <ToggleSwitch
            label="Force Original Hardware"
            checked={settings.hardware.forceOriginalHardware}
            onChange={(val) => updateHardwareSetting('forceOriginalHardware', val)}
          />

          {/* Overclock - disabled when Force Original Hardware is on */}
          {settings.hardware.forceOriginalHardware ? (
            <div className="control-row disabled">
              <span className="control-label">Overclock</span>
              <div className="option-selector disabled">
                <button className="arrow-btn disabled" disabled>
                  <img src="/pixel-arrow-left.png" alt="" className="arrow-icon" />
                </button>
                <span className="option-value">{settings.hardware.overclock}</span>
                <button className="arrow-btn disabled" disabled>
                  <img src="/pixel-arrow-right.png" alt="" className="arrow-icon" />
                </button>
              </div>
            </div>
          ) : (
            <OptionSelector
              label="Overclock"
              options={OVERCLOCK_OPTIONS}
              value={settings.hardware.overclock}
              onChange={(val) => updateHardwareSetting('overclock', val as Overclock)}
            />
          )}
        </div>
      )}

      {/* Save Button */}
      {hasChanges && (
        <div className="settings-editor-actions">
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Game Pak Tab
// ============================================================================

interface GamePakTabProps {
  cartId: string;
  sdCardPath?: string;
}

function GamePakTab({ cartId, sdCardPath }: GamePakTabProps) {
  const [info, setInfo] = useState<GamePakInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchInfo = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = sdCardPath ? `?sdCardPath=${encodeURIComponent(sdCardPath)}` : '';
      const response = await fetch(`/api/cartridges/${cartId}/game-pak${params}`);
      if (response.ok) {
        const data = await response.json();
        setInfo(data);
      } else {
        setInfo({ local: { exists: false, source: 'local', path: '' }, sd: null });
      }
    } catch (err) {
      setError('Failed to load game pak info');
    } finally {
      setLoading(false);
    }
  }, [cartId, sdCardPath]);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  const handleDownloadFromSD = async () => {
    if (!sdCardPath) return;
    try {
      setDownloading(true);
      setError(null);
      const response = await fetch(`/api/cartridges/${cartId}/game-pak/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdCardPath }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Download failed');
      }
      await fetchInfo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const handleUploadToSD = async () => {
    if (!sdCardPath) return;
    try {
      setUploading(true);
      setError(null);
      const response = await fetch(`/api/cartridges/${cartId}/game-pak/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdCardPath }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }
      await fetchInfo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      setError(null);
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`/api/cartridges/${cartId}/game-pak/import`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Import failed');
      }
      await fetchInfo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch(`/api/cartridges/${cartId}/game-pak/export`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Export failed');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cartId}-controller_pak.img`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete local game pak? This cannot be undone.')) return;
    try {
      setError(null);
      const response = await fetch(`/api/cartridges/${cartId}/game-pak`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Delete failed');
      }
      await fetchInfo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  if (loading) {
    return <div className="tab-content loading">Loading game pak info...</div>;
  }

  const hasLocal = info?.local?.exists;
  const hasSD = info?.sd?.exists;
  const localSaveInfo = info?.local?.saveInfo;
  const sdSaveInfo = info?.sd?.saveInfo;

  return (
    <div className="tab-content gamepak-tab">
      <div className="data-status">
        <div className={`status-item ${hasLocal ? 'has-data' : ''}`}>
          <span className="status-icon">{hasLocal ? '✓' : '○'}</span>
          <span>Local Game Pak</span>
          {localSaveInfo && (
            <span className="status-detail">
              ({localSaveInfo.percentUsed}% used)
            </span>
          )}
        </div>
        {sdCardPath && (
          <div className={`status-item ${hasSD ? 'has-data' : ''}`}>
            <span className="status-icon">{hasSD ? '✓' : '○'}</span>
            <span>SD Card Game Pak</span>
            {sdSaveInfo && (
              <span className="status-detail">
                ({sdSaveInfo.percentUsed}% used)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Save Info Details */}
      {(localSaveInfo || sdSaveInfo) && (
        <div className="save-info-details">
          {localSaveInfo && (
            <div className="save-info-card">
              <h4 className="text-label">Local Save Data</h4>
              <div className="save-stats">
                <div className="stat">
                  <span className="stat-value">{localSaveInfo.pagesUsed}</span>
                  <span className="stat-label">Pages Used</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{localSaveInfo.pagesFree}</span>
                  <span className="stat-label">Pages Free</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{localSaveInfo.percentUsed}%</span>
                  <span className="stat-label">Capacity</span>
                </div>
              </div>
              <div className="capacity-bar">
                <div
                  className="capacity-fill"
                  style={{ width: `${localSaveInfo.percentUsed}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      <div className="action-buttons">
        {sdCardPath && hasSD && (
          <button
            className="btn-secondary"
            onClick={handleDownloadFromSD}
            disabled={downloading || uploading}
          >
            {downloading ? 'Downloading...' : 'Download from SD'}
          </button>
        )}

        {sdCardPath && hasLocal && (
          <button
            className="btn-secondary"
            onClick={handleUploadToSD}
            disabled={downloading || uploading}
          >
            {uploading ? 'Uploading...' : 'Upload to SD'}
          </button>
        )}

        <button
          className="btn-secondary"
          onClick={() => inputRef.current?.click()}
        >
          Import from File
        </button>

        {hasLocal && (
          <>
            <button className="btn-secondary" onClick={handleExport}>
              Export
            </button>
            <button className="btn-ghost btn-danger-text" onClick={handleDelete}>
              Delete Local
            </button>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".img,.bin"
        onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])}
        style={{ display: 'none' }}
      />

      {!hasLocal && !hasSD && (
        <p className="empty-message">
          No game pak (controller pak save) available for this cartridge.
          {sdCardPath ? ' Play the game and save data to create a game pak.' : ' Connect an SD card to check for saves.'}
        </p>
      )}

      <div className="info-box">
        <h4 className="text-label">About Game Paks</h4>
        <p>
          Game Paks are 32KB controller pak save files (controller_pak.img).
          These contain save data for games that use the Controller Pak accessory.
          The N64 Controller Pak has 123 user-accessible pages for save data.
        </p>
      </div>
    </div>
  );
}
