import { useState } from 'react';
import { useSDCard } from '../App';
import './SDCardSelector.css';

export function SDCardSelector() {
  const { selectedSDCard, sdCards, setSelectedSDCard, detectSDCards, loading } = useSDCard();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await detectSDCards();
    // Keep the refreshing state for a moment to ensure smooth transition
    setTimeout(() => {
      setIsRefreshing(false);
    }, 300);
  };

  return (
    <div className="sd-card-selector">
      {isRefreshing ? (
        <div className="sd-refreshing-label">Refreshing...</div>
      ) : (
        <select
          value={selectedSDCard?.path || ''}
          onChange={(e) => {
            const card = sdCards.find(c => c.path === e.target.value);
            setSelectedSDCard(card || null);
          }}
          disabled={loading}
          className={isRefreshing ? 'fade-out' : 'fade-in'}
        >
          {sdCards.length === 0 ? (
            <option value="">No SD Card detected</option>
          ) : (
            sdCards.map((card) => (
              <option key={card.path} value={card.path}>
                {card.name} ({card.path})
              </option>
            ))
          )}
        </select>
      )}
      <button
        className="btn-icon"
        onClick={handleRefresh}
        disabled={loading || isRefreshing}
        title="Refresh SD cards"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9m-9 9a9 9 0 0 1 9-9"/>
        </svg>
      </button>
    </div>
  );
}
