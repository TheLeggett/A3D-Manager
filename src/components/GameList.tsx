import type { Game } from '../types';
import { GameCard } from './GameCard';

interface GameListProps {
  games: Game[];
  loading: boolean;
  error: string | null;
  onEditGame: (game: Game) => void;
  onUploadArtwork: (game: Game) => void;
}

export function GameList({
  games,
  loading,
  error,
  onEditGame,
  onUploadArtwork,
}: GameListProps) {
  if (loading) {
    return <div className="loading">Loading games...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (games.length === 0) {
    return (
      <div className="empty-state">
        <h2>No games found</h2>
        <p>Import games from your SD card to get started.</p>
      </div>
    );
  }

  // Separate known and unknown games
  const knownGames = games.filter((g) => !g.title.startsWith('Unknown'));
  const unknownGames = games.filter((g) => g.title.startsWith('Unknown'));

  return (
    <div className="game-list-container">
      {knownGames.length > 0 && (
        <>
          <h2>Games ({knownGames.length})</h2>
          <div className="game-grid">
            {knownGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onEdit={onEditGame}
                onUploadArtwork={onUploadArtwork}
              />
            ))}
          </div>
        </>
      )}

      {unknownGames.length > 0 && (
        <>
          <h2 className="unknown-header">
            Unknown Cartridges ({unknownGames.length})
          </h2>
          <p className="unknown-hint">
            These cartridges aren't in the Analogue database. Edit to rename them!
          </p>
          <div className="game-grid">
            {unknownGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onEdit={onEditGame}
                onUploadArtwork={onUploadArtwork}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
