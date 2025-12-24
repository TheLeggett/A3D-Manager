import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LabelsImportModal } from './LabelsImportModal';
import { AddCartridgeModal } from './AddCartridgeModal';
import { ConfirmResetModal } from './ConfirmResetModal';

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
}

export function LabelsBrowser({ onSelectLabel }: LabelsBrowserProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const hasLoadedRef = useRef(false);

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

  // Modal states
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const pageSize = 48;
  const hasActiveFilters = regionFilter || languageFilter || videoModeFilter || searchQuery;

  // Update URL when filters or page change
  const updateURL = useCallback((
    newPage: number,
    filters: {
      search?: string;
      region?: string;
      language?: string;
      videoMode?: string;
    }
  ) => {
    const params = new URLSearchParams();
    if (newPage > 0) params.set('page', newPage.toString());
    if (filters.search) params.set('search', filters.search);
    if (filters.region) params.set('region', filters.region);
    if (filters.language) params.set('language', filters.language);
    if (filters.videoMode) params.set('videoMode', filters.videoMode);
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

      if (region) params.set('region', region);
      if (language) params.set('language', language);
      if (videoMode) params.set('videoMode', videoMode);
      if (search) params.set('search', search);

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
  }, [regionFilter, languageFilter, videoModeFilter, searchQuery]);

  const handleRefresh = async () => {
    await fetchStatus();
    await fetchPage(0);
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/labels/export');
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'labels.db';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
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
    updateURL(0, {});
  };

  const handlePageChange = (newPage: number) => {
    updateURL(newPage, { search: searchQuery, region: regionFilter, language: languageFilter, videoMode: videoModeFilter });
    fetchPage(newPage);
  };

  const handleFilterChange = (
    type: 'search' | 'region' | 'language' | 'videoMode',
    value: string
  ) => {
    // When filters change, always go back to page 1
    const newFilters = {
      search: type === 'search' ? value : searchQuery,
      region: type === 'region' ? value : regionFilter,
      language: type === 'language' ? value : languageFilter,
      videoMode: type === 'videoMode' ? value : videoModeFilter,
    };

    if (type === 'search') setSearchQuery(value);
    if (type === 'region') setRegionFilter(value);
    if (type === 'language') setLanguageFilter(value);
    if (type === 'videoMode') setVideoModeFilter(value);

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
      const tiles = document.querySelectorAll('.label-tile');
      tiles.forEach((tile) => {
        tile.classList.remove('animate-in');
      });

      requestAnimationFrame(() => {
        tiles.forEach((tile) => {
          tile.classList.add('animate-in');
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
  }, [regionFilter, languageFilter, videoModeFilter, searchQuery, status?.imported]);

  return (
    <div className="labels-browser">
      <div className="labels-header">
        <h2>Labels Database</h2>
        {status?.imported && (
          <span className="label-count">
            {hasActiveFilters ? `${totalEntries} of ${totalUnfiltered}` : (totalEntries || status.entryCount)} labels
          </span>
        )}
      </div>

      {/* Action Bar */}
      <div className="labels-action-bar">
        <div className="action-bar-left">
          <button
            className="btn-primary"
            onClick={() => setShowImportModal(true)}
          >
            Import labels.db
          </button>

          <button
            className="btn-secondary"
            onClick={() => setShowAddModal(true)}
          >
            Add Cartridge
          </button>

          {status?.imported && (
            <button
              className="btn-secondary"
              onClick={handleExport}
            >
              Export
            </button>
          )}
        </div>

        {status?.imported && (
          <div className="action-bar-right">
            <button
              className="btn-ghost btn-danger-text"
              onClick={() => setShowResetModal(true)}
            >
              Clear All Labels
            </button>
          </div>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {!status?.imported ? (
        <div className="labels-empty">
          <div className="empty-icon">🎮</div>
          <h3>No Labels Yet</h3>
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
            <div className="filter-group filter-group-search">
              <label htmlFor="search-input">Search</label>
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
                  <label htmlFor="region-filter">Region</label>
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
                  <label htmlFor="language-filter">Language</label>
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
                  <label htmlFor="videomode-filter">Video</label>
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

          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <>
              <div className="labels-grid">
                {entries.map((entry, index) => (
                  <div
                    key={entry.cartId}
                    className={`label-tile ${entry.name ? 'has-name' : ''}`}
                    style={{ '--tile-index': index } as React.CSSProperties}
                    onClick={() => onSelectLabel(entry.cartId, entry.name)}
                  >
                    <div className="cart-sprite">
                      <img
                        className="cart-artwork"
                        src={`/api/labels/${entry.cartId}`}
                        alt={entry.name || entry.cartId}
                        loading="lazy"
                      />
                      <img className="cart-overlay" src="/n64-cart-dark.png" alt="" />
                      <img className="cart-overlay cart-overlay-hover" src="/n64-cart-black.png" alt="" />
                    </div>
                    <div className="label-info">
                      <span className={`label-name ${!entry.name ? 'unknown' : ''}`}>
                        {entry.name || 'Title Unknown'}
                      </span>
                      <span className="label-id">{entry.cartId}</span>
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="labels-pagination">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 0 || loading}
                  >
                    Previous
                  </button>
                  <span>
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages - 1 || loading}
                  >
                    Next
                  </button>
                </div>
              )}
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
    </div>
  );
}
