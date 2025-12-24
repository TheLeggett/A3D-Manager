# A3D Manager

A utility for managing cartridge artwork and settings for your Analogue 3D (N64) SD card.

## Features

### Label Artwork Manager
- Browse N64 cart labels from your SD card's `labels.db`
- **Real-time search** by game name, cart ID, or game code as you type
- View game names for 340+ known N64 titles
- Upload custom PNG/JPG artwork that gets automatically converted to the correct format (74x86 BGRA)
- Export modified labels back to SD card

### Unknown Cartridge Support
- Upload custom label artwork for homebrew/unknown carts
- Filter to show only unknown cartridges from your SD card

### Full Sync to SD Card
- Export all label artwork to `labels.db`

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

### Managing Label Artwork

1. Navigate to the "Labels Database" tab
2. Search for a game by cart ID
3. Click on a label to edit it
4. Upload a new image (PNG/JPG) - it will be automatically resized and converted

### Syncing to SD Card

1. Make sure your SD card is connected and selected
2. Click "Sync to SD" button in the header
3. Review the preview of changes
4. Click "Sync to SD Card" to apply changes

## Known Issues / Areas for Improvement

### "Unknown Cartridge" Still Shows on Analogue

**Issue**: After syncing, the Analogue 3D may still display "Unknown Cartridge" as the game title even though:
- The folder has been renamed correctly (e.g., "SummerCart64 fffffffe")
- The `settings.json` file has the correct title
- The custom label artwork displays correctly

**Possible causes being investigated**:
- The Analogue 3D has an internal database that it uses to display cart names rather than folder names on the SD Card, or titles in settings.json for each game.

**Workaround**: The label artwork displays correctly, which at least helps identify games visually. Example: You can add custom artwork to the SummerCart 64 cartridge, upload that labels.db file to the A3D SD Card, and that artwork will appear in the A3D main menu.

### SD Card Write Performance

Writing to SD cards is inherently slower than SSD/HDD.

## How It Works

The app stores your changes locally in `.local/` (gitignored). Changes are only written to your SD card when you explicitly sync.

### Labels Database Format

The Analogue 3D stores cart labels in `Library/N64/Images/labels.db`:
- Header with "Analogue-Co" identifier
- ID table: Variable number of cart IDs (4 bytes each, sorted ascending)
- Image data: 74x86 pixels, BGRA format, 25600 bytes per slot (25456 image + 144 padding)

See [docs/LABELS_DB_SPECIFICATION.md](./docs/LABELS_DB_SPECIFICATION.md) for complete format documentation.

## SD Card Structure

See [docs/ANALOGUE_3D_SD_CARD_FORMAT.md](./docs/ANALOGUE_3D_SD_CARD_FORMAT.md) for detailed documentation of the Analogue 3D SD card format.

## Cart ID Algorithm

The Analogue 3D identifies cartridges using a CRC32 checksum of the first 8 KiB of ROM data. This project includes:

- **Cart names database** (`data/cart-names.json`) - Maps 340+ cart IDs to game names
- **ID computation script** - Calculate A3D cart IDs from ROM files

See [docs/CART_ID_ALGORITHM.md](./docs/CART_ID_ALGORITHM.md) for technical details.

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Express.js + TypeScript
- **Image Processing**: sharp