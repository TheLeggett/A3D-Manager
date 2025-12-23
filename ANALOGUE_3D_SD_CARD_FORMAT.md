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
│       ├── library.db                    # Game library database
│       └── library.db.bak                # Backup of library.db
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

**Important**: The game title displayed by the Analogue 3D comes directly from the folder name. To rename a cartridge, simply rename its folder (keeping the hex ID suffix intact).

### Hex ID

The 8-character hex ID is a unique identifier for each physical cartridge. This appears to be derived from the cartridge's ROM data (possibly a CRC32 or similar checksum).

- Known games have recognizable IDs that Analogue's database knows about
- Unknown cartridges (flash carts, homebrew, etc.) get assigned unique IDs
- The special ID `fffffffe` appears to be a placeholder for unidentified cartridges

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
**Size**: ~22MB (contains 901 label images)
**Purpose**: Pre-loaded label artwork for all known N64 games displayed in the carousel UI

This is the primary source of game artwork. When a cartridge is inserted, the system looks up its ID in this database to display the appropriate label image.

#### Structure

```
Offset      Size        Description
0x00        1           Magic byte (0x07)
0x01        31          Identifier "Analogue-Co" (null-padded to 32 bytes)
0x20        32          File type "Analogue-3D.labels" (null-padded)
0x40        4           Version (0x00020000 = v2.0)
0x44-0xFF               Reserved (zeros)
0x100       901×4       Cartridge ID table (sorted, little-endian 32-bit)
0xF14-0x40FF            Padding (0xFF bytes)
0x4100      901×25600   Image data (sequential, 25,600 bytes per image)
```

#### Cartridge ID Table (0x100 - 0xF14)

The table contains 901 cartridge IDs as 32-bit little-endian values, **sorted numerically**. The position in this sorted list determines the image index.

#### Image Data Format

- **Dimensions**: 80 × 80 pixels
- **Format**: Raw RGBA (4 bytes per pixel, 32-bit color)
- **Size**: 25,600 bytes per image (80 × 80 × 4)
- **Total images**: 901
- **Order**: Images are stored sequentially in the same order as the cartridge ID table

#### Lookup Process

To find artwork for a cartridge:
1. Binary search the cartridge ID table (0x100) for the hex ID
2. Get the index position in the sorted table
3. Calculate image offset: `0x4100 + (index × 25600)`
4. Read 25,600 bytes of raw RGBA pixel data

#### Example

For Mario Kart 64 (cart ID `0x03cc04ee`):
- Found at index 10 in the sorted ID table
- Image offset: `0x4100 + (10 × 25600) = 0x42900`
- Read 25,600 bytes from offset 0x42900

**Note**: Unknown cartridges not in this database will show as "Unknown" with no artwork.

## Cartridge Recognition Flow

When a cartridge is inserted:

1. The Analogue 3D reads the cartridge and computes its unique hex ID
2. It looks up this ID in `library.db` to check if it's a known game
3. If found, it reads the game folder matching that ID
4. The display title comes from the folder name (before the hex ID)
5. Artwork is loaded from `labels.db` using the cartridge ID as a lookup key
6. Unknown cartridges not in `labels.db` display with no artwork

## Customizing Unknown Cartridges

### Renaming a Cart

To change the displayed name for a flash cart or unknown game:

1. Find the folder in `/Library/N64/Games/` (e.g., `Unknown Cartridge 1c414340`)
2. Rename it to `YourPreferredName hex_id` (e.g., `SummerCart 64 1c414340`)
3. The hex ID suffix must remain unchanged

### Adding Custom Artwork

Custom artwork for unknown cartridges requires modifying `labels.db`. This is a complex binary format - see the labels.db documentation above. A utility tool would be needed to:
1. Add a new entry to the offset table
2. Append the raw image data to the file
3. Update any internal indexes

## Known Cartridge IDs

| Hex ID     | Game Title |
|------------|------------|
| ac631da0   | GoldenEye 007 |
| e5240d18   | The Legend of Zelda: Ocarina of Time |
| 03cc04ee   | Mario Kart 64 |
| b04b4109   | Star Fox 64 |
| b393776d   | Super Mario 64 |
| 04079b93   | Super Smash Bros. |
| fffffffe   | Unknown (placeholder) |

## Notes

- All files use `rwx------` (700) permissions
- macOS may create `._` metadata files (e.g., `._labels.db`) - these are safe to ignore
- `library.db.bak` is an automatic backup of `library.db`
- The `Settings/Global/` directory may be empty or contain global device settings
