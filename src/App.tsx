import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { CartridgesPage } from './components/CartridgesPage';
import { Navbar } from './components/Navbar';
import { HelpPage } from './components/HelpPage';
import { SettingsPage } from './components/SettingsPage';
import { ComponentTestPage } from './components/ComponentTestPage';
import { LabelSyncProvider } from './components/LabelSyncIndicator';
import type { SDCard } from './types';
import type { CartridgeSettings } from './lib/defaultSettings';
import './App.css';

// Image Cache Context for global cache invalidation
interface ImageCacheContextType {
  imageCacheBuster: number;
  lastInvalidated: number;
  invalidateImageCache: () => void;
}

const ImageCacheContext = createContext<ImageCacheContextType | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useImageCache() {
  const context = useContext(ImageCacheContext);
  if (!context) throw new Error('useImageCache must be used within ImageCacheProvider');
  return context;
}

function ImageCacheProvider({ children }: { children: React.ReactNode }) {
  const [imageCacheBuster, setImageCacheBuster] = useState(() => {
    // Restore from localStorage if available
    const saved = localStorage.getItem('imageCacheBuster');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [lastInvalidated, setLastInvalidated] = useState(() => {
    const saved = localStorage.getItem('lastImageCacheInvalidation');
    return saved ? parseInt(saved, 10) : 0;
  });

  const invalidateImageCache = useCallback(() => {
    const now = Date.now();
    setImageCacheBuster(now);
    setLastInvalidated(now);
    localStorage.setItem('imageCacheBuster', now.toString());
    localStorage.setItem('lastImageCacheInvalidation', now.toString());
  }, []);

  return (
    <ImageCacheContext.Provider value={{ imageCacheBuster, lastInvalidated, invalidateImageCache }}>
      {children}
    </ImageCacheContext.Provider>
  );
}

// SD Card Context to share state across pages
interface SDCardContextType {
  sdCards: SDCard[];
  selectedSDCard: SDCard | null;
  setSelectedSDCard: (card: SDCard | null) => void;
  detectSDCards: (isPolling?: boolean) => Promise<void>;
  loading: boolean;
}

const SDCardContext = createContext<SDCardContextType | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
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

// Settings Clipboard Context for copy/paste settings between cartridges
export interface CopiedSettingsInfo {
  cartId: string;
  gameName: string;
  settings: CartridgeSettings;
  copiedAt: number;
}

interface SettingsClipboardContextType {
  copiedSettings: CopiedSettingsInfo | null;
  copySettings: (cartId: string, gameName: string, settings: CartridgeSettings) => void;
  clearCopiedSettings: () => void;
}

const SettingsClipboardContext = createContext<SettingsClipboardContextType | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useSettingsClipboard() {
  const context = useContext(SettingsClipboardContext);
  if (!context) throw new Error('useSettingsClipboard must be used within SettingsClipboardProvider');
  return context;
}

function SettingsClipboardProvider({ children }: { children: React.ReactNode }) {
  const [copiedSettings, setCopiedSettings] = useState<CopiedSettingsInfo | null>(null);

  const copySettings = useCallback((cartId: string, gameName: string, settings: CartridgeSettings) => {
    setCopiedSettings({
      cartId,
      gameName,
      settings,
      copiedAt: Date.now(),
    });
  }, []);

  const clearCopiedSettings = useCallback(() => {
    setCopiedSettings(null);
  }, []);

  return (
    <SettingsClipboardContext.Provider value={{ copiedSettings, copySettings, clearCopiedSettings }}>
      {children}
    </SettingsClipboardContext.Provider>
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
          <Route path="/settings" element={<SettingsPage />} />
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
      <ImageCacheProvider>
        <SDCardProvider>
          <SettingsClipboardProvider>
            <LabelSyncProvider>
              <AppContent />
            </LabelSyncProvider>
          </SettingsClipboardProvider>
        </SDCardProvider>
      </ImageCacheProvider>
    </BrowserRouter>
  );
}

export default App;
