import { useState, useEffect, useCallback } from 'react';
import type { SDCard, SyncDiff } from '../types';

export function useSync() {
  const [sdCards, setSDCards] = useState<SDCard[]>([]);
  const [selectedSDCard, setSelectedSDCard] = useState<SDCard | null>(null);
  const [diff, setDiff] = useState<SyncDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectSDCards = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/sync/sd-cards');
      if (!response.ok) throw new Error('Failed to detect SD cards');
      const data = await response.json();
      setSDCards(data);

      // Auto-select first SD card if available
      if (data.length > 0 && !selectedSDCard) {
        setSelectedSDCard(data[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [selectedSDCard]);

  const fetchDiff = useCallback(async () => {
    if (!selectedSDCard) return;

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        `/api/sync/diff?sdCardPath=${encodeURIComponent(selectedSDCard.path)}`
      );
      if (!response.ok) throw new Error('Failed to fetch diff');
      const data = await response.json();
      setDiff(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [selectedSDCard]);

  const importFromSD = useCallback(async () => {
    if (!selectedSDCard) return;

    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/sync/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdCardPath: selectedSDCard.path }),
      });
      if (!response.ok) throw new Error('Failed to import');
      const result = await response.json();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [selectedSDCard]);

  const exportToSD = useCallback(async () => {
    if (!selectedSDCard) return;

    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/sync/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdCardPath: selectedSDCard.path }),
      });
      if (!response.ok) throw new Error('Failed to export');
      const result = await response.json();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [selectedSDCard]);

  useEffect(() => {
    detectSDCards();
  }, []);

  useEffect(() => {
    if (selectedSDCard) {
      fetchDiff();
    }
  }, [selectedSDCard, fetchDiff]);

  return {
    sdCards,
    selectedSDCard,
    setSelectedSDCard,
    diff,
    loading,
    error,
    detectSDCards,
    importFromSD,
    exportToSD,
    fetchDiff,
  };
}
