import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { trackPageView } from './lib/analytics';
import { CartridgesPage } from './components/CartridgesPage';
import { StatsPage } from './components/StatsPage';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HelpPage } from './components/HelpPage';
import { SettingsPage } from './components/SettingsPage';
import { ComponentTestPage } from './components/ComponentTestPage';
import { LabelSyncProvider } from './components/LabelSyncIndicator';
import { LibrarySyncProvider } from './components/LibrarySyncIndicator';
import { ServicesProvider, ServicesContext } from './contexts/ServicesContext';
import { BrowserCompatibilityScreen, BrowserCompatibilityProvider, useBrowserCompatibility } from './components/BrowserCompatibilityScreen';
import { SDCardOnboarding } from './components/SDCardOnboarding';
import { DataSafetyModal, useDataSafetyModal } from './components/DataSafetyModal';
import { InstallPrompt } from './components/InstallPrompt';
import type { SDCard } from './types';
import type { CartridgeSettings } from './lib/defaultSettings';
import { setStaticMode as setSettingsAutoSaveStaticMode } from './lib/settingsAutoSave';
import './App.css';

// Detect if we're running in static mode (no server)
const isStaticMode = import.meta.env.VITE_MODE === 'static' || !import.meta.env.DEV;

// Set static mode for settings auto-save
setSettingsAutoSaveStaticMode(isStaticMode);

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
  // In static mode, get SD card state from ServicesContext
  const servicesContext = useContext(ServicesContext);

  const [sdCards, setSDCards] = useState<SDCard[]>([]);
  const [selectedSDCard, setSelectedSDCard] = useState<SDCard | null>(null);
  const [loading, setLoading] = useState(false);

  // In static mode, sync selectedSDCard from ServicesContext
  useEffect(() => {
    if (isStaticMode && servicesContext) {
      const browserSDCard = servicesContext.sdCard;
      if (browserSDCard && browserSDCard.isValid) {
        // Convert BrowserSDCard to SDCard format for compatibility
        // In browser mode, we use the folder name as the identifier
        const sdCard: SDCard = {
          name: browserSDCard.name,
          path: browserSDCard.name, // Use name as path identifier in browser mode
          gamesPath: 'Games',
          libraryDbPath: 'Library/N64/library.db',
          labelsDbPath: 'Library/N64/labels.db',
        };
        setSelectedSDCard(sdCard);
        setSDCards([sdCard]);
      } else {
        setSelectedSDCard(null);
        setSDCards([]);
      }
    }
  }, [servicesContext?.sdCard, servicesContext?.isSDCardConnected]);

  const detectSDCards = useCallback(async (isPolling = false) => {
    // In static mode, SD card selection is handled by ServicesContext
    if (isStaticMode) {
      return;
    }

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

  // Initial detection (only in server mode)
  useEffect(() => {
    if (!isStaticMode) {
      detectSDCards();
    }
  }, [detectSDCards]);

  // Poll for SD card changes every 5 seconds (only in server mode)
  useEffect(() => {
    if (isStaticMode) {
      return;
    }

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
  const { showCompatibilityScreen } = useBrowserCompatibility();
  const servicesContext = useContext(ServicesContext);
  const { showModal: showDataSafetyModal, acknowledge: acknowledgeDataSafety } = useDataSafetyModal();
  const [onboardingSkipped, setOnboardingSkipped] = useState(false);

  // Check if startup modals are disabled (developer setting)
  const startupModalsDisabled = localStorage.getItem('dev:disableStartupModals') === 'true';

  // Show browser compatibility screen (only in static mode)
  if (isStaticMode && showCompatibilityScreen) {
    return <BrowserCompatibilityScreen />;
  }

  // Show onboarding modal whenever SD card is not connected (in static mode)
  // Also check if user chose to skip onboarding or if modals are disabled
  const showOnboarding = isStaticMode && !servicesContext?.isSDCardConnected && !onboardingSkipped && !startupModalsDisabled;

  // Show data safety modal after SD card connected but before using the app (once per session)
  const showDataSafety = isStaticMode && servicesContext?.isSDCardConnected && showDataSafetyModal && !startupModalsDisabled;

  return (
    <div className="app">
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/cartridges" replace />} />
          <Route path="/cartridges" element={<CartridgesPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/labels" element={<Navigate to="/cartridges" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/component-test" element={<ComponentTestPage />} />
        </Routes>
      </main>
      <Footer />
      {/* PWA Install Prompt */}
      {isStaticMode && <InstallPrompt />}
      {/* Data Safety Modal - shows once per session after SD card connected */}
      {showDataSafety && <DataSafetyModal onAcknowledge={acknowledgeDataSafety} />}
      {/* SD Card Onboarding Modal */}
      {showOnboarding && <SDCardOnboarding onSkip={() => setOnboardingSkipped(true)} />}
    </div>
  );
}

function AppWithProviders() {
  return (
    <BrowserCompatibilityProvider>
      <ImageCacheProvider>
        <SDCardProvider>
          <SettingsClipboardProvider>
            <LabelSyncProvider>
              <LibrarySyncProvider>
                <AppContent />
              </LibrarySyncProvider>
            </LabelSyncProvider>
          </SettingsClipboardProvider>
        </SDCardProvider>
      </ImageCacheProvider>
    </BrowserCompatibilityProvider>
  );
}

// Track page views on route changes for analytics
function PageViewTracker() {
  const location = useLocation();

  useEffect(() => {
    // Extract page name from path
    const pageName = location.pathname === '/' ? 'home' : location.pathname.slice(1);
    trackPageView(pageName);
  }, [location]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <PageViewTracker />
      {isStaticMode ? (
        <ServicesProvider>
          <AppWithProviders />
        </ServicesProvider>
      ) : (
        <AppWithProviders />
      )}
    </BrowserRouter>
  );
}

export default App;

// Export the static mode flag for use in other components
export { isStaticMode };
