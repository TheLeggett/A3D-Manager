# labels.db File Specification

This document provides a complete technical specification for the Analogue 3D `labels.db` file format, which stores cartridge label artwork for the N64 game carousel UI.

## Overview

The `labels.db` file is a binary database that maps cartridge IDs to label artwork. **This file is user-generated** - you must create your own or obtain one from the community. The Analogue 3D does not ship with a pre-populated labels.db.

| Property | Value |
|----------|-------|
| Location on SD Card | `/Library/N64/Images/labels.db` |
| Image Dimensions | 74 × 86 pixels |
| Bytes Per Image Slot | 25,600 (25,456 image data + 144 padding) |
| Color Format | BGRA (Blue, Green, Red, Alpha) |
| Endianness | Little-endian |

## Community Resources

> **Stock Labels**: GitHub user **retrogamecorps** has shared a collection of stock image labels that were provided to Analogue 3D reviewers:
> https://github.com/retrogamecorps/Analogue-3D-Images
>
> This is an excellent starting point for building your own labels.db or obtaining artwork for known N64 titles.

---

## File Structure Overview

The file consists of four sections. The size of the file varies based on how many cartridge entries it contains.

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER (256 bytes)                             0x000 - 0x0FF│
├─────────────────────────────────────────────────────────────┤
│ CARTRIDGE ID TABLE (variable)                  0x100 - ...  │
│   N entries × 4 bytes each                                  │
├─────────────────────────────────────────────────────────────┤
│ PADDING (variable)                             ... - 0x40FF │
│   Filled with 0xFF                                          │
├─────────────────────────────────────────────────────────────┤
│ IMAGE DATA (variable)                         0x4100 - EOF  │
│   N images × 25,600 bytes each                              │
└─────────────────────────────────────────────────────────────┘
```

### File Size Calculation

For a labels.db with `N` cartridge entries:

```
Header:     256 bytes (fixed)
ID Table:   N × 4 bytes
Padding:    (0x4100 - 0x100) - (N × 4) bytes
Images:     N × 25,600 bytes
─────────────────────────────────────────
Total:      0x4100 + (N × 25,600) bytes
```

---

## Section 1: Header (0x000 - 0x0FF)

The header is exactly 256 bytes (0x100).

| Offset | Size | Content | Description |
|--------|------|---------|-------------|
| 0x00 | 1 | `0x07` | Magic byte |
| 0x01 | 11 | `Analogue-Co` | Identifier string (ASCII) |
| 0x0C | 20 | `0x00...` | Null padding |
| 0x20 | 18 | `Analogue-3D.labels` | File type identifier (ASCII) |
| 0x32 | 14 | `0x00...` | Null padding to 32 bytes |
| 0x40 | 4 | `0x00 0x00 0x02 0x00` | Version: 2.0 (little-endian) |
| 0x44 | 188 | `0x00...` | Reserved (zeros) |

### Header Verification

To verify a valid labels.db file:
```
Byte 0x00 must equal 0x07
Bytes 0x01-0x0B must equal "Analogue-Co" (ASCII)
```

### Hex Dump of Valid Header

```
00000000: 07 41 6e 61 6c 6f 67 75 65 2d 43 6f 00 00 00 00  .Analogue-Co....
00000010: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
00000020: 41 6e 61 6c 6f 67 75 65 2d 33 44 2e 6c 61 62 65  Analogue-3D.labe
00000030: 6c 73 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ls..............
00000040: 00 00 02 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
         ... (remaining header bytes 0x50-0xFF are 0x00) ...
