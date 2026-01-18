/**
 * Browser Compatibility Screen
 *
 * Blocks non-Chrome desktop users. This app requires Chrome's
 * File System Access API which only works on Chrome desktop.
 */

import { useState } from 'react';
import { getBrowserInfo } from '../services/browser/BrowserCheck';
import './BrowserCompatibilityScreen.css';

/**
 * Check if the browser is Google Chrome on desktop (not Chromium variants, not mobile)
 */
function isGoogleChromeDesktop(): boolean {
  const ua = navigator.userAgent;

  // Check for mobile devices - File System Access API doesn't work on mobile
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);

  if (isIOS || isAndroid) {
    return false;
  }

  // Must have Chrome in UA
  if (!ua.includes('Chrome/')) {
    return false;
  }

  // Exclude other Chromium browsers that identify themselves
  if (ua.includes('Edg/') || ua.includes('Edge/')) return false;  // Edge
  if (ua.includes('OPR/') || ua.includes('Opera/')) return false; // Opera
  if (ua.includes('Brave/')) return false;                         // Brave (when it identifies)
  if (ua.includes('Vivaldi/')) return false;                       // Vivaldi
  if (ua.includes('Arc/')) return false;                           // Arc

  // Check for Brave's navigator.brave API
  // @ts-expect-error - navigator.brave is Brave-specific
  if (navigator.brave) return false;

  // At this point it's likely Chrome desktop
  return true;
}

export function BrowserCompatibilityScreen() {
  const [browserInfo] = useState(() => getBrowserInfo());
  const isChromeDesktop = isGoogleChromeDesktop();

  // If Chrome desktop, don't show this screen at all
  if (isChromeDesktop) {
    return null;
  }

  const isMobile = browserInfo.isMobile;

  return (
    <div className="compatibility-screen">
      <div className="compatibility-content">
        <div className="compatibility-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <circle cx="12" cy="16" r="0.5" fill="currentColor" />
          </svg>
        </div>

        <h1 className="compatibility-title">
          {isMobile ? 'Desktop Required' : 'Chrome Required'}
        </h1>

        {isMobile ? (
          <p className="compatibility-message">
            A3D Manager requires a <strong>desktop computer</strong> with <strong>Google Chrome</strong> to
            access your SD card. The File System Access API needed for SD card access is not available
            on mobile devices (iOS or Android).
          </p>
        ) : (
          <p className="compatibility-message">
            A3D Manager requires <strong>Google Chrome</strong> to access your SD card directly from the browser.
            Unfortunately, other browsers (including Brave, Edge, and Firefox) don't support this feature reliably.
          </p>
        )}

        <div className="compatibility-details">
          <div className="detected-browser">
            <span className="detected-label">Detected browser:</span>
            <span className="detected-name">{browserInfo.name} {browserInfo.version}</span>
          </div>
        </div>

        {isMobile ? (
          <div className="compatibility-why">
            <h3>Why desktop only?</h3>
            <p>
              A3D Manager uses the File System Access API to read and write directly to your
              Analogue 3D's SD card. This API is only available on desktop browsers—it's not
              supported on iOS (any browser) or Android. Please visit this site on a desktop
              computer with Google Chrome.
            </p>
          </div>
        ) : (
          <>
            <div className="chrome-download">
              <h2>Get Google Chrome</h2>
              <p>Download Chrome to use A3D Manager:</p>
              <a
                href="https://www.google.com/chrome/"
                target="_blank"
                rel="noopener noreferrer"
                className="chrome-download-btn"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
                Download Chrome
              </a>
            </div>

            <div className="compatibility-why">
              <h3>Why Chrome only?</h3>
              <p>
                A3D Manager uses the File System Access API to read and write directly to your
                Analogue 3D's SD card. While this API exists in other Chromium browsers,
                it doesn't work reliably due to privacy restrictions. Chrome provides the
                most consistent experience.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Hook to check if user can access the app
 */
export function useCompatibilityCheck() {
  const [isAllowed] = useState(() => isGoogleChromeDesktop());

  return {
    showScreen: !isAllowed,
    dismissScreen: () => {} // No dismissing allowed
  };
}
