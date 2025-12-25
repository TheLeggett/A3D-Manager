import { useImageCache } from '../App';
import './SettingsPage.css';

export function SettingsPage() {
  const { invalidateImageCache, lastInvalidated } = useImageCache();

  const handleClearCache = () => {
    invalidateImageCache();
  };

  return (
    <div className="settings-page">
      <div className="settings-content">
        <h1>Settings</h1>

        <section className="settings-section">
          <h2>Image Cache</h2>
          <p>
            If you're seeing stale or incorrect label artwork, you can clear the image cache
            to force all images to be reloaded from the server.
          </p>

          <div className="setting-row">
            <div className="setting-info">
              <h3>Clear Image Cache</h3>
              <p className="setting-description">
                Invalidates the client-side cache for all label images. This will cause
                all images to be re-fetched on the next page load.
              </p>
              {lastInvalidated > 0 && (
                <p className="setting-meta">
                  Last cleared: {new Date(lastInvalidated).toLocaleString()}
                </p>
              )}
            </div>
            <button className="btn-primary" onClick={handleClearCache}>
              Clear Cache
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
