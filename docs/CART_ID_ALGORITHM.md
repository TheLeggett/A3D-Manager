# Analogue 3D Cartridge ID Algorithm

This document describes how the Analogue 3D generates unique identifiers for N64 cartridges.

## Overview

The Analogue 3D identifies each N64 cartridge using an 8-character hexadecimal ID (32-bit value). This ID is used throughout the system:

- Game folder names: `/Library/N64/Games/[Title] [hex_id]/`
- Label artwork lookup in `labels.db`
- Internal game database matching

## Algorithm

**The Analogue 3D computes a CRC32 checksum of the first 8 KiB (8,192 bytes) of the ROM data.**

| Property | Value |
|----------|-------|
| Algorithm | CRC32 (IEEE 802.3 polynomial) |
| Polynomial | 0xEDB88320 (reversed) |
| Input Size | 8,192 bytes (first 8 KiB of ROM) |
| ROM Format | Big-endian (Z64 format) |
| Output | 32-bit value as 8 lowercase hex characters |

### Why First 8 KiB?

The first 8 KiB of an N64 ROM contains uniquely identifying data:

```
0x000 - 0x03F  ROM Header (64 bytes)
               - PI config, clock rate, entry point
               - CRC1/CRC2 checksums
               - Game title (20 chars)
               - Game code (4 chars, e.g., "NKTE")
               - Region code

0x040 - 0xFFF  IPL3 Boot Code (~4 KB)
               - CIC-specific boot code
               - Varies by protection chip type

0x1000+        Start of game executable
```

This region is sufficient to uniquely identify virtually all N64 ROMs while being small enough to read quickly from physical cartridges.

### Verified Examples

| Game | A3D Cart ID | ROM Title | Game Code |
|------|-------------|-----------|-----------|
| Mario Kart 64 (USA) | `03cc04ee` | MARIOKART64 | NKTE |
| Star Fox 64 (USA) | `b04b4109` | STARFOX64 | NFXE |
| Zelda: Ocarina of Time | `e5240d18` | - | - |
| Super Mario 64 | `b393776d` | - | - |
| GoldenEye 007 | `ac631da0` | - | - |
| Super Smash Bros. | `04079b93` | - | - |

---

## N64 ROM Formats

N64 ROMs exist in three byte-order formats. The CRC32 must be computed on the **big-endian (Z64)** format.

| Format | Extension | First 4 Bytes | Description |
|--------|-----------|---------------|-------------|
| Z64 | `.z64` | `80 37 12 40` | Big-endian (native N64) |
| V64 | `.v64` | `37 80 40 12` | Byte-swapped |
| N64 | `.n64` | `40 12 37 80` | Little-endian (word-swapped) |

### Format Conversion

If your ROM is not in Z64 format, convert it before computing the CRC32:

**V64 → Z64** (byte-swap):
```
For each pair of bytes: AB CD → BA DC
```

**N64 → Z64** (word-swap):
```
For each 4-byte word: AB CD EF GH → GH EF CD AB
```

---

## Utility Script

This project includes a script to compute A3D cart IDs from ROM files.

### Usage

```bash
# Single ROM file
npx tsx scripts/compute-a3d-id.ts "path/to/game.z64"

# Batch process a folder
npx tsx scripts/compute-a3d-id.ts /path/to/roms --batch

# Output as JSON
npx tsx scripts/compute-a3d-id.ts /path/to/roms --batch --json > cart-ids.json
```

### Output Example

```
File:      Star Fox 64 (U).z64
Format:    z64
Title:     STARFOX64
Game Code: NFXE
A3D ID:    b04b4109
```

### JSON Output Format

```json
[
  {
    "id": "b04b4109",
    "title": "STARFOX64",
    "gameCode": "NFXE",
    "format": "z64",
    "file": "Star Fox 64 (U).z64"
  }
]
```

---

## CRC32 Implementation

The algorithm uses the standard IEEE 802.3 CRC32 with the following parameters:

```typescript
// Polynomial (reversed)
const POLYNOMIAL = 0xEDB88320;

// Initialize CRC
let crc = 0xFFFFFFFF;

// Process each byte
for (const byte of data) {
  crc = TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
}

// Finalize
crc = (crc ^ 0xFFFFFFFF) >>> 0;
```

### Lookup Table Generation

```typescript
const TABLE = new Array(256);
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let j = 0; j < 8; j++) {
    crc = crc & 1 ? POLYNOMIAL ^ (crc >>> 1) : crc >>> 1;
  }
  TABLE[i] = crc >>> 0;
}
```

---

## Cart Names Database

This project includes a static database that maps A3D cart IDs to game names, enabling search and browse functionality in the web app.

### Database Location

```
data/cart-names.json
```

### Format

The database is a simple JSON array:

```json
[
  {
    "id": "03cc04ee",
    "gameCode": "NKTE",
    "name": "Mario Kart 64 (USA)"
  },
  {
    "id": "b04b4109",
    "gameCode": "NFXE",
    "name": "Star Fox 64 (USA) (Rev 1)"
  }
]
```

| Field | Description |
|-------|-------------|
| `id` | 8-character hex cart ID (lowercase) |
| `gameCode` | 4-character N64 game code from ROM header |
| `name` | Human-readable game title with region/version info |

### How It's Used

- **Labels browser**: Displays game names on cart tiles instead of just hex IDs
- **Search**: Users can search by game name, cart ID, or game code
- **Edit modal**: Shows the game name when editing a cart's label

### Building the Database

The database can be built or updated using scripts that combine ROM analysis with a No-Intro DAT file for clean, accurate game names.

#### Prerequisites

For best results, you need a No-Intro N64 DAT file:

1. Download `roms.dat.xml` from [mroach/rom64](https://github.com/mroach/rom64) or the No-Intro website
2. Place it in the project root directory (it's gitignored)

The DAT file provides:
- Clean, properly formatted game names
- Region information (USA, Europe, Japan, etc.)
- Version/revision information
- Language details

#### Option 1: Update Existing Database from DAT File

If you already have `cart-names.json` and just want to improve the names:

```bash
npx tsx scripts/update-cart-names-from-dat.ts
```

This matches existing entries by game code and updates names from the DAT file.

#### Option 2: Build from ROM Collection

To build a complete database from a ROM collection:

```bash
# Step 1: Scan ROMs to generate ID mappings
npx tsx scripts/compute-a3d-id.ts /path/to/roms --batch --json > data/rom-id-mappings.json

# Step 2: Build the database (uses DAT file if available)
npx tsx scripts/build-cart-name-db.ts
```

#### Fallback Behavior

If `roms.dat.xml` is not present, the scripts fall back to:

1. **ROM internal names** - Extracted from the ROM header (offset 0x20-0x33)
2. **Name cleaning** - Underscores replaced with spaces, ALL CAPS converted to Title Case
3. **Region/version appending** - Added from ROM header metadata when available

Example fallback transformations:
- `AIDYN_CHRONICLES` → "Aidyn Chronicles"
- `STARFOX64` → "Starfox64"

The DAT file provides significantly better names, so it's recommended when rebuilding the database.

---

## Related Documentation

- [labels.db Specification](./LABELS_DB_SPECIFICATION.md) - How artwork is stored and looked up by cart ID
- [SD Card Format](./ANALOGUE_3D_SD_CARD_FORMAT.md) - Overall SD card structure
