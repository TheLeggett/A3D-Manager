import { usePageTitle, SEO_TITLES } from '../lib/seo';
import './HelpPage.css';

export function HelpPage() {
  usePageTitle(SEO_TITLES.help);
  return (
    <div className="help-page">
      <div className="help-content">
        <h1>A3D Manager</h1>
        <p className="help-subtitle">
          An unofficial utility for managing your Analogue 3D.
          An open source community version of this project is available on{' '}
          <a href="https://github.com/TheLeggett/A3D-Manager" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>.
        </p>

        <section className="help-section">
          <h2>Features</h2>
          <div className="feature-grid">
            <div className="feature-card">
              <h3>Custom Artwork</h3>
              <p>
                Upload custom label images for your cartridges that display
                on the Analogue 3D game carousel.
              </p>
            </div>
            <div className="feature-card">
              <h3>Per-Game Settings</h3>
              <p>
                Configure display, performance, and Controller Pak settings
                for each individual cartridge.
              </p>
            </div>
            <div className="feature-card">
              <h3>Backup & Restore</h3>
              <p>
                Export your labels, settings, and saves to a portable
                <code>.a3d</code> bundle file.
              </p>
            </div>
            <div className="feature-card">
              <h3>Browser-Based</h3>
              <p>
                Works entirely in your browser. No software to install,
                and your data stays on your device.
              </p>
            </div>
          </div>
        </section>

        <section className="help-section">
          <h2>Quick Start</h2>
          <div className="info-card">
            <h3>Managing Labels</h3>
            <p>
              Go to <strong>Cartridges</strong>, find a game, and click it to upload
              custom artwork. Images are automatically resized to 74×86 pixels.
            </p>
          </div>
          <div className="info-card">
            <h3>Syncing to SD Card</h3>
            <p>
              Changes save locally until you sync. Connect your SD card and click
              <strong> Sync to SD Card</strong> to write your changes.
            </p>
          </div>
          <div className="info-card">
            <h3>Creating Backups</h3>
            <p>
              Go to <strong>Settings → Export Bundle</strong> to save all your data
              to a <code>.a3d</code> file. Store this somewhere safe.
            </p>
          </div>
        </section>

        <section className="help-section">
          <h2>How the Analogue 3D Works</h2>
          <div className="info-card">
            <h3>Cartridge Recognition</h3>
            <p>
              When you insert a cartridge, the Analogue 3D computes a unique ID from
              the ROM data. This ID is used to look up the game title and find matching
              artwork in <code>labels.db</code>.
            </p>
          </div>
          <div className="info-card">
            <h3>Label Format</h3>
            <dl className="tech-grid">
              <dt>Location</dt>
              <dd><code>/Library/N64/Images/labels.db</code></dd>
              <dt>Image Size</dt>
              <dd>74 × 86 pixels</dd>
              <dt>Format</dt>
              <dd>BGRA (Blue, Green, Red, Alpha)</dd>
            </dl>
          </div>
          <div className="info-card">
            <h3>Limitations</h3>
            <p>
              <strong>Game names cannot be changed.</strong> The Analogue 3D uses its
              internal firmware database for titles. Unknown cartridges (flash carts,
              homebrew) display as "Unknown Cartridge" but can still have custom artwork.
            </p>
          </div>
        </section>

        <section className="help-section disclaimer">
          <h2>Important Disclaimer</h2>
          <div className="warning-box">
            <p>
              <strong>This is NOT official Analogue software.</strong> A3D Manager is not
              affiliated with, endorsed by, or supported by Analogue, Inc.
            </p>
            <p>
              <strong>Use at your own risk.</strong> While care has been taken to ensure
              this tool works correctly, we are not responsible for any data loss or damage
              to your SD card or Analogue 3D. Always back up your SD card before making changes.
            </p>
          </div>
        </section>

        <section className="help-section">
          <h2>Credits &amp; Community Resources</h2>
          <ul className="credits-list">
            <li>
              <a href="https://github.com/theleggett" target="_blank" rel="noopener noreferrer">
                David Leggett
              </a>
              {' '}@{' '}
              <a href="https://blackairplane.com" target="_blank" rel="noopener noreferrer">
                Black Airplane
              </a>
              {' '}— Creator
            </li>
            <li>
              <a href="https://github.com/retrogamecorps/Analogue-3D-Images" target="_blank" rel="noopener noreferrer">
                Retro Game Corps
              </a>
              {' '}— Community label artwork collections
            </li>
            <li>
              <a href="https://github.com/mroach/rom64" target="_blank" rel="noopener noreferrer">
                mroach
              </a>
              {' '}— ROM database for cart title lookups
            </li>
            <li>
              <a href="https://www.reddit.com/r/AnalogueInc/" target="_blank" rel="noopener noreferrer">
                r/AnalogueInc
              </a>
              {' '}— Special thanks to the amazing community on r/AnalogueInc
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
