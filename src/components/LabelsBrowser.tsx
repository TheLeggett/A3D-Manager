import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useImageCache, useSettingsClipboard } from '../App';
import { CartridgeCard } from './CartridgeCard';
import { Pagination } from './Pagination';
import { LabelsImportModal } from './LabelsImportModal';
import { ImportFromSDModal } from './ImportFromSDModal';
import { ExportBundleModal } from './ExportBundleModal';
import { LabelSyncModal } from './LabelSyncModal';
import { PasteSettingsModal } from './PasteSettingsModal';
import { CartridgesEmptyState } from './CartridgesEmptyState';
import { useLabelSync } from './LabelSyncIndicator';
import { TooltipIcon, Tooltip, Button } from './ui';
import './LabelsBrowser.css';

interface LabelEntry {
  cartId: string;
  index: number;
  name?: string;
  region?: string;
  languages?: string[];
  videoMode?: 'NTSC' | 'PAL' | 'Unknown';
}

interface LabelsPageResponse {
  imported: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
  totalEntries: number;
  totalUnfiltered?: number;
  filters?: {
    region?: string;
    language?: string;
    videoMode?: string;
  };
  entries: LabelEntry[];
}

interface FilterOptions {
  regions: string[];
  languages: string[];
  videoModes: string[];
}

interface LabelsStatus {
  imported: boolean;
  hasLabels?: boolean;
  hasOwnedCarts?: boolean;
  entryCount?: number;
  ownedCount?: number;
  fileSize?: number;
  fileSizeMB?: string;
}

interface LabelsBrowserProps {
  onSelectLabel: (cartId: string, name?: string) => void;
  refreshKey?: number;
  sdCardPath?: string;
}