```

---

## Section 2: Cartridge ID Table (0x100 - variable)

The cartridge ID table contains one 4-byte entry per cartridge in the database.

| Property | Value |
|----------|-------|
| Start Offset | 0x100 (256) |
| Entry Size | 4 bytes |
| Format | 32-bit unsigned integer, little-endian |
| Sorting | **Ascending numerical order** (required) |
| Maximum Entries | 4,096 (limited by padding space before 0x4100) |

### Cartridge ID Format

Each cartridge ID is a 32-bit value stored in **little-endian** format:

| Display Format | Stored Bytes | Example Game |
|----------------|--------------|--------------|
| `0x03cc04ee` | `ee 04 cc 03` | Mario Kart 64 |
| `0xac631da0` | `a0 1d 63 ac` | GoldenEye 007 |
| `0xb393776d` | `6d 77 93 b3` | Super Mario 64 |

### Table Indexing

The index position of a cartridge ID in this sorted table directly corresponds to its image position in the image data section.

```
Image Offset = 0x4100 + (table_index × 25,600)
```

### Determining Entry Count

To determine how many entries exist in a labels.db file:

```
entry_count = (file_size - 0x4100) / 25,600
```

Or by scanning the ID table from 0x100 until you encounter 0xFFFFFFFF (padding).

---

## Section 3: Padding (variable - 0x40FF)

| Property | Value |
|----------|-------|
| End Offset | 0x40FF (16,639) |
| Fill Value | `0xFF` |

The padding fills the space between the end of the ID table and the start of image data at 0x4100. All bytes in this range are `0xFF`.

As entries are added to the database, the ID table grows and the padding shrinks. The image data always starts at 0x4100.

---

## Section 4: Image Data (0x4100 - EOF)

The image data section contains consecutive images with no gaps between them.

| Property | Value |
|----------|-------|
| Start Offset | 0x4100 (16,640) |
| Bytes Per Image | 25,600 |

### Image Specifications

| Property | Value |
|----------|-------|
| Width | 74 pixels |
| Height | 86 pixels |
| Color Depth | 32-bit (4 bytes per pixel) |
| Pixel Count | 6,364 (74 × 86) |
| Bytes Per Image | 25,456 (6,364 × 4) |
| Slot Padding | 144 bytes (filled with 0xFF) |
| Total Slot Size | 25,600 bytes |

### Pixel Format: BGRA

**Critical**: Pixels are stored in **BGRA** order, not RGBA.

| Byte Offset | Channel | Description |
|-------------|---------|-------------|
| +0 | Blue | Blue component (0-255) |
| +1 | Green | Green component (0-255) |
| +2 | Red | Red component (0-255) |
| +3 | Alpha | Alpha/transparency (0-255, typically 0xFF for opaque) |

### Color Conversion

When reading images for display (BGRA → RGBA):
```
rgba[0] = bgra[2];  // Red from byte 2
rgba[1] = bgra[1];  // Green stays
rgba[2] = bgra[0];  // Blue from byte 0
rgba[3] = bgra[3];  // Alpha stays
```

When writing images to file (RGBA → BGRA):
```
bgra[0] = rgba[2];  // Blue from byte 2
bgra[1] = rgba[1];  // Green stays
bgra[2] = rgba[0];  // Red from byte 0
bgra[3] = rgba[3];  // Alpha stays
```

### Pixel Layout

Pixels are stored in row-major order (left-to-right, top-to-bottom):

```
Row 0:  pixels 0-73    (offset +0 to +295)
Row 1:  pixels 74-147  (offset +296 to +591)
...
Row 85: pixels 6290-6363 (offset +25160 to +25455)
Padding: 144 bytes of 0xFF (offset +25456 to +25599)
```

### Image Offset Calculation

To find the byte offset for image at index `i`:

```
offset = 0x4100 + (i × 25,600)
offset = 0x4100 + (i × 0x6400)
```

---

## Cartridge Lookup Process

### Reading a Label Image

1. **Parse ID Table**: Read cartridge IDs from offset 0x100 until 0xFFFFFFFF
2. **Search for Cart ID**: Find the target cartridge ID in the sorted table
3. **Get Index**: Note the index position (0-based)
4. **Calculate Offset**: `offset = 0x4100 + (index × 25,600)`
5. **Read Image**: Extract 25,456 bytes of pixel data from calculated offset (ignore 144-byte padding)
6. **Convert BGRA→RGBA**: Swap blue and red channels for display

### Writing a Label Image

1. **Find Cart ID Index**: Locate cartridge in sorted ID table
2. **Prepare Image**: Resize to 74×86 pixels
3. **Convert RGBA→BGRA**: Swap red and blue channels
4. **Calculate Offset**: `offset = 0x4100 + (index × 25,600)`
5. **Write Image**: Write 25,456 bytes of BGRA pixel data at calculated offset
6. **Write Padding**: Fill remaining 144 bytes with 0xFF

---

## Adding New Cartridges

Adding a new cartridge requires modifying both the ID table and image data:

1. **Find Insertion Point**: Binary search for correct sorted position in ID table
2. **Expand ID Table**: Insert new 4-byte ID at sorted position
3. **Shift Existing IDs**: Move all subsequent IDs down by 4 bytes
4. **Expand Image Section**: Allocate new 25,600 bytes at corresponding image position
5. **Shift Existing Images**: Move all subsequent images down by 25,600 bytes
6. **Write New Image**: Insert new image data at calculated position
7. **Update File Size**: File grows by 25,604 bytes (4 + 25,600)

**Note**: After adding entries, the padding between the ID table and 0x40FF decreases accordingly.

---

## Creating a New labels.db

To create a labels.db from scratch:

1. **Write Header**: 256 bytes as specified above
2. **Write ID Table**: Sorted list of cartridge IDs at 0x100
3. **Fill Padding**: 0xFF bytes from end of ID table to 0x40FF
4. **Write Images**: Sequential 25,600-byte BGRA images starting at 0x4100

### Minimum Valid File

A labels.db with zero entries would be:
- Header (256 bytes)
- Padding filled with 0xFF from 0x100 to 0x40FF
- No image data
- Total size: 16,640 bytes (0x4100)

---

## Cartridge ID Generation

Cartridge IDs are **CRC32 checksums of the first 8 KiB (8,192 bytes) of ROM data** in big-endian (Z64) format.

For complete details on the algorithm, ROM format conversion, and a utility script to compute IDs from ROM files, see **[Cart ID Algorithm](./CART_ID_ALGORITHM.md)**.

### Example Cartridge IDs

| Hex ID | Game Title |
|--------|------------|
| `03cc04ee` | Mario Kart 64 |
| `04079b93` | Super Smash Bros. |
| `ac631da0` | GoldenEye 007 |
| `b04b4109` | Star Fox 64 |
| `b393776d` | Super Mario 64 |
| `e5240d18` | The Legend of Zelda: Ocarina of Time |
| `fffffffe` | Unknown Cartridge (placeholder) |

---

## Implementation Notes

### Recommended Constants

```typescript
// labels.db format constants
const HEADER_SIZE = 0x100;         // 256 bytes
const ID_TABLE_START = 0x100;      // 256
const DATA_START = 0x4100;         // 16,640
const IMAGE_WIDTH = 74;            // pixels
const IMAGE_HEIGHT = 86;           // pixels
const BYTES_PER_PIXEL = 4;         // BGRA
const IMAGE_DATA_SIZE = 25456;     // 74 × 86 × 4 (actual pixel data)
const IMAGE_SLOT_SIZE = 25600;     // Total slot including 144 bytes padding
const SLOT_PADDING = 144;          // 0xFF padding at end of each slot
```

---

## Binary Format Summary

```
Offset      Description                    Size        Value/Format
───────────────────────────────────────────────────────────────────────────────────
0x000       Magic byte                     1           0x07
0x001       Identifier                     11          "Analogue-Co"
0x00C       Padding                        20          0x00
0x020       File type                      32          "Analogue-3D.labels\0..."
0x040       Version                        4           0x00020000 (LE)
0x044       Reserved                       188         0x00
0x100       Cartridge ID table             N × 4       uint32_le (sorted ascending)
...         Padding                        variable    0xFF
0x4100      Image data                     N × 25600   BGRA pixels (74×86) + 144 bytes padding
───────────────────────────────────────────────────────────────────────────────────

Image Slot Structure (25,600 bytes each):
┌────────────────────────────────────────┬──────────────┐
│ BGRA Pixel Data (74×86×4 = 25,456 B)   │ Padding (144)│
└────────────────────────────────────────┴──────────────┘
```

---

## Validation

This specification is validated by a comprehensive test suite. See [TESTING.md](./TESTING.md) for details on running the tests.

The test suite includes:
- Pixel-perfect round-trip verification (write → read → compare)
- Binary format compliance checks
- CRUD operation tests (Create, Read, Update, Delete)
- Edge case handling (empty database, sorted insertion)
