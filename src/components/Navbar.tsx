import { Link, useLocation } from 'react-router-dom';
import { SDCardSelector } from './SDCardSelector';
import { useBrowserCompatibility } from './BrowserCompatibilityScreen';
import './Navbar.css';

export function Navbar() {
  const location = useLocation();
  const { isUnsupportedBrowser, hasDismissedWarning, showWarningScreen } = useBrowserCompatibility();

  // Show browser warning indicator if user dismissed the warning on an unsupported browser
  const showBrowserWarning = isUnsupportedBrowser && hasDismissedWarning;

  return (
    <header className="app-header">
      <Link to="/cartridges" className="app-title-link">
        <h1><strong>A3D</strong> Manager</h1>
      </Link>
      <nav className="app-nav">
        <Link
          to="/cartridges"
          className={`nav-tab text-pixel ${location.pathname === '/cartridges' ? 'active' : ''}`}
        >
          Cartridges
        </Link>
        <Link
          to="/settings"
          className={`nav-tab text-pixel ${location.pathname === '/settings' ? 'active' : ''}`}
        >
          Settings
        </Link>
        <Link
          to="/help"
          className={`nav-tab text-pixel ${location.pathname === '/help' ? 'active' : ''}`}
        >
          Help
        </Link>
        {showBrowserWarning && (
          <button
            className="nav-tab nav-warning text-pixel"
            onClick={showWarningScreen}
            title="Your browser is not fully supported. Click for details."
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Browser</span>
          </button>
        )}
      </nav>
      <div className="header-actions">
        <SDCardSelector />
      </div>
    </header>
  );
}
