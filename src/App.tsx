import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { LabelsBrowser } from './components/LabelsBrowser';
import { LabelEditor } from './components/LabelEditor';
import { SettingsPage } from './components/SettingsPage';
import { SyncPage } from './components/SyncPage';
import type { SDCard } from './types';
import './App.css';

// SD Card Context to share state across pages
interface SDCardContextType {
  sdCards: SDCard[];
  selectedSDCard: SDCard | null;
  setSelectedSDCard: (card: SDCard | null) => void;
  detectSDCards: () => Promise<void>;
  loading: boolean;
}

const SDCardContext = createContext<SDCardContextType | null>(null);

export function useSDCard() {
  const context = useContext(SDCardContext);
  if (!context) throw new Error('useSDCard must be used within SDCardProvider');
  return context;
}

function SDCardProvider({ children }: { children: React.ReactNode }) {
  const [sdCards, setSDCards] = useState<SDCard[]>([]);
  const [selectedSDCard, setSelectedSDCard] = useState<SDCard | null>(null);
  const [loading, setLoading] = useState(false);

  const detectSDCards = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/sync/sd-cards');
      if (!response.ok) throw new Error('Failed to detect SD cards');
      const data = await response.json();
      setSDCards(data);

      // Auto-select first SD card if available and none selected
      if (data.length > 0 && !selectedSDCard) {
        setSelectedSDCard(data[0]);
      }
    } catch (err) {
      console.error('Error detecting SD cards:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSDCard]);

  useEffect(() => {
    detectSDCards();
  }, []);

  return (
    <SDCardContext.Provider value={{ sdCards, selectedSDCard, setSelectedSDCard, detectSDCards, loading }}>
      {children}
    </SDCardContext.Provider>
  );
}

function Header() {
  const location = useLocation();
  const { selectedSDCard, sdCards, setSelectedSDCard, detectSDCards, loading } = useSDCard();

  return (
    <header className="app-header">
      <h1><strong>A3D</strong> Manager</h1>
      <nav className="app-nav">
        <Link
          to="/labels"
          className={`nav-tab ${location.pathname === '/labels' ? 'active' : ''}`}
        >
          Labels Database
        </Link>
        <Link
          to="/sync"
          className={`nav-tab ${location.pathname === '/sync' ? 'active' : ''}`}
        >
          Sync to SD
        </Link>
        <Link
          to="/settings"
          className={`nav-tab ${location.pathname === '/settings' ? 'active' : ''}`}
        >
          Settings
        </Link>
      </nav>
      <div className="header-actions">
        <div className="sd-card-selector">
          <select
            value={selectedSDCard?.path || ''}
            onChange={(e) => {
              const card = sdCards.find(c => c.path === e.target.value);
              setSelectedSDCard(card || null);
            }}
            disabled={loading}
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
          <button
            className="btn-icon"
            onClick={detectSDCards}
            disabled={loading}
            title="Refresh SD cards"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9m-9 9a9 9 0 0 1 9-9"/>
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

function LabelsPage() {
  const { selectedSDCard } = useSDCard();
  const [editingLabel, setEditingLabel] = useState<{ cartId: string; name?: string } | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [labelsRefreshKey, setLabelsRefreshKey] = useState(0);

  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <>
      {notification && <div className="notification">{notification}</div>}
      <LabelsBrowser
        sdCardPath={selectedSDCard?.path}
        onSelectLabel={(cartId, name) => setEditingLabel({ cartId, name })}
        refreshKey={labelsRefreshKey}
      />
      {editingLabel && (
        <LabelEditor
          cartId={editingLabel.cartId}
          gameName={editingLabel.name}
          sdCardPath={selectedSDCard?.path}
          onClose={() => setEditingLabel(null)}
          onUpdate={() => {
            showNotification('Label updated successfully!');
            setLabelsRefreshKey(k => k + 1);
            setEditingLabel(null);
          }}
        />
      )}
    </>
  );
}

function AppContent() {
  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/labels" replace />} />
          <Route path="/labels" element={<LabelsPage />} />
          <Route path="/sync" element={<SyncPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <SDCardProvider>
        <AppContent />
      </SDCardProvider>
    </BrowserRouter>
  );
}

export default App;
