import { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { isStaticMode } from '../App';
import { ServicesContext } from '../contexts/ServicesContext';
import { useLibrarySync } from './LibrarySyncIndicator';
import { LibrarySyncModal } from './LibrarySyncModal';
import { CartridgeDetailPanel } from './CartridgeDetailPanel';
import { CartridgeSprite } from './CartridgeSprite';
import { Tooltip } from './ui/Tooltip';
import { usePageTitle, SEO_TITLES } from '../lib/seo';
import type { EnrichedLibraryEntry } from '../types/library';
import './StatsPage.css';

type SortField = 'playTime' | 'addedDate' | 'name' | 'status';
type SortDirection = 'asc' | 'desc';
type FilterMode = 'all' | 'played' | 'unplayed' | 'conflicts';

// Unified entry that combines SD and local data
interface UnifiedEntry {
  cartIdHex: string;
  name?: string;
  // SD card values
  sd?: {
    playTime: number;
    playTimeFormatted: string;
    addedTime: number;
    addedDate?: string;
    index?: number;
  };
  // Local values
  local?: {
    playTime: number;
    playTimeFormatted: string;
    addedTime: number;
    addedDate?: string;
    index?: number;
  };
  // Status flags
  onlyOnSD: boolean;
  onlyOnLocal: boolean;
  hasConflict: boolean;
  // For display - use SD values if available, otherwise local
  displayPlayTime: number;
  displayPlayTimeFormatted: string;
  displayAddedDate?: string;
}

interface StatsPageState {
  sdEntries: EnrichedLibraryEntry[];
  localEntries: EnrichedLibraryEntry[];
  sdExists: boolean;
  localExists: boolean;
  loading: boolean;
  error: string | null;
}

export function StatsPage() {
  usePageTitle(SEO_TITLES.stats || 'Play Stats | A3D Manager');
  const servicesContext = useContext(ServicesContext);
  const { libraryRefreshKey, markLocalChanges, checkSyncStatus } = useLibrarySync();

  const [state, setState] = useState<StatsPageState>({
    sdEntries: [],
    localEntries: [],
    sdExists: false,
    localExists: false,
    loading: true,
    error: null,
  });

  const [sortField, setSortField] = useState<SortField>('playTime');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [selectedCartridge, setSelectedCartridge] = useState<{ cartId: string; name?: string; openStats?: boolean } | null>(null);
  const [labelImageUrls, setLabelImageUrls] = useState<Map<string, string>>(new Map());

  const isConnected = servicesContext?.isSDCardConnected ?? false;

  // Fetch entries from both SD and local
  const fetchEntries = useCallback(async () => {
    // Only show loading spinner on initial load, not on refresh
    setState(s => ({ ...s, loading: s.sdEntries.length === 0 && s.localEntries.length === 0, error: null }));

    try {
      let sdEntries: EnrichedLibraryEntry[] = [];
      let localEntries: EnrichedLibraryEntry[] = [];
      let sdExists = false;
      let localExists = false;

      if (isStaticMode && servicesContext) {
        const { libraryDb, labelsDb, storage, sdCard: sdCardService } = servicesContext.services;
        const browserSDCard = servicesContext.sdCard;

        // Build name lookup map
        const cartMetadata = await labelsDb.loadCartMetadata();
        const metadataMap = new Map<string, string>();
        for (const cart of cartMetadata) {
          metadataMap.set(cart.id.toLowerCase(), cart.name);
        }

        const userCarts = await storage.getUserCarts();
        const userNamesMap = new Map<string, string>();
        for (const uc of userCarts) {
          userNamesMap.set(uc.cartId.toLowerCase(), uc.name);
        }

        const getCartName = (cartIdHex: string): string | undefined => {
          const cartIdLower = cartIdHex.toLowerCase();
          return userNamesMap.get(cartIdLower) || metadataMap.get(cartIdLower);
        };

        // Get local entries
        const localInfo = await libraryDb.getLocalLibraryDbInfo();
        localExists = localInfo?.exists ?? false;
        if (localExists) {
          localEntries = await libraryDb.getAllEntriesEnriched(getCartName);
        }

        // Get SD entries if connected
        if (browserSDCard) {
          const sdInfo = await sdCardService.getLibraryDbInfo(browserSDCard);
          sdExists = sdInfo?.exists ?? false;

          if (sdExists) {
            const sdData = await sdCardService.readLibraryDbFromSD(browserSDCard);
            if (sdData) {
              const parsed = libraryDb.parseLibraryDb(sdData);
              sdEntries = parsed.entries.map(entry =>
                libraryDb.enrichEntry(entry, getCartName(entry.cartIdHex))
              );
            }
          }
        }
      } else {
        // Server mode
        const localResponse = await fetch('/api/library/entries');
        if (localResponse.ok) {
          const localData = await localResponse.json();
          localExists = localData.exists;
          localEntries = localData.entries || [];
        }
      }

      setState({
        sdEntries,
        localEntries,
        sdExists,
        localExists,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState(s => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load library data',
      }));
    }
  }, [servicesContext]);

  // Load label images
  const loadLabelImages = useCallback(async (entries: EnrichedLibraryEntry[]) => {
    if (!isStaticMode || !servicesContext) return;

    const { labelsDb } = servicesContext.services;
    const newUrls = new Map<string, string>();

    for (const entry of entries) {
      try {
        const url = await labelsDb.getLabelsDbImageUrl(entry.cartIdHex);
        if (url) {
          newUrls.set(entry.cartIdHex, url);
        }
      } catch {
        // Ignore errors
      }
    }

    setLabelImageUrls(prev => {
      prev.forEach((url, cartId) => {
        if (!newUrls.has(cartId)) {
          URL.revokeObjectURL(url);
        }
      });
      return newUrls;
    });
  }, [servicesContext]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries, libraryRefreshKey]);

  useEffect(() => {
    const allEntries = [...state.sdEntries, ...state.localEntries];
    const uniqueEntries = Array.from(
      new Map(allEntries.map(e => [e.cartIdHex, e])).values()
    );
    if (uniqueEntries.length > 0) {
      loadLabelImages(uniqueEntries);
    }
  }, [state.sdEntries, state.localEntries, loadLabelImages]);

  useEffect(() => {
    return () => {
      labelImageUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  // Create unified entries that merge SD and local data
  const unifiedEntries = useMemo((): UnifiedEntry[] => {
    const sdMap = new Map(state.sdEntries.map(e => [e.cartIdHex.toLowerCase(), e]));
    const localMap = new Map(state.localEntries.map(e => [e.cartIdHex.toLowerCase(), e]));

    // Get all unique cart IDs
    const allCartIds = new Set([...sdMap.keys(), ...localMap.keys()]);

    const entries: UnifiedEntry[] = [];

    for (const cartId of allCartIds) {
      const sdEntry = sdMap.get(cartId);
      const localEntry = localMap.get(cartId);

      const onlyOnSD = !!sdEntry && !localEntry;
      const onlyOnLocal = !sdEntry && !!localEntry;

      // Check for conflicts (different values)
      let hasConflict = false;
      if (sdEntry && localEntry) {
        hasConflict =
          sdEntry.playTime !== localEntry.playTime ||
          sdEntry.addedTime !== localEntry.addedTime;
      }

      // Use SD as primary source if available
      const primary = sdEntry || localEntry!;

      entries.push({
        cartIdHex: primary.cartIdHex,
        name: primary.name,
        sd: sdEntry ? {
          playTime: sdEntry.playTime,
          playTimeFormatted: sdEntry.playTimeFormatted || '0m',
          addedTime: sdEntry.addedTime,
          addedDate: sdEntry.addedDate,
          index: sdEntry.index,
        } : undefined,
        local: localEntry ? {
          playTime: localEntry.playTime,
          playTimeFormatted: localEntry.playTimeFormatted || '0m',
          addedTime: localEntry.addedTime,
          addedDate: localEntry.addedDate,
          index: localEntry.index,
        } : undefined,
        onlyOnSD,
        onlyOnLocal,
        hasConflict,
        displayPlayTime: primary.playTime,
        displayPlayTimeFormatted: primary.playTimeFormatted || '0m',
        displayAddedDate: primary.addedDate,
      });
    }

    return entries;
  }, [state.sdEntries, state.localEntries]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalGames = unifiedEntries.length;
    const played = unifiedEntries.filter(e => e.displayPlayTime > 0).length;
    const totalPlayTime = unifiedEntries.reduce((sum, e) => sum + e.displayPlayTime, 0);
    const conflicts = unifiedEntries.filter(e => e.hasConflict || e.onlyOnSD || e.onlyOnLocal).length;

    return { totalGames, played, totalPlayTime, conflicts };
  }, [unifiedEntries]);

  // Sort and filter
  const displayedEntries = useMemo(() => {
    let filtered = [...unifiedEntries];

    // Apply filter
    switch (filterMode) {
      case 'played':
        filtered = filtered.filter(e => e.displayPlayTime > 0);
        break;
      case 'unplayed':
        filtered = filtered.filter(e => e.displayPlayTime === 0);
        break;
      case 'conflicts':
        filtered = filtered.filter(e => e.hasConflict || e.onlyOnSD || e.onlyOnLocal);
        break;
    }

    // Apply sort
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'playTime':
          comparison = a.displayPlayTime - b.displayPlayTime;
          break;
        case 'addedDate':
          comparison = (a.sd?.addedTime || a.local?.addedTime || 0) - (b.sd?.addedTime || b.local?.addedTime || 0);
          break;
        case 'name':
          const nameA = a.name || a.cartIdHex;
          const nameB = b.name || b.cartIdHex;
          comparison = nameA.localeCompare(nameB);
          break;
        case 'status':
          // Sort by: conflicts first, then only-on-SD, then only-on-local, then synced
          const statusA = a.hasConflict ? 3 : a.onlyOnSD ? 2 : a.onlyOnLocal ? 1 : 0;
          const statusB = b.hasConflict ? 3 : b.onlyOnSD ? 2 : b.onlyOnLocal ? 1 : 0;
          comparison = statusA - statusB;
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [unifiedEntries, sortField, sortDirection, filterMode]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'name' ? 'asc' : 'desc');
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatPlayTime = (seconds: number): string => {
    if (seconds === 0) return '0m';
    if (seconds < 60) return `${seconds}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  };

  // Copy SD value to local
  const handleUseSDValue = async (entry: UnifiedEntry) => {
    if (!entry.sd || !servicesContext) return;

    try {
      const { libraryDb } = servicesContext.services;
      const browserSDCard = servicesContext.sdCard;

      // Use sync-aware function - writes to both local AND SD card when connected
      const result = await libraryDb.updateAndSaveEntryWithSync(
        parseInt(entry.cartIdHex, 16),
        {
          playTime: entry.sd.playTime,
          addedTime: entry.sd.addedTime,
        },
        browserSDCard ?? undefined
      );

      // Update sync status based on whether we synced to SD
      if (result.sdUpdated) {
        checkSyncStatus();
      } else {
        markLocalChanges();
      }

      fetchEntries();
    } catch (err) {
      console.error('Failed to update local entry:', err);
    }
  };

  // Copy local value to SD (would need to sync)
  const handleUseLocalValue = async (entry: UnifiedEntry) => {
    if (!entry.local || !servicesContext) return;
    // For now, just open sync modal - full implementation would update SD directly
    setShowSyncModal(true);
  };

  if (state.loading) {
    return (
      <div className="stats-page">
        <div className="stats-page-loading">
          <div className="spinner" />
          <p>Loading play statistics...</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="stats-page">
        <div className="stats-page-error">
          <p className="error-message">{state.error}</p>
          <button className="btn-secondary" onClick={fetchEntries}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const noData = !state.sdExists && !state.localExists;
  const hasBothSources = state.sdExists && state.localExists;
  const isSynced = hasBothSources && stats.conflicts === 0;

  return (
    <div className="stats-page">
      <div className="stats-page-header">
        <h1>Play Statistics</h1>
        <div className="stats-page-actions">
          {isConnected && (
            isSynced ? (
              <button className="btn-secondary" disabled>
                Synced
              </button>
            ) : (
              <button className="btn-primary" onClick={() => setShowSyncModal(true)}>
                Sync Library
              </button>
            )
          )}
        </div>
      </div>

      {/* Source Status */}
      <div className="stats-source-status">
        <div className={`source-badge ${state.sdExists ? 'active' : 'inactive'}`}>
          <span className="source-dot" />
          SD Card {state.sdExists ? `(${state.sdEntries.length})` : '(none)'}
        </div>
        <div className={`source-badge ${state.localExists ? 'active' : 'inactive'}`}>
          <span className="source-dot" />
          Local {state.localExists ? `(${state.localEntries.length})` : '(none)'}
        </div>
        {hasBothSources && stats.conflicts > 0 && (
          <div className="source-badge conflict">
            <span className="source-dot" />
            {stats.conflicts} {stats.conflicts === 1 ? 'difference' : 'differences'}
          </div>
        )}
      </div>

      {/* No Data State */}
      {noData && (
        <div className="stats-page-empty">
          <h2>No Play Statistics</h2>
          {isConnected ? (
            <p>
              No library.db found on your SD card. Play some games on your Analogue 3D
              to start tracking play statistics.
            </p>
          ) : (
            <p>
              Connect your SD card to view play statistics, or sync your library.db
              to keep a local backup.
            </p>
          )}
        </div>
      )}

      {/* Data exists */}
      {!noData && (
        <>
          {/* Summary */}
          <div className="stats-summary">
            <div className="summary-stat">
              <span className="summary-value">{stats.totalGames}</span>
              <span className="summary-label">Games</span>
            </div>
            <div className="summary-stat">
              <span className="summary-value">{stats.played}</span>
              <span className="summary-label">Played</span>
            </div>
            <div className="summary-stat">
              <span className="summary-value">{formatPlayTime(stats.totalPlayTime)}</span>
              <span className="summary-label">Total Time</span>
            </div>
          </div>

          {/* Controls */}
          <div className="stats-controls">
            <div className="filter-buttons">
              <button
                className={`filter-btn ${filterMode === 'all' ? 'active' : ''}`}
                onClick={() => setFilterMode('all')}
              >
                All ({stats.totalGames})
              </button>
              <button
                className={`filter-btn ${filterMode === 'played' ? 'active' : ''}`}
                onClick={() => setFilterMode('played')}
              >
                Played ({stats.played})
              </button>
              <button
                className={`filter-btn ${filterMode === 'unplayed' ? 'active' : ''}`}
                onClick={() => setFilterMode('unplayed')}
              >
                Unplayed ({stats.totalGames - stats.played})
              </button>
              {hasBothSources && stats.conflicts > 0 && (
                <button
                  className={`filter-btn filter-btn-conflict ${filterMode === 'conflicts' ? 'active' : ''}`}
                  onClick={() => setFilterMode('conflicts')}
                >
                  Differences ({stats.conflicts})
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="stats-table-container">
            <table className="stats-table">
              <thead>
                <tr>
                  <th className="cart-sprite-col"></th>
                  <th
                    className={`sortable ${sortField === 'name' ? 'sorted' : ''}`}
                    onClick={() => handleSort('name')}
                  >
                    Game
                    {sortField === 'name' && (
                      <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>
                    )}
                  </th>
                  <th
                    className={`sortable text-right ${sortField === 'playTime' ? 'sorted' : ''}`}
                    onClick={() => handleSort('playTime')}
                  >
                    Play Time
                    {sortField === 'playTime' && (
                      <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>
                    )}
                  </th>
                  <th
                    className={`sortable ${sortField === 'addedDate' ? 'sorted' : ''}`}
                    onClick={() => handleSort('addedDate')}
                  >
                    Added
                    {sortField === 'addedDate' && (
                      <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>
                    )}
                  </th>
                  {hasBothSources && (
                    <th
                      className={`sortable status-col ${sortField === 'status' ? 'sorted' : ''}`}
                      onClick={() => handleSort('status')}
                    >
                      Status
                      {sortField === 'status' && (
                        <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>
                      )}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {displayedEntries.map((entry) => (
                  <StatsTableRow
                    key={entry.cartIdHex}
                    entry={entry}
                    hasBothSources={hasBothSources}
                    labelImageUrl={labelImageUrls.get(entry.cartIdHex)}
                    formatDate={formatDate}
                    onSelectCartridge={(cartId, name, openStats) =>
                      setSelectedCartridge({ cartId, name, openStats })
                    }
                    onUseSDValue={() => handleUseSDValue(entry)}
                    onUseLocalValue={() => handleUseLocalValue(entry)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Sync Modal */}
      <LibrarySyncModal
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        onSyncComplete={() => fetchEntries()}
      />

      {/* Cartridge Detail Panel */}
      {selectedCartridge && (
        <CartridgeDetailPanel
          key={selectedCartridge.cartId}
          cartId={selectedCartridge.cartId}
          gameName={selectedCartridge.name}
          initialTab={selectedCartridge.openStats ? 'stats' : 'label'}
          onClose={() => setSelectedCartridge(null)}
          onUpdate={() => fetchEntries()}
          onDelete={() => {
            fetchEntries();
            setSelectedCartridge(null);
          }}
        />
      )}
    </div>
  );
}

// Separate component for table rows to handle expanded state
interface StatsTableRowProps {
  entry: UnifiedEntry;
  hasBothSources: boolean;
  labelImageUrl?: string;
  formatDate: (date?: string) => string;
  onSelectCartridge: (cartId: string, name?: string, openStats?: boolean) => void;
  onUseSDValue: () => void;
  onUseLocalValue: () => void;
}

function StatsTableRow({
  entry,
  hasBothSources,
  labelImageUrl,
  formatDate,
  onSelectCartridge,
  onUseSDValue,
  onUseLocalValue,
}: StatsTableRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const showConflictIndicator = entry.hasConflict || entry.onlyOnSD || entry.onlyOnLocal;
  const isUnplayed = entry.displayPlayTime === 0;

  // Determine status badge
  let statusBadge = null;
  if (entry.hasConflict) {
    statusBadge = (
      <Tooltip content="Values differ between SD and local">
        <span className="status-badge status-conflict" onClick={() => setExpanded(!expanded)}>
          Conflict
        </span>
      </Tooltip>
    );
  } else if (entry.onlyOnSD) {
    statusBadge = (
      <Tooltip content="Only exists on SD card, not in local backup">
        <span className="status-badge status-sd-only">SD Only</span>
      </Tooltip>
    );
  } else if (entry.onlyOnLocal) {
    statusBadge = (
      <Tooltip content="Only exists in local backup, not on SD card">
        <span className="status-badge status-local-only">Local Only</span>
      </Tooltip>
    );
  } else if (hasBothSources) {
    statusBadge = (
      <Tooltip content="SD card and local backup are in sync">
        <span className="status-badge status-synced">Synced</span>
      </Tooltip>
    );
  }

  return (
    <>
      <tr className={`${isUnplayed ? 'unplayed' : ''} ${showConflictIndicator ? 'has-conflict' : ''}`}>
        <td className="cart-sprite-col">
          <button
            className="cart-sprite-btn"
            onClick={() => onSelectCartridge(entry.cartIdHex, entry.name)}
            title="View cartridge details"
          >
            <CartridgeSprite
              artworkUrl={labelImageUrl || ''}
              alt={entry.name || entry.cartIdHex}
              size="small"
              loading={!labelImageUrl}
            />
          </button>
        </td>
        <td className="game-name">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="game-name-btn"
              onClick={() => onSelectCartridge(entry.cartIdHex, entry.name)}
            >
              <span className="name">{entry.name || 'Unknown Game'}</span>
              <span className="cart-id">{entry.cartIdHex}</span>
            </button>
            <button
              className="debug-toggle-btn"
              onClick={() => setShowDebug(!showDebug)}
              title="Show debug info"
              style={{
                padding: '2px 6px',
                fontSize: '9px',
                background: showDebug ? 'var(--accent)' : 'var(--surface-alt)',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                cursor: 'pointer',
                color: showDebug ? 'white' : 'var(--text-secondary)',
                flexShrink: 0,
              }}
            >
              DBG
            </button>
          </div>
        </td>
        <td className="text-right">
          {entry.hasConflict ? (
            <span className="conflict-values" onClick={() => setExpanded(!expanded)}>
              {entry.displayPlayTimeFormatted}
              <span className="conflict-indicator" title="Click to see differences">⚡</span>
            </span>
          ) : (
            entry.displayPlayTimeFormatted
          )}
        </td>
        <td>{formatDate(entry.displayAddedDate)}</td>
        {hasBothSources && (
          <td className="status-col">{statusBadge}</td>
        )}
      </tr>

      {/* Debug info row - shows for any entry when DBG is clicked */}
      {showDebug && !entry.hasConflict && (
        <tr className="debug-info-row">
          <td colSpan={hasBothSources ? 5 : 4}>
            <div style={{ padding: '12px', background: 'var(--surface-alt)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Debug Info (copy this for troubleshooting):</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
{`Cart ID: ${entry.cartIdHex}
Cart ID (decimal): ${parseInt(entry.cartIdHex, 16)}
Name: ${entry.name || 'Unknown'}

=== SD Card Raw Values ===
Entry Index: ${entry.sd?.index ?? 'N/A'}
Byte Offset (ID table): ${entry.sd?.index !== undefined ? '0x' + (0x100 + entry.sd.index * 4).toString(16) : 'N/A'}
Byte Offset (extended data): ${entry.sd?.index !== undefined ? '0x' + (0x4100 + entry.sd.index * 12).toString(16) : 'N/A'}
addedTime (raw): ${entry.sd?.addedTime ?? 'N/A'}
addedTime (hex): ${entry.sd?.addedTime !== undefined ? '0x' + entry.sd.addedTime.toString(16).padStart(8, '0') : 'N/A'}
addedTime (little-endian bytes): ${entry.sd?.addedTime !== undefined ? (() => {
  const v = entry.sd.addedTime;
  return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff].map(b => b.toString(16).padStart(2, '0')).join(' ');
})() : 'N/A'}
addedDate (converted): ${entry.sd?.addedDate || 'N/A'}
playTime (seconds): ${entry.sd?.playTime ?? 'N/A'}

=== Local Raw Values ===
Entry Index: ${entry.local?.index ?? 'N/A'}
Byte Offset (ID table): ${entry.local?.index !== undefined ? '0x' + (0x100 + entry.local.index * 4).toString(16) : 'N/A'}
Byte Offset (extended data): ${entry.local?.index !== undefined ? '0x' + (0x4100 + entry.local.index * 12).toString(16) : 'N/A'}
addedTime (raw): ${entry.local?.addedTime ?? 'N/A'}
addedTime (hex): ${entry.local?.addedTime !== undefined ? '0x' + entry.local.addedTime.toString(16).padStart(8, '0') : 'N/A'}
addedTime (little-endian bytes): ${entry.local?.addedTime !== undefined ? (() => {
  const v = entry.local.addedTime;
  return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff].map(b => b.toString(16).padStart(2, '0')).join(' ');
})() : 'N/A'}
addedDate (converted): ${entry.local?.addedDate || 'N/A'}
playTime (seconds): ${entry.local?.playTime ?? 'N/A'}

=== Format Info ===
addedTime = Unix timestamp / 60 (minutes since Jan 1, 1970)
Current Date as addedTime: ${Math.floor(Date.now() / 1000 / 60)}
To calculate: addedTime = Math.floor(Unix_timestamp / 60)`}
              </pre>
              <button
                onClick={() => setShowDebug(false)}
                style={{ marginTop: '8px', padding: '4px 8px', fontSize: '11px' }}
              >
                Close Debug
              </button>
            </div>
          </td>
        </tr>
      )}

      {/* Expanded conflict details row */}
      {expanded && entry.hasConflict && (
        <tr className="conflict-details-row">
          <td colSpan={hasBothSources ? 5 : 4}>
            <div className="conflict-details">
              <div className="conflict-comparison">
                <div className="conflict-source">
                  <h4>SD Card</h4>
                  <div className="conflict-values-list">
                    <div className="conflict-value">
                      <span className="label">Play Time:</span>
                      <span className={`value ${entry.sd?.playTime !== entry.local?.playTime ? 'differs' : ''}`}>
                        {entry.sd?.playTimeFormatted || '0m'}
                      </span>
                    </div>
                    <div className="conflict-value">
                      <span className="label">Added:</span>
                      <span className={`value ${entry.sd?.addedTime !== entry.local?.addedTime ? 'differs' : ''}`}>
                        {formatDate(entry.sd?.addedDate)}
                      </span>
                    </div>
                  </div>
                  <button className="btn-sm btn-use-value" onClick={onUseSDValue}>
                    Use SD Values
                  </button>
                </div>

                <div className="conflict-divider">
                  <span>vs</span>
                </div>

                <div className="conflict-source">
                  <h4>Local</h4>
                  <div className="conflict-values-list">
                    <div className="conflict-value">
                      <span className="label">Play Time:</span>
                      <span className={`value ${entry.sd?.playTime !== entry.local?.playTime ? 'differs' : ''}`}>
                        {entry.local?.playTimeFormatted || '0m'}
                      </span>
                    </div>
                    <div className="conflict-value">
                      <span className="label">Added:</span>
                      <span className={`value ${entry.sd?.addedTime !== entry.local?.addedTime ? 'differs' : ''}`}>
                        {formatDate(entry.local?.addedDate)}
                      </span>
                    </div>
                  </div>
                  <button className="btn-sm btn-use-value" onClick={onUseLocalValue}>
                    Use Local Values
                  </button>
                </div>
              </div>

              <button className="btn-ghost btn-collapse" onClick={() => setExpanded(false)}>
                Collapse
              </button>

              {/* Debug info - raw values for troubleshooting */}
              <div className="debug-info" style={{ marginTop: '16px', padding: '12px', background: 'var(--surface-alt)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Debug Info (copy this for troubleshooting):</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
{`Cart ID: ${entry.cartIdHex}
Name: ${entry.name || 'Unknown'}

=== SD Card Raw Values ===
addedTime (raw): ${entry.sd?.addedTime ?? 'N/A'}
addedTime (hex): ${entry.sd?.addedTime !== undefined ? '0x' + entry.sd.addedTime.toString(16).padStart(8, '0') : 'N/A'}
addedDate (converted): ${entry.sd?.addedDate || 'N/A'}
playTime (seconds): ${entry.sd?.playTime ?? 'N/A'}

=== Local Raw Values ===
addedTime (raw): ${entry.local?.addedTime ?? 'N/A'}
addedTime (hex): ${entry.local?.addedTime !== undefined ? '0x' + entry.local.addedTime.toString(16).padStart(8, '0') : 'N/A'}
addedDate (converted): ${entry.local?.addedDate || 'N/A'}
playTime (seconds): ${entry.local?.playTime ?? 'N/A'}`}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
