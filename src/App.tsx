import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { CartridgesPage } from './components/CartridgesPage';
import { Navbar } from './components/Navbar';
import { SyncPage } from './components/SyncPage';
import { HelpPage } from './components/HelpPage';
import { ComponentTestPage } from './components/ComponentTestPage';
import type { SDCard } from './types';
import './App.css';

// SD Card Context to share state across pages
interface SDCardContextType {
  sdCards: SDCard[];
  selectedSDCard: SDCard | null;
  setSelectedSDCard: (card: SDCard | null) => void;
  detectSDCards: (isPolling?: boolean) => Promise<void>;
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

  const detectSDCards = useCallback(async (isPolling = false) => {
    try {
      // Only show loading indicator for manual refreshes, not polling
      if (!isPolling) {
        setLoading(true);
      }
      const response = await fetch('/api/sync/sd-cards');
      if (!response.ok) throw new Error('Failed to detect SD cards');
      const data: SDCard[] = await response.json();

      setSDCards(prevCards => {
        // Check if the cards have actually changed
        const prevPaths = prevCards.map(c => c.path).sort().join(',');
        const newPaths = data.map(c => c.path).sort().join(',');
        if (prevPaths === newPaths) {
          return prevCards; // No change, don't update state
        }
        return data;
      });

      // Check if selected SD card is still available
      setSelectedSDCard(prev => {
        if (prev) {
          const stillExists = data.some(card => card.path === prev.path);
          if (!stillExists) {
            console.log('SD card disconnected:', prev.path);
            return null;
          }
        }
        // Auto-select first SD card if available and none selected
        if (!prev && data.length > 0) {
          return data[0];
        }
        return prev;
      });
    } catch (err) {
      console.error('Error detecting SD cards:', err);
    } finally {
      if (!isPolling) {
        setLoading(false);
      }
    }
  }, []);

  // Initial detection
  useEffect(() => {
    detectSDCards();
  }, [detectSDCards]);

  // Poll for SD card changes every 5 seconds
  useEffect(() => {
    const pollInterval = setInterval(() => {
      detectSDCards(true); // Pass true to indicate this is a polling call
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [detectSDCards]);

  return (
    <SDCardContext.Provider value={{ sdCards, selectedSDCard, setSelectedSDCard, detectSDCards, loading }}>
      {children}
    </SDCardContext.Provider>
  );
}

function AppContent() {
  return (
    <div className="app">
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/cartridges" replace />} />
          <Route path="/cartridges" element={<CartridgesPage />} />
          <Route path="/labels" element={<Navigate to="/cartridges" replace />} />
          <Route path="/sync" element={<SyncPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/component-test" element={<ComponentTestPage />} />
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