export function LabelsBrowser({ onSelectLabel, refreshKey, sdCardPath }: LabelsBrowserProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const hasLoadedRef = useRef(false);
  const { imageCacheBuster: globalCacheBuster } = useImageCache();
  const { labelsRefreshKey } = useLabelSync();
  const { copiedSettings } = useSettingsClipboard();
  const [localCacheBuster, setLocalCacheBuster] = useState(0);
  // Combine global and local cache busters
  const imageCacheBuster = Math.max(globalCacheBuster, localCacheBuster);

  const [status, setStatus] = useState<LabelsStatus | null>(null);
  const [entries, setEntries] = useState<LabelEntry[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalEntries, setTotalEntries] = useState(0);
  const [totalUnfiltered, setTotalUnfiltered] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter states - initialize from URL
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [regionFilter, setRegionFilter] = useState<string>(searchParams.get('region') || '');
  const [languageFilter, setLanguageFilter] = useState<string>(searchParams.get('language') || '');
  const [videoModeFilter, setVideoModeFilter] = useState<string>(searchParams.get('videoMode') || '');
  const [ownedFilter, setOwnedFilter] = useState<boolean>(searchParams.get('owned') === 'true');
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem('labelsPageSize');
    return saved ? parseInt(saved, 10) : 48;
  });

  // Modal states
  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportFromSDModal, setShowImportFromSDModal] = useState(false);
  const [showExportBundleModal, setShowExportBundleModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showPasteSettingsModal, setShowPasteSettingsModal] = useState(false);

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCartIds, setSelectedCartIds] = useState<Set<string>>(new Set());

  // Unowned cartridges indicator
  const [unownedOnSDCount, setUnownedOnSDCount] = useState(0);

  const hasActiveFilters = regionFilter || languageFilter || videoModeFilter || searchQuery || ownedFilter;
  const hasClearableFilters = regionFilter || languageFilter || videoModeFilter || searchQuery;

  // Update URL when filters or page change
  const updateURL = useCallback((
    newPage: number,
    filters: {
      search?: string;
      region?: string;
      language?: string;
      videoMode?: string;
      owned?: boolean;
    }
  ) => {
    const params = new URLSearchParams();
    if (newPage > 0) params.set('page', newPage.toString());
    if (filters.search) params.set('search', filters.search);
    if (filters.region) params.set('region', filters.region);
    if (filters.language) params.set('language', filters.language);
    if (filters.videoMode) params.set('videoMode', filters.videoMode);
    if (filters.owned) params.set('owned', 'true');
    setSearchParams(params);
  }, [setSearchParams]);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/labels/status');
      if (!response.ok) throw new Error('Failed to fetch status');
      const data: LabelsStatus = await response.json();
      setStatus(data);
      return data;
    } catch (err) {
      console.error('Error fetching status:', err);
      return null;
    }
  }, []);

  const fetchFilterOptions = useCallback(async () => {
    try {
      const response = await fetch('/api/labels/filter-options');
      if (!response.ok) throw new Error('Failed to fetch filter options');
      const data: FilterOptions = await response.json();
      setFilterOptions(data);
    } catch (err) {
      console.error('Error fetching filter options:', err);
    }
  }, []);

  const fetchPage = useCallback(async (
    pageNum: number,
    options?: {
      region?: string;
      language?: string;
      videoMode?: string;
      search?: string;
      owned?: boolean;
      pageSize?: number;
    }
  ) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('pageSize', (options?.pageSize ?? pageSize).toString());

      // Add filter parameters
      const region = options?.region ?? regionFilter;
      const language = options?.language ?? languageFilter;
      const videoMode = options?.videoMode ?? videoModeFilter;
      const search = options?.search ?? searchQuery;
      const owned = options?.owned ?? ownedFilter;

      if (region) params.set('region', region);
      if (language) params.set('language', language);
      if (videoMode) params.set('videoMode', videoMode);
      if (search) params.set('search', search);
      if (owned) params.set('owned', 'true');

      const response = await fetch(`/api/labels/page/${pageNum}?${params}`);
      if (!response.ok) throw new Error('Failed to fetch labels');

      const data: LabelsPageResponse = await response.json();

      if (!data.imported) {
        setEntries([]);
        setTotalPages(0);
        setTotalEntries(0);
        setTotalUnfiltered(0);
        return;
      }

      setEntries(data.entries);
      setPage(data.page);
      setTotalPages(data.totalPages);
      setTotalEntries(data.totalEntries);
      setTotalUnfiltered(data.totalUnfiltered || data.totalEntries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [regionFilter, languageFilter, videoModeFilter, searchQuery, ownedFilter, pageSize]);

  // Check for unowned cartridges on SD card
  const checkUnownedOnSD = useCallback(async () => {
    if (!sdCardPath) {
      setUnownedOnSDCount(0);
      return;
    }

    try {
      const response = await fetch('/api/cartridges/owned/import-from-sd/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdCardPath }),
      });

      if (response.ok) {
        const result = await response.json();
        const unownedCount = result.summary.total - result.summary.alreadyOwned;
        setUnownedOnSDCount(unownedCount);
      }
    } catch {
      // Silently fail - indicator just won't show
    }
  }, [sdCardPath]);

  // Run check on mount and when SD card changes
  useEffect(() => {
    checkUnownedOnSD();
  }, [checkUnownedOnSD]);

  const handleRefresh = async () => {
    await fetchStatus();
    await fetchPage(0);
    await checkUnownedOnSD();
  };

  const clearAllFilters = () => {
    setRegionFilter('');
    setLanguageFilter('');
    setVideoModeFilter('');
    setSearchQuery('');
    // Preserve ownedFilter - it's not a "clearable" filter
    updateURL(0, { owned: ownedFilter });
  };

  const handlePageChange = (newPage: number) => {
    updateURL(newPage, { search: searchQuery, region: regionFilter, language: languageFilter, videoMode: videoModeFilter, owned: ownedFilter });
    fetchPage(newPage);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    localStorage.setItem('labelsPageSize', newPageSize.toString());
    setPageSize(newPageSize);
    // Reset to first page when page size changes
    updateURL(0, { search: searchQuery, region: regionFilter, language: languageFilter, videoMode: videoModeFilter, owned: ownedFilter });
    fetchPage(0, { pageSize: newPageSize });
  };

  const handleFilterChange = (
    type: 'search' | 'region' | 'language' | 'videoMode' | 'owned',
    value: string | boolean
  ) => {
    // When filters change, always go back to page 1
    const newFilters = {
      search: type === 'search' ? value as string : searchQuery,
      region: type === 'region' ? value as string : regionFilter,
      language: type === 'language' ? value as string : languageFilter,
      videoMode: type === 'videoMode' ? value as string : videoModeFilter,
      owned: type === 'owned' ? value as boolean : ownedFilter,
    };

    if (type === 'search') setSearchQuery(value as string);
    if (type === 'region') setRegionFilter(value as string);
    if (type === 'language') setLanguageFilter(value as string);
    if (type === 'videoMode') setVideoModeFilter(value as string);
    if (type === 'owned') setOwnedFilter(value as boolean);

    updateURL(0, newFilters);
  };

  // Initial load - respect URL params (run once only)
  useLayoutEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    fetchStatus().then((s) => {
      if (s?.imported) {
        const urlPage = parseInt(searchParams.get('page') || '0', 10);
        fetchPage(urlPage);
        fetchFilterOptions();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trigger animation when entries change
  useEffect(() => {
    if (entries.length === 0) return;

    // Wait for next frame to ensure DOM is updated
    requestAnimationFrame(() => {
      const cards = document.querySelectorAll('.cartridge-card');
      cards.forEach((card) => {
        card.classList.remove('animate-in');
      });

      requestAnimationFrame(() => {
        cards.forEach((card) => {
          card.classList.add('animate-in');
        });
      });
    });
  }, [entries]);

  // Debounced refetch when filters or search change (but not on mount)
  const initialFetchDoneRef = useRef(false);
  useEffect(() => {
    // Don't run on initial mount or if no content
    if (!status?.imported || !hasLoadedRef.current) return;

    // Skip the first run after initial load
    if (!initialFetchDoneRef.current) {
      initialFetchDoneRef.current = true;
      return;
    }

    const timer = setTimeout(() => {
      fetchPage(0);
    }, 200);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionFilter, languageFilter, videoModeFilter, searchQuery, ownedFilter, status?.imported]);

  // Refetch when refreshKey changes (after delete/update)
  useEffect(() => {
    if (refreshKey === undefined || refreshKey === 0) return;
    fetchPage(page);
    setLocalCacheBuster(Date.now());
    checkUnownedOnSD();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Refetch when labelsRefreshKey changes (after sync from navbar)
  useEffect(() => {
    if (labelsRefreshKey === 0) return;
    // Full refresh - refetch status and page
    fetchStatus().then((s) => {
      if (s?.imported) {
        fetchPage(0);
        fetchFilterOptions();
      }
    });
    setLocalCacheBuster(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelsRefreshKey]);

  const hasContent = status?.imported ?? false;

  return (
    <div className="labels-browser">
      {hasContent && (
        <div className="labels-header">
          <div className="labels-header-top">
            <div>
              <h2>Cartridges</h2>
              <span className="label-count text-pixel text-muted">
            {hasActiveFilters ? `${totalEntries} of ${totalUnfiltered}` : (totalEntries || status?.entryCount || 0)} cartridges
          </span>
            </div>
            
            <div className="labels-header-actions">
              {!!sdCardPath && (
                <Button variant="secondary" size="sm" onClick={() => setShowImportFromSDModal(true)} className={unownedOnSDCount > 0 ? 'has-indicator' : ''}>
                  Import Owned from SD
                  {unownedOnSDCount > 0 && <span className="btn-badge">{unownedOnSDCount}</span>}
                </Button>
              )}
              <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSelectionMode(!selectionMode);
                    setSelectedCartIds(new Set());
                  }}
                >
                  {selectionMode ? 'Exit Select' : 'Select'}
                </Button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {!hasContent ? (
        <CartridgesEmptyState
          sdCardPath={sdCardPath ?? null}
          onImportLabelsDb={() => setShowImportModal(true)}
          onImportFromSD={() => setShowImportFromSDModal(true)}
          onSyncLabelsFromSD={() => setShowSyncModal(true)}
        />
      ) : (
        <>
          {/* Search and Filters */}
          <div className="labels-filters">
            <div className="filter-group filter-group-toggle">
              <div className="toggle-buttons">
                <button
                  className={`toggle-btn ${!ownedFilter ? 'active' : ''}`}
                  onClick={() => handleFilterChange('owned', false)}
                >
                  All
                </button>
                <button
                  className={`toggle-btn ${ownedFilter ? 'active' : ''}`}
                  onClick={() => handleFilterChange('owned', true)}
                >
                  Owned
                </button>
              </div>
            </div>

            <div className="filter-group">
              <label htmlFor="pageSize" className="text-label">Items</label>
              <select
                id="pageSize"
                value={pageSize}
                onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
                disabled={loading}
                className="page-size-select"
              >
                {[25, 50, 100, 250, 1000].map(size => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group filter-group-search">
              <label htmlFor="search-input" className="text-label">Search</label>
              <div className="search-input-wrapper">
                <input
                  id="search-input"
                  type="text"
                  placeholder="Game name or cart ID..."
                  value={searchQuery}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                />
                {searchQuery && (
                  <button
                    className="search-clear-btn"
                    onClick={() => handleFilterChange('search', '')}
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {filterOptions && (
              <>
                <div className="filter-group">
                  <label htmlFor="region-filter" className="text-label">Region</label>
                  <select
                    id="region-filter"
                    value={regionFilter}
                    onChange={(e) => handleFilterChange('region', e.target.value)}
                  >
                    <option value="">All</option>
                    {filterOptions.regions.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div className="filter-group">
                  <label htmlFor="language-filter" className="text-label">Language</label>
                  <select
                    id="language-filter"
                    value={languageFilter}
                    onChange={(e) => handleFilterChange('language', e.target.value)}
                  >
                    <option value="">All</option>
                    {filterOptions.languages.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>

                <div className="filter-group">
                  <label htmlFor="videomode-filter" className="text-label">Video</label>
                  <select
                    id="videomode-filter"
                    value={videoModeFilter}
                    onChange={(e) => handleFilterChange('videoMode', e.target.value)}
                  >
                    <option value="">All</option>
                    {filterOptions.videoModes.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {hasClearableFilters && (
              <button
                className="btn-ghost filter-clear-btn"
                onClick={clearAllFilters}
              >
                Clear
              </button>
            )}

            <TooltipIcon
              content="Our game metadata is a work in progress and doesn't include every cartridge. When filters are active, only cartridges with known metadata will be shown."
              position="bottom"
              className="filter-info"
            />
          </div>

          {/* Selection Toolbar */}
          {selectionMode && (
            <div className="selection-toolbar">
              <div className="selection-info">
                <span className="selection-count">
                  {selectedCartIds.size} selected
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedCartIds(new Set(entries.map(e => e.cartId)))}
                >
                  Select Page
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setSelectedCartIds(new Set())}>
                  Clear
                </Button>
              </div>
              <div className="selection-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={selectedCartIds.size === 0}
                  onClick={async () => {
                    // Mark selected as owned
                    for (const cartId of selectedCartIds) {
                      await fetch(`/api/cartridges/owned/${cartId}`, { method: 'POST' });
                    }
                    setSelectedCartIds(new Set());
                    setSelectionMode(false);
                  }}
                >
                  Mark Owned
                </Button>
                {copiedSettings ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={selectedCartIds.size === 0}
                    onClick={() => setShowPasteSettingsModal(true)}
                  >
                    Paste Settings
                  </Button>
                ) : (
                  <Tooltip content="Copy settings from a cartridge first. Open a cartridge's Settings tab and click 'Copy Settings' to enable this button.">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled
                      className="paste-settings-disabled"
                    >
                      Paste Settings
                    </Button>
                  </Tooltip>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={selectedCartIds.size === 0}
                  onClick={() => setShowExportBundleModal(true)}
                >
                  Export Selection
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <>
              <div className="labels-grid">
                {entries.map((entry, i) => (
                  <CartridgeCard
                    key={entry.cartId}
                    cartId={entry.cartId}
                    name={entry.name}
                    gridIndex={i}
                    hasLabel={entry.index >= 0}
                    selectionMode={selectionMode}
                    isSelected={selectedCartIds.has(entry.cartId)}
                    imageCacheBuster={imageCacheBuster}
                    onClick={() => {
                      if (selectionMode) {
                        const newSelection = new Set(selectedCartIds);
                        if (newSelection.has(entry.cartId)) {
                          newSelection.delete(entry.cartId);
                        } else {
                          newSelection.add(entry.cartId);
                        }
                        setSelectedCartIds(newSelection);
                      } else {
                        onSelectLabel(entry.cartId, entry.name);
                      }
                    }}
                  />
                ))}
              </div>

              <Pagination
                page={page}
                totalPages={totalPages}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                disabled={loading}
              />
            </>
          )}
        </>
      )}

      {/* Modals */}
      <LabelsImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={handleRefresh}
        currentStatus={status ? {
          hasLabels: status.imported,
          entryCount: status.entryCount,
          fileSizeMB: status.fileSizeMB,
        } : null}
      />

      {sdCardPath && (
        <ImportFromSDModal
          isOpen={showImportFromSDModal}
          onClose={() => setShowImportFromSDModal(false)}
          onImportComplete={handleRefresh}
          sdCardPath={sdCardPath}
        />
      )}

      <ExportBundleModal
        isOpen={showExportBundleModal}
        onClose={() => setShowExportBundleModal(false)}
        onExportComplete={() => {
          if (selectionMode) {
            setSelectionMode(false);
            setSelectedCartIds(new Set());
          }
        }}
        selectedCartIds={selectionMode && selectedCartIds.size > 0 ? Array.from(selectedCartIds) : undefined}
      />

      <LabelSyncModal
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        onSyncComplete={handleRefresh}
      />

      <PasteSettingsModal
        isOpen={showPasteSettingsModal}
        onClose={() => setShowPasteSettingsModal(false)}
        onPasteComplete={() => {
          setShowPasteSettingsModal(false);
          setSelectionMode(false);
          setSelectedCartIds(new Set());
        }}
        selectedCartIds={Array.from(selectedCartIds)}
        cartIdToName={Object.fromEntries(
          entries
            .filter(e => selectedCartIds.has(e.cartId))
            .map(e => [e.cartId, e.name])
        )}
        sdCardPath={sdCardPath}
      />
    </div>
  );
}
