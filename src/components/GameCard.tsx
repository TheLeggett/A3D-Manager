import { useState } from 'react';
import type { Game } from '../types';

interface GameCardProps {
  game: Game;
  onEdit: (game: Game) => void;
  onUploadArtwork: (game: Game) => void;
}

export function GameCard({ game, onEdit, onUploadArtwork }: GameCardProps) {
  const [imageError, setImageError] = useState(false);

  const isUnknown = game.title.startsWith('Unknown');

  const tooltipTitle = !isUnknown ? game.title : undefined;

  return (
    <div className="game-card" title={tooltipTitle}>
      <div className="game-artwork">
        {game.hasArtwork && !imageError ? (
          <img
            src={`/api/games/${game.id}/artwork`}
            alt={game.title}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="no-artwork">
            <span>No Artwork</span>
          </div>
        )}
        <button
          className="upload-btn"
          onClick={() => onUploadArtwork(game)}
          title="Upload artwork"
        >
          +
        </button>
      </div>
      <div className="game-info" onClick={() => onEdit(game)}>
        <h3 className={isUnknown ? 'unknown' : ''}>{game.title}</h3>
        <p className="game-id">{game.id}</p>
      </div>
    </div>
  );
}
