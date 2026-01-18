import './Footer.css';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="footer-glow" />
      <div className="footer-content">
        <div className="footer-brand">
          <strong>A3D</strong> Manager
        </div>
        <p className="footer-tagline">The unofficial companion app for your Analogue 3D</p>
        <div className="footer-links">
          <a
            href="https://a3dmanager.com"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="footer-icon">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <span>A3DManager.com</span>
          </a>
          <a
            href="https://github.com/TheLeggett/A3D-Manager"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="footer-icon">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            <span>Open Source Version</span>
          </a>
        </div>
        <div className="footer-legal">
          <p className="footer-disclaimer">Not affiliated with Analogue, Inc.</p>
          <span className="footer-divider">·</span>
          <p className="footer-copyright">&copy; {currentYear} <a href="https://github.com/theleggett" target="_blank" rel="noopener noreferrer">David Leggett</a></p>
        </div>
      </div>
    </footer>
  );
}
