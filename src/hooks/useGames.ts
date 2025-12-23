import { useState, useEffect, useCallback } from 'react';
import type { Game, GameSettings } from '../types';

export function useGames() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGames = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/games');
      if (!response.ok) throw new Error('Failed to fetch games');
      const data = await response.json();
      setGames(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  const updateGame = useCallback(
    async (id: string, updates: { title?: string; settings?: Partial<GameSettings> }) => {
      try {
        const response = await fetch(`/api/games/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        if (!response.ok) throw new Error('Failed to update game');
        const updatedGame = await response.json();
        setGames((prev) => prev.map((g) => (g.id === id ? updatedGame : g)));
        return updatedGame;
      } catch (err) {
        throw err;
      }
    },
    []
  );

  const uploadArtwork = useCallback(
    async (id: string, file: File) => {
      const formData = new FormData();
      formData.append('artwork', file);

      const response = await fetch(`/api/games/${id}/artwork`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to upload artwork');

      // Refresh games to get updated hasArtwork status
      await fetchGames();
    },
    [fetchGames]
  );

  return {
    games,
    loading,
    error,
    refetch: fetchGames,
    updateGame,
    uploadArtwork,
  };
}
