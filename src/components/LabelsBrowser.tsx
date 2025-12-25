import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CartridgesActionBar } from './CartridgesActionBar';
import { CartridgeCard } from './CartridgeCard';
import { Pagination } from './Pagination';
import { LabelsImportModal } from './LabelsImportModal';
import { AddCartridgeModal } from './AddCartridgeModal';
import { ConfirmResetModal } from './ConfirmResetModal';
import { ImportFromSDModal } from './ImportFromSDModal';
import { ExportBundleModal } from './ExportBundleModal';
import { ImportBundleModal } from './ImportBundleModal';
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
  entryCount?: number;
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
  const [imageCacheBuster, setImageCacheBuster] = useState(0);

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

  // Modal states
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showImportFromSDModal, setShowImportFromSDModal] = useState(false);
  const [showExportBundleModal, setShowExportBundleModal] = useState(false);
  const [showImportBundleModal, setShowImportBundleModal] = useState(false);

  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCartIds, setSelectedCartIds] = useState<Set<string>>(new Set());

  const pageSize = 48;
  const hasActiveFilters = regionFilter || languageFilter || videoModeFilter || searchQuery || ownedFilter;

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
    }
  ) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('pageSize', pageSize.toString());

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
  }, [regionFilter, languageFilter, videoModeFilter, searchQuery, ownedFilter]);

  const handleRefresh = async () => {
    await fetchStatus();
    await fetchPage(0);
  };

  const handleResetComplete = async () => {
    setStatus(null);
    setEntries([]);
    setTotalPages(0);
    setTotalEntries(0);
    await fetchStatus();
  };

  const clearAllFilters = () => {
    setRegionFilter('');
    setLanguageFilter('');
    setVideoModeFilter('');
    setSearchQuery('');
    setOwnedFilter(false);
    updateURL(0, {});
  };

  const handlePageChange = (newPage: number) => {
    updateURL(newPage, { search: searchQuery, region: regionFilter, language: languageFilter, videoMode: videoModeFilter, owned: ownedFilter });
    fetchPage(newPage);
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
    // Don't run on initial mount or if status not loaded
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
    setImageCacheBuster(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <div className="labels-browser">
      <div className="labels-header">
        <h2>Cartridges</h2>
        {status?.imported && (
          <span className="label-count text-pixel text-muted">
            {hasActiveFilters ? `${totalEntries} of ${totalUnfiltered}` : (totalEntries || status.entryCount)} cartridges
          </span>
        )}
      </div>

      <CartridgesActionBar
        hasLabels={status?.imported || false}
        hasSDCard={!!sdCardPath}
        selectionMode={selectionMode}
        onImportLabels={() => setShowImportModal(true)}
        onAddCartridge={() => setShowAddModal(true)}
        onImportFromSD={() => setShowImportFromSDModal(true)}
        onExportBundle={() => setShowExportBundleModal(true)}
        onImportBundle={() => setShowImportBundleModal(true)}
        onToggleSelectionMode={() => {
          setSelectionMode(!selectionMode);
          setSelectedCartIds(new Set());
        }}
        onClearAllLabels={() => setShowResetModal(true)}
      />

      {error && <div className="error-message">{error}</div>}

      {!status?.imported ? (
        <div className="labels-empty">
          <div className="empty-icon">🎮</div>
          <h3>No Cartridges Yet</h3>
          <p>Import an existing labels.db file to get started quickly, or build your collection by adding cartridges one at a time.</p>
          <div className="empty-actions">
            <button className="btn-primary" onClick={() => setShowImportModal(true)}>
              Import labels.db
            </button>
            <button className="btn-secondary" onClick={() => setShowAddModal(true)}>
              Add First Cartridge
            </button>
          </div>
        </div>
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

            <div className="filter-group filter-group-search">
              <label htmlFor="search-input" className="text-label">Search</label>
              <div className="search-input-wrapper">
                <input
                  id="search-input"
                  type="text"
                  placeholder="Game name or cart ID..."
                  value={searchQuery}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
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

            {hasActiveFilters && (
              <button
                className="btn-ghost filter-clear-btn"
                onClick={clearAllFilters}
              >
                Clear
              </button>
            )}

            <div className="filter-info" title="Our game metadata is a work in progress and doesn't include every cartridge. When filters are active, only cartridges with known metadata will be shown.">
              <span className="filter-info-icon">?</span>
            </div>
          </div>

          {/* Selection Toolbar */}
          {selectionMode && (
            <div className="selection-toolbar">
              <div className="selection-info">
                <span className="selection-count">
                  {selectedCartIds.size} selected
                </span>
                <button
                  onClick={() => setSelectedCartIds(new Set(entries.map(e => e.cartId)))}
                >
                  Select Page
                </button>
                <button onClick={() => setSelectedCartIds(new Set())}>
                  Clear
                </button>
              </div>
              <div className="selection-actions">
                <button
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
                </button>
                <button
                  disabled={selectedCartIds.size === 0}
                  onClick={() => setShowExportBundleModal(true)}
                >
                  Export Selection
                </button>
                <button
                  className="btn-exit"
                  onClick={() => {
                    setSelectionMode(false);
                    setSelectedCartIds(new Set());
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <>
              <div className="labels-grid">
                {entries.map((entry, index) => (
                  <CartridgeCard
                    key={entry.cartId}
                    cartId={entry.cartId}
                    name={entry.name}
                    index={index}
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
                onPageChange={handlePageChange}
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

      <AddCartridgeModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleRefresh}
      />

      <ConfirmResetModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onConfirm={handleResetComplete}
        entryCount={status?.entryCount}
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
        onClose={() => {
          setShowExportBundleModal(false);
          if (selectionMode) {
            setSelectionMode(false);
            setSelectedCartIds(new Set());
          }
        }}
        selectedCartIds={selectionMode && selectedCartIds.size > 0 ? Array.from(selectedCartIds) : undefined}
      />

      <ImportBundleModal
        isOpen={showImportBundleModal}
        onClose={() => setShowImportBundleModal(false)}
        onImportComplete={handleRefresh}
      />
    </div>
  );
}
