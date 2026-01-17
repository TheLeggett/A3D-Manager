/**
 * PWA Install Prompt Component
 *
 * Shows a prompt to install the app when available.
 * Uses the beforeinstallprompt event to detect installation availability.
 */

import { useState, useEffect, useCallback } from 'react';
import './InstallPrompt.css';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Storage key for tracking dismissal
const INSTALL_PROMPT_DISMISSED_KEY = 'a3d-install-prompt-dismissed';
const INSTALL_PROMPT_DISMISSED_UNTIL_KEY = 'a3d-install-prompt-dismissed-until';

/**
 * Check if the install prompt was recently dismissed
 */
function isPromptDismissed(): boolean {
  try {
    const dismissedUntil = localStorage.getItem(INSTALL_PROMPT_DISMISSED_UNTIL_KEY);
    if (dismissedUntil) {
      const until = parseInt(dismissedUntil, 10);
      if (Date.now() < until) {
        return true;
      }
      // Clear expired dismissal
      localStorage.removeItem(INSTALL_PROMPT_DISMISSED_UNTIL_KEY);
    }

    const dismissed = localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY);
    return dismissed === 'true';
  } catch {
    return false;
  }
}

/**
 * Dismiss the prompt temporarily (for 7 days)
 */
function dismissPromptTemporarily(): void {
  try {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      INSTALL_PROMPT_DISMISSED_UNTIL_KEY,
      String(Date.now() + sevenDays)
    );
  } catch {
    // localStorage not available
  }
}

/**
 * Dismiss the prompt permanently
 */
function dismissPromptPermanently(): void {
  try {
    localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, 'true');
  } catch {
    // localStorage not available
  }
}

interface InstallPromptProps {
  /** Position of the prompt */
  position?: 'top' | 'bottom';
}

export function InstallPrompt({ position = 'bottom' }: InstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  // Check if already installed
  useEffect(() => {
    // Check if running in standalone mode (installed PWA)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Check iOS standalone
    // @ts-expect-error - navigator.standalone is Safari-specific
    if (window.navigator.standalone === true) {
      setIsInstalled(true);
      return;
    }
  }, []);

  // Listen for beforeinstallprompt event
  useEffect(() => {
    if (isInstalled || isPromptDismissed()) {
      return;
    }

    const handler = (e: Event) => {
      // Prevent Chrome 76+ from showing the mini-infobar
      e.preventDefault();

      // Store the event for later use
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Show our custom prompt after a delay
      setTimeout(() => {
        setShowPrompt(true);
      }, 3000); // Show after 3 seconds
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, [isInstalled]);

  // Listen for app installed event
  useEffect(() => {
    const handler = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handler);

    return () => {
      window.removeEventListener('appinstalled', handler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    await deferredPrompt.prompt();

    // Wait for user response
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setIsInstalled(true);
    }

    // Clear the deferred prompt
    setDeferredPrompt(null);
    setShowPrompt(false);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    dismissPromptTemporarily();
    setShowPrompt(false);
  }, []);

  const handleNeverShow = useCallback(() => {
    dismissPromptPermanently();
    setShowPrompt(false);
  }, []);

  if (!showPrompt || isInstalled) {
    return null;
  }

  return (
    <div className={`install-prompt install-prompt--${position}`}>
      <div className="install-prompt__content">
        <img src="/icons/logo-128.png" alt="A3D Manager" className="install-prompt__icon" />
        <div className="install-prompt__text">
          <p className="install-prompt__title">Install A3D Manager</p>
          <p className="install-prompt__subtitle">
            Add to your home screen for quick access and offline support
          </p>
        </div>
        <div className="install-prompt__actions">
          <button className="install-prompt__btn install-prompt__btn--primary" onClick={handleInstall}>
            Install
          </button>
          <button className="install-prompt__btn install-prompt__btn--secondary" onClick={handleDismiss}>
            Later
          </button>
        </div>
        <button
          className="install-prompt__close"
          onClick={handleNeverShow}
          aria-label="Never show again"
        >
          ×
        </button>
      </div>
    </div>
  );
}

/**
 * Hook to check if the app is installed
 */
export function useIsAppInstalled(): boolean {
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;

    // Check if running in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return true;
    }

    // Check iOS standalone
    // @ts-expect-error - navigator.standalone is Safari-specific
    if (window.navigator.standalone === true) {
      return true;
    }

    return false;
  });

  useEffect(() => {
    const handler = () => setIsInstalled(true);
    window.addEventListener('appinstalled', handler);
    return () => window.removeEventListener('appinstalled', handler);
  }, []);

  return isInstalled;
}
