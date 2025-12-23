# A3D Manager

A utility for managing cartridge artwork and settings for your Analogue 3D (N64) SD card.

## Features

### Label Artwork Manager
- Browse N64 cart labels from your SD card's `labels.db`
- View, search, and filter labels by name or cart ID
- Upload custom PNG/JPG artwork that gets automatically converted to the correct format (74x86 BGRA)
- Import all labels to local storage for editing
- Export modified labels back to SD card with real-time progress

### Unknown Cartridge Support
- Filter view to show only "Unknown Cartridge" entries (homebrew, flash carts like SummerCart 64)
- Name unknown cartridges in your local cart database
- Upload custom label artwork for homebrew/unknown carts
- New cart entries are automatically added to `labels.db` during sync

### Full Sync to SD Card
- Preview all changes before syncing
- Rename game folders from "Unknown Cartridge XXXXXXXX" to proper names
- Update `settings.json` title field for each game
- Export all label artwork to `labels.db`
- Real-time progress tracking with SSE (Server-Sent Events)

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Development

Run both the frontend and backend in development mode:

```bash
npm run dev
```

This starts:
- Frontend at http://localhost:5173
- Backend API at http://localhost:3001

## Usage

### First Time Setup

1. Insert your Analogue 3D SD card
2. Click "SD Card Sync" in the top right to detect your SD card
3. Select your SD card from the dropdown
4. Go to "Labels Database" tab and click "Import Labels" to copy all artwork locally

### Managing Label Artwork

1. Navigate to the "Labels Database" tab
2. Search for a game by name or cart ID
3. Click on a label to edit it
4. Upload a new image (PNG/JPG) - it will be automatically resized and converted

### Naming Unknown Cartridges

1. In "Labels Database" tab, check "Unknown Cartridges Only"
2. Click on an unknown cart to edit
3. Enter a name and optionally upload label artwork
4. Click "Save Changes"

### Syncing to SD Card

1. Make sure your SD card is connected and selected
2. Click "Sync to SD" button in the header
3. Review the preview of changes:
   - Folder renames (for "Unknown Cartridge" folders)
   - Settings.json title updates
   - Label artwork exports
4. Click "Sync to SD Card" to apply changes
5. Watch real-time progress as each label is written

## Known Issues / Areas for Improvement

### "Unknown Cartridge" Still Shows on Analogue

**Issue**: After syncing, the Analogue 3D may still display "Unknown Cartridge" as the game title even though:
- The folder has been renamed correctly (e.g., "SummerCart64 fffffffe")
- The `settings.json` file has the correct title
- The custom label artwork displays correctly

**Possible causes being investigated**:
- The Analogue may cache game names and require a full rescan
- There may be another database file that controls displayed names
- The `library.db` file might need to be regenerated

**Workaround**: The label artwork displays correctly, which at least helps identify games visually.

### SD Card Write Performance

Writing to SD cards is inherently slower than SSD/HDD. The sync progress now shows real-time updates so you can monitor the export of each label.

## How It Works

The app stores your changes locally in `.local/` (gitignored). Changes are only written to your SD card when you explicitly sync.

### Labels Database Format

The Analogue 3D stores cart labels in `Library/N64/Images/labels.db`:
- Header with "Analogue-Co" identifier
- ID table: 901 cart IDs (4 bytes each, sorted)
- Image data: 74x86 pixels, BGRA format, 25600 bytes per slot

### Cart Name Database

User-defined cart names are stored in `data/n64-carts.json`:
```json
{
  "version": 1,
  "carts": [
    { "id": "fffffffe", "name": "SummerCart64", "official": false }
  ]
}
```

### Game Folder Structure

Games are stored in `Library/N64/Games/[GameName] [CartID]/`:
- `game.n64` - ROM file
- `settings.json` - Game settings including `"title"` field
- `artwork.tga` - Box art (3340x3854, 16-bit RGBA 5-5-5-1)

## SD Card Structure

See [ANALOGUE_3D_SD_CARD_FORMAT.md](./ANALOGUE_3D_SD_CARD_FORMAT.md) for detailed documentation of the Analogue 3D SD card format.

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Express.js + TypeScript
- **Image Processing**: sharp

## Project Structure

```
├── .local/                    # Local working data (gitignored)
│   └── Library/N64/
│       └── Labels/            # Local label PNGs
├── data/
│   └── n64-carts.json         # User-defined cart names
├── server/                    # Express.js backend
│   ├── lib/
│   │   ├── analogue-db.ts     # Game data parsing
│   │   ├── labels-db.ts       # Labels.db read/write
│   │   ├── sd-card.ts         # SD card detection
│   │   └── tga.ts             # TGA image conversion
│   └── routes/
│       ├── cart-db.ts         # Cart database API
│       ├── games.ts           # Game management API
│       ├── labels.ts          # Labels API
│       └── sync.ts            # SD card sync API
├── src/                       # React frontend
│   ├── components/
│   │   ├── LabelsBrowser.tsx  # Labels grid view
│   │   ├── LabelEditor.tsx    # Label editing modal
│   │   ├── SyncToSD.tsx       # Sync dialog with progress
│   │   └── ...
│   └── hooks/
│       ├── useGames.ts
│       └── useSync.ts
└── ANALOGUE_3D_SD_CARD_FORMAT.md
```

## API Endpoints

### Labels
- `GET /api/labels` - List all labels from SD card
- `GET /api/labels/:cartId/image` - Get label image (PNG)
- `POST /api/labels/:cartId/image` - Upload new label image
- `POST /api/labels/import-all` - Import all labels to local storage
- `GET /api/labels/search?q=...` - Search labels by name

### Cart Database
- `GET /api/cart-db` - Get cart name database
- `GET /api/cart-db/unknown` - Get unknown cartridges from SD card
- `PUT /api/cart-db/:cartId` - Update/create cart name

### Sync
- `GET /api/sd-cards` - Detect connected SD cards
- `GET /api/sync/full/preview?sdCardPath=...` - Preview sync changes
- `GET /api/sync/full/apply-stream?sdCardPath=...` - Apply sync with SSE progress

## License

MIT
