# Analogue 3D SD Card Format Documentation

This document describes the file structure and formats used by the Analogue 3D (N64) SD card.

## Directory Structure

```
/
├── Library/
│   └── N64/
│       ├── Games/
│       │   └── [Game Title] [hex_id]/
│       │       ├── controller_pak.img    # Virtual Controller Pak save data (32KB)
│       │       └── settings.json         # Per-game settings
│       ├── Images/
│       │   └── labels.db                 # Master label/artwork database (22MB)
│       └── library.db                    # Game library database
└── Settings/
    └── Global/                           # Global settings (may be empty)
```

## Game Folders

Each game the system recognizes gets a folder in `/Library/N64/Games/`.

### Folder Naming Convention

```
[Game Title] [8-character hex ID]
```

Examples:
- `GoldenEye 007 ac631da0`
- `Super Mario 64 b393776d`
- `Unknown Cartridge 1c414340`

**Important**: The game title displayed by the Analogue 3D is determined internally by the console's firmware, NOT from the folder name. Renaming the folder or updating `settings.json` has no effect on the displayed title. The Analogue 3D uses its own internal database to identify games by their cartridge ID.

### Hex ID (Cartridge Identification)

The 8-character hex ID is a unique identifier for each physical cartridge. **The Analogue 3D computes this ID by calculating a CRC32 checksum of the first 8 KiB (8,192 bytes) of the ROM data.**

For complete technical details, see **[CART_ID_ALGORITHM.md](./CART_ID_ALGORITHM.md)**.

#### Quick Reference

| Property | Value |
|----------|-------|
| Algorithm | CRC32 (IEEE 802.3) |
| Input | First 8,192 bytes of ROM (Z64 format) |
| Output | 8 lowercase hex characters |

#### Calculating Cart IDs

```bash
npx tsx scripts/compute-a3d-id.ts "game.z64"
npx tsx scripts/compute-a3d-id.ts /path/to/roms --batch
```

#### ID Characteristics

- Known games have IDs recognized by Analogue's internal database
- Unknown cartridges (flash carts, homebrew) get unique IDs based on ROM content
- The special ID `fffffffe` is a placeholder for unidentified cartridges

## File Formats

### controller_pak.img (Controller Pak Save Data)

**Format**: Raw N64 Controller Pak memory dump
**Size**: 32,768 bytes (32KB) - exactly 256Kbit
**Purpose**: Virtual Controller Pak save data for games that use the N64 memory card

The N64 Controller Pak was a memory card that plugged into the controller for saving game progress. This file emulates that storage for each game.

**Structure**:
- Pages: 123 pages of 256 bytes each
- First pages contain index/allocation tables
- Remaining pages store actual save data

**Note**: The `file` command may misidentify this as a TGA image due to coincidental byte patterns, but it is NOT an image file.

### settings.json (Per-Game Configuration)

JSON configuration file for each game. Contains display and hardware settings.

```json
{
  "title": "Game Name",
  "display": {
    "odm": "crt",                    // Active display mode: "bvm", "pvm", "crt", "scanlines", "clean"
    "catalog": {
      "bvm": { ... },               // Professional BVM monitor settings
      "pvm": { ... },               // Professional PVM monitor settings
      "crt": { ... },               // Consumer CRT settings
      "scanlines": { ... },         // Scanline filter settings
      "clean": { ... }              // Clean/digital filter settings
    }
  },
  "hardware": {
    "virtualExpansionPak": true,    // Enable virtual Expansion Pak
    "region": "Auto",               // Region: "Auto", "NTSC", "PAL"
    "disableDeblur": false,         // Disable VI deblur
    "enable32BitColor": true,       // Enable 32-bit color mode
    "disableTextureFiltering": false,
    "disableAntialiasing": false,
    "forceOriginalHardware": false,
    "overclock": "Unleashed"        // "Auto", "Enhanced", "Unleashed"
  }
}
```

#### Display Catalog Settings

Each display mode has these settings:

