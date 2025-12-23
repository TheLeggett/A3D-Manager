import { useState, useEffect, useCallback } from 'react';

interface LabelEntry {
  cartId: string;
  index: number;
  name?: string;
}

interface LabelsPageResponse {
  imported: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
  totalEntries: number;
  entries: LabelEntry[];
}

interface LabelsStatus {
  imported: boolean;
  source: string | null;
  importedAt: string | null;
  count: number;
}

interface LabelsBrowserProps {
  sdCardPath?: string;
  onSelectLabel: (cartId: string, name?: string) => void;
  refreshKey?: number;
}

export function LabelsBrowser({ sdCardPath, onSelectLabel, refreshKey }: LabelsBrowserProps) {
  const [status, setStatus] = useState<LabelsStatus | null>(null);
  const [entries, setEntries] = useState<LabelEntry[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalEntries, setTotalEntries] = useState(0);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LabelEntry[] | null>(null);
  const [showUnknownOnly, setShowUnknownOnly] = useState(false);
  const [unknownEntries, setUnknownEntries] = useState<LabelEntry[]>([]);
  const [unknownCount, setUnknownCount] = useState(0);

  const pageSize = 48;

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

  const fetchPage = useCallback(async (pageNum: number) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('pageSize', pageSize.toString());

      const response = await fetch(`/api/labels/page/${pageNum}?${params}`);
      if (!response.ok) throw new Error('Failed to fetch labels');

      const data: LabelsPageResponse = await response.json();

      if (!data.imported) {
        setEntries([]);
        setTotalPages(0);
        setTotalEntries(0);
        return;
      }

      setEntries(data.entries);
      setPage(data.page);
      setTotalPages(data.totalPages);
      setTotalEntries(data.totalEntries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/labels/search/${searchQuery}`);
      if (!response.ok) throw new Error('Search failed');

      const data = await response.json();
      if (!data.imported) {
        setError('Labels not imported yet');
        return;
      }
      setSearchResults(data.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  const fetchUnknown = useCallback(async () => {
    try {
      setLoading(true);
      const params = sdCardPath ? `?sdCardPath=${encodeURIComponent(sdCardPath)}` : '';
      const response = await fetch(`/api/cart-db/unknown${params}`);
      if (!response.ok) throw new Error('Failed to fetch unknown carts');

      const data = await response.json();
      // Map to LabelEntry format - these are "Unknown Cartridge" folders
      const mapped: LabelEntry[] = data.carts.map((c: { id: string; folderName: string }, idx: number) => ({
        cartId: c.id,
        index: idx,
        name: c.folderName, // Show the folder name
      }));
      setUnknownEntries(mapped);
      setUnknownCount(data.count || mapped.length);
    } catch (err) {
      console.error('Error fetching unknown carts:', err);
    } finally {
      setLoading(false);
    }
  }, [sdCardPath]);

  const handleImportAll = async () => {
    try {
      setImporting(true);
      setError(null);

      const params = sdCardPath ? `?sdCardPath=${encodeURIComponent(sdCardPath)}` : '';
      const response = await fetch(`/api/labels/import-all${params}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Import failed');
      }

      const result = await response.json();
      console.log('Import result:', result);

      // Refresh status and data
      await fetchStatus();
      await fetchPage(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    fetchStatus().then((s) => {
      if (s?.imported) {
        fetchPage(0);
        fetchUnknown();
      }
    });
  }, [fetchStatus, fetchPage, fetchUnknown]);

  // When toggling unknown only mode, sdCardPath changes, or refresh triggered
  useEffect(() => {
    if (showUnknownOnly) {
      fetchUnknown();
    }
  }, [showUnknownOnly, sdCardPath, fetchUnknown]);

  // Refetch unknown list when refreshKey changes
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      fetchUnknown();
    }
  }, [refreshKey, fetchUnknown]);

  const displayEntries = searchResults || (showUnknownOnly ? unknownEntries : entries);

  return (
    <div className="labels-browser">
      <div className="labels-header">
        <h2>Label Database Browser</h2>
        {status?.imported && <span className="label-count">{totalEntries} labels</span>}
      </div>

      {/* Import Controls */}
      <div className="labels-controls">
        <div className="import-section">
          <button
            className="btn-primary"
            onClick={handleImportAll}
            disabled={importing}
          >
            {importing ? 'Importing...' : 'Import All from SD Card'}
          </button>
        </div>

        {status && (
          <div className="import-status">
            {status.imported ? (
              <>
                <span className="status-imported">Imported</span>
                <span className="status-details">
                  {status.count} labels from {status.source?.split('/').pop() || 'SD card'}
                  {status.importedAt && ` at ${new Date(status.importedAt).toLocaleString()}`}
                </span>
              </>
            ) : (
              <span className="status-not-imported">
                Not imported. Click "Import All from SD Card" to start.
              </span>
            )}
          </div>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {!status?.imported ? (
        <div className="labels-empty">
          <p>No labels imported yet.</p>
          <p>Click "Import All from SD Card" to extract all label images to local storage.</p>
        </div>
      ) : (
        <>
          <div className="labels-search">
            <input
              type="text"
              placeholder="Search by game name or cart ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              disabled={showUnknownOnly}
            />
            <button onClick={handleSearch} disabled={loading || showUnknownOnly}>
              Search
            </button>
            {searchResults && (
              <button onClick={() => { setSearchResults(null); setSearchQuery(''); }}>
                Clear
              </button>
            )}
            <label className="unknown-toggle">
              <input
                type="checkbox"
                checked={showUnknownOnly}
                onChange={(e) => {
                  setShowUnknownOnly(e.target.checked);
                  setSearchResults(null);
                  setSearchQuery('');
                }}
              />
              Unknown Cartridges {unknownCount > 0 && `(${unknownCount})`}
            </label>
          </div>

          {loading && !importing ? (
            <div className="loading">Loading...</div>
          ) : (
            <>
              <div className="labels-grid">
                {displayEntries.map((entry) => (
                  <div
                    key={entry.cartId}
                    className={`label-tile ${entry.name ? 'has-name' : ''}`}
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

              {!searchResults && !showUnknownOnly && totalPages > 1 && (
                <div className="labels-pagination">
                  <button
                    onClick={() => fetchPage(page - 1)}
                    disabled={page === 0 || loading}
                  >
                    Previous
                  </button>
                  <span>
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => fetchPage(page + 1)}
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
    </div>
  );
}
