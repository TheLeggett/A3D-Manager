import { Link, useLocation } from 'react-router-dom';
import { SDCardSelector } from './SDCardSelector';
import './Navbar.css';

export function Navbar() {
  const location = useLocation();

  return (
    <header className="app-header">
      <h1><strong>A3D</strong> Manager</h1>
      <nav className="app-nav">
        <Link
          to="/cartridges"
          className={`nav-tab text-pixel ${location.pathname === '/cartridges' ? 'active' : ''}`}
        >
          Cartridges
        </Link>
        <Link
          to="/sync"
          className={`nav-tab text-pixel ${location.pathname === '/sync' ? 'active' : ''}`}
        >
          Sync to SD
        </Link>
        <Link
          to="/help"
          className={`nav-tab text-pixel ${location.pathname === '/help' ? 'active' : ''}`}
        >
          Help
        </Link>
      </nav>
      <div className="header-actions">
        <SDCardSelector />
      </div>
    </header>
  );
}
