/**
 * Browser Compatibility Screen
 *
 * Displayed when the browser doesn't fully support the app.
 * Shows information about what features are missing and recommends
 * compatible browsers.
 */

import { useState } from 'react';
import {
  checkBrowserCompatibility,
  getRecommendedBrowsers,
  dismissCompatibilityWarning,
  isCompatibilityWarningDismissed,
  type CompatibilityResult,
} from '../services/browser/BrowserCheck';
import './BrowserCompatibilityScreen.css';

interface BrowserCompatibilityScreenProps {
  /** If true, allows user to continue anyway */
  allowContinue?: boolean;
  /** Called when user chooses to continue */
  onContinue?: () => void;
}

export function BrowserCompatibilityScreen({
  allowContinue = true,
  onContinue,
}: BrowserCompatibilityScreenProps) {
  const [compatibility] = useState<CompatibilityResult>(() =>
    checkBrowserCompatibility()
  );
  const [dismissed, setDismissed] = useState(false);

  const handleContinue = () => {
    setDismissed(true);
    onContinue?.();
  };

  const handleDontShowAgain = () => {
    dismissCompatibilityWarning();
    handleContinue();
  };

  if (dismissed || !compatibility.showWarning) {
    return null;
  }

  const { browser } = compatibility;
  const recommendedBrowsers = getRecommendedBrowsers();

  return (
    <div className="compatibility-screen">
      <div className="compatibility-content">
        <div className="compatibility-icon">
          {compatibility.level === 'unsupported' ? '⚠️' : 'ℹ️'}
        </div>

        <h1 className="compatibility-title">
          {compatibility.level === 'unsupported'
            ? 'Browser Not Supported'
            : 'Limited Browser Support'}
        </h1>

        <p className="compatibility-message">{compatibility.message}</p>

        <div className="compatibility-details">
          <h2>Your Browser</h2>
          <div className="browser-info">
            <span className="browser-name">{browser.name}</span>
            <span className="browser-version">v{browser.version}</span>
          </div>

          {browser.missingFeatures.length > 0 && (
            <div className="missing-features">
              <h3>Missing Features</h3>
              <ul>
                {browser.missingFeatures.map((feature, i) => (
                  <li key={i}>{feature}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="recommended-browsers">
          <h2>Recommended Browsers</h2>
          <p className="recommended-subtitle">
            For full functionality, please use one of these browsers:
          </p>
          <div className="browser-list">
            {recommendedBrowsers.map((b) => (
              <a
                key={b.name}
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className="browser-link"
              >
                <span className="browser-link-name">{b.name}</span>
                <span className="browser-link-arrow">→</span>
              </a>
            ))}
          </div>
        </div>

        {allowContinue && compatibility.level === 'partial' && (
          <div className="compatibility-actions">
            <button className="btn btn-primary" onClick={handleContinue}>
              Continue Anyway
            </button>
            <button className="btn btn-secondary" onClick={handleDontShowAgain}>
              Don't Show Again
            </button>
          </div>
        )}

        {compatibility.level === 'partial' && (
          <p className="compatibility-note">
            Note: You can still browse and manage your collection, but SD card sync
            features won't be available.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Hook to check if compatibility screen should be shown
 */
export function useCompatibilityCheck() {
  const [showScreen, setShowScreen] = useState(() => {
    const compatibility = checkBrowserCompatibility();
    const dismissed = isCompatibilityWarningDismissed();
    return compatibility.showWarning && !dismissed;
  });

  const dismissScreen = () => setShowScreen(false);

  return { showScreen, dismissScreen };
}