```json
{
  "horizontalBeamConvergence": "Professional",  // "Off", "Consumer", "Professional"
  "verticalBeamConvergence": "Professional",
  "enableEdgeOvershoot": false,
  "enableEdgeHardness": false,
  "imageSize": "Fill",                          // "Fill", "Fit"
  "imageFit": "Original"                        // "Original", "Stretch"
}
```

The "clean" mode has different settings:

```json
{
  "interpolationAlg": "BC Spline",              // Interpolation algorithm
  "gammaTransferFunction": "Tube",
  "sharpness": "Medium",                        // "Low", "Medium", "High"
  "imageSize": "Fill",
  "imageFit": "Original"
}
```

### library.db (Game Library Database)

**Format**: Proprietary Analogue binary format
**Size**: ~16KB
**Purpose**: Index of all games the system knows about

#### Structure

```
Offset    Size    Description
0x00      1       Magic byte (0x07)
0x01      11      Identifier "Analogue-Co" (null-padded to 32 bytes)
0x20      32      File type "Analogue-3D.library" (null-padded)
0x40      4       Version (0x00010000 = v1.0)
0x44-0xFF         Reserved (zeros)
0x100     N×4     Array of 32-bit little-endian cartridge IDs
...               Remaining bytes are 0xFF (empty slots)
```

The cartridge IDs at offset 0x100 are stored in **little-endian** format. For example:
- Folder `ac631da0` → stored as `a0 1d 63 ac`
- Folder `e5240d18` → stored as `18 0d 24 e5`

### labels.db (Master Label/Artwork Database)

**Format**: Proprietary Analogue binary format
**Size**: Variable (depends on number of entries)
**Purpose**: Label artwork for N64 games displayed in the carousel UI

This is the primary source of game artwork. When a cartridge is inserted, the system looks up its ID in this database to display the appropriate label image.

| Property | Value |
|----------|-------|
| Location | `/Library/N64/Images/labels.db` |
| Image Dimensions | 74 × 86 pixels |
| Color Format | BGRA (Blue, Green, Red, Alpha) |
| Bytes Per Image Slot | 25,600 |

For complete technical specification, see **[LABELS_DB_SPECIFICATION.md](./LABELS_DB_SPECIFICATION.md)**.

**Note**: This file is user-generated. The Analogue 3D does not ship with a pre-populated labels.db. Community resources like [retrogamecorps/Analogue-3D-Images](https://github.com/retrogamecorps/Analogue-3D-Images) provide stock artwork.

## Cartridge Recognition Flow

When a cartridge is inserted:

1. The Analogue 3D reads the cartridge and computes its unique hex ID
2. It looks up this ID in its internal firmware database to determine the game title
3. The game folder in `/Library/N64/Games/` is created/accessed using this ID
4. Artwork is loaded from `labels.db` using the cartridge ID as a lookup key
5. Unknown cartridges not in the firmware database display as "Unknown Cartridge"
6. Unknown cartridges not in `labels.db` display with no artwork

## Customizing Unknown Cartridges

### Game Names (Not Customizable)

Unfortunately, the Analogue 3D does not support renaming games through the SD card. The console uses an internal firmware database to determine game titles based on cartridge ID. Modifications to folder names or `settings.json` files have no effect on the displayed title.

Unknown cartridges (flash carts, homebrew, etc.) will always display as "Unknown Cartridge" regardless of what the folder is named on the SD card.

### Adding Custom Artwork

Custom artwork can be added to `labels.db` to display label images for any cartridge, including unknown ones. The A3D Manager tool can:
1. Add new entries to the labels database
2. Update existing label artwork
3. Export the modified database back to your SD card

See **[LABELS_DB_SPECIFICATION.md](./LABELS_DB_SPECIFICATION.md)** for technical details.

## Notes

- All files use `rwx------` (700) permissions
- macOS may create `._` metadata files (e.g., `._labels.db`) - these are safe to ignore
- The `Settings/Global/` directory may be empty or contain global device settings
