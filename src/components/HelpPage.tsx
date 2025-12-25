import './HelpPage.css';

export function HelpPage() {
  return (
    <div className="help-page">
      <div className="help-content">
        <h1>About A3D Manager</h1>

        <section className="help-section">
          <h2>What is this?</h2>
          <p>
            A3D Manager is an unofficial, community-created utility for managing custom label artwork
            on your Analogue 3D (N64) SD card. It allows you to browse, edit, and sync cartridge labels
            to the <code>labels.db</code> file that the Analogue 3D uses to display game artwork.
          </p>
        </section>

        <section className="help-section disclaimer">
          <h2>Important Disclaimer</h2>
          <div className="warning-box">
            <p>
              <strong>This is NOT official Analogue software.</strong> This tool is a community project
              and is not affiliated with, endorsed by, or supported by Analogue.
            </p>
            <p>
              <strong>Use at your own risk.</strong> While we've taken care to ensure this tool works correctly,
              we are not responsible for any data loss, corruption, or damage to your SD card or Analogue 3D.
              Always back up your SD card before making changes.
            </p>
          </div>
        </section>

        <section className="help-section">
          <h2>How the Analogue 3D Works</h2>

          <h3>Cartridge Recognition</h3>
          <p>
            When you insert a cartridge, the Analogue 3D computes a unique identifier (CRC32 hash)
            from the first 8 KB of the ROM data. This ID is used to:
          </p>
          <ul>
            <li>Look up the game title in the console's internal firmware database</li>
            <li>Create a folder on your SD card at <code>/Library/N64/Games/[Game Name] [hex_id]/</code></li>
            <li>Find matching artwork in <code>labels.db</code> to display in the console's menu</li>
          </ul>

          <h3>Label Artwork Database</h3>
          <p>
            The file at <code>/Library/N64/Images/labels.db</code> contains all the label artwork
            displayed on your Analogue 3D. Each image is:
          </p>
          <ul>
            <li>74 × 86 pixels in size</li>
            <li>Stored in BGRA color format (Blue, Green, Red, Alpha)</li>
            <li>Indexed by the cartridge's unique hex ID</li>
          </ul>
          <p>
            The Analogue 3D does not ship with artwork pre-installed. You need to either create
            your own or use community resources like{' '}
            <a href="https://github.com/retrogamecorps/Analogue-3D-Images" target="_blank" rel="noopener noreferrer">
              retrogamecorps/Analogue-3D-Images
            </a>.
          </p>

          <h3>Limitations: Game Names</h3>
          <p>
            <strong>You cannot rename games through the SD card.</strong> The Analogue 3D determines
            game titles using its internal firmware database. Renaming folders or editing{' '}
            <code>settings.json</code> files has no effect on what the console displays.
          </p>
          <p>
            Unknown cartridges (flash carts, homebrew, reproduction carts) will always appear as
            "Unknown Cartridge" — but you <em>can</em> add custom artwork for them!
          </p>
        </section>

        <section className="help-section">
          <h2>How to Use This Tool</h2>

          <h3>1. Labels Database Tab</h3>
          <ul>
            <li>Browse all labels currently in your local database</li>
            <li>Search by game name or cartridge ID (hex code)</li>
            <li>Click any label to edit it or upload custom artwork</li>
            <li>Add new entries for unknown cartridges by clicking "Add Cartridge"</li>
          </ul>

          <h3>2. Uploading Custom Artwork</h3>
          <ul>
            <li>Click on a label to open the editor</li>
            <li>Upload a PNG or JPG image — it will automatically be resized to 74×86 pixels</li>
            <li>The image is converted to BGRA format and stored locally</li>
            <li>Changes are saved to your local database (not your SD card yet)</li>
          </ul>

          <h3>3. Sync to SD Card</h3>
          <ul>
            <li>Select your SD card from the dropdown in the header</li>
            <li>Go to the "Sync to SD" tab</li>
            <li>Review the changes that will be written</li>
            <li>Click "Sync to SD Card" to write <code>labels.db</code> to your SD card</li>
          </ul>

          <h3>4. Settings</h3>
          <ul>
            <li>Configure where your local database is stored</li>
            <li>Reset your local database if needed</li>
            <li>Import existing <code>labels.db</code> files from your SD card or other sources</li>
          </ul>
        </section>

        <section className="help-section">
          <h2>Tips & Best Practices</h2>
          <ul>
            <li><strong>Always back up your SD card</strong> before syncing changes</li>
            <li>Test with one or two labels first before doing a full sync</li>
            <li>Use high-quality source images for best results</li>
            <li>The tool automatically handles image resizing and format conversion</li>
            <li>Changes are stored locally until you explicitly sync to SD card</li>
            <li>You can safely close the app without losing your local changes</li>
          </ul>
        </section>

        <section className="help-section">
          <h2>Technical Details</h2>
          <p>
            If you're interested in the technical workings of the Analogue 3D SD card format,
            check out the documentation in the project repository:
          </p>
          <ul>
            <li><code>docs/LABELS_DB_SPECIFICATION.md</code> — Label database binary format</li>
            <li><code>docs/ANALOGUE_3D_SD_CARD_FORMAT.md</code> — Complete SD card structure</li>
            <li><code>docs/CART_ID_ALGORITHM.md</code> — How cartridge IDs are computed</li>
          </ul>
        </section>

        <section className="help-section">
          <h2>Credits & Community</h2>
          <p>
            This tool was created by the community to help Analogue 3D owners customize their
            label artwork. Special thanks to:
          </p>
          <ul>
            <li><a href="https://github.com/retrogamecorps/Analogue-3D-Images" target="_blank" rel="noopener noreferrer">Retro Game Corps</a> for sharing their community label artwork collections</li>
            <li><a href="https://github.com/mroach/rom64/tree/master" target="_blank" rel="noopener noreferrer">mroach</a> for the an incredible roms.dat.xml file that helped us generate titles for cart labels</li>
            <li>All contributors who computed and contributed cart IDs to the database</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
