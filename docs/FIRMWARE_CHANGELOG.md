# Analogue 3D Firmware Changelog

This document tracks discovered changes to the Analogue 3D's internal formats,
SD card structure, and settings across firmware versions.

## 3D OS 1.2.0

Release Date: January 2026

### New Hardware Settings

| Setting | Type | Values | Description |
|---------|------|--------|-------------|
| `forceProgressiveOutput` | boolean | true/false | Forces progressive video output mode |

### File Format Changes

- **library.db**: No changes (remains v1.0)
- **labels.db**: No changes (remains v2.0)
- **controller_pak.img**: No changes (32KB raw format)
- **settings.json**: Added `hardware.forceProgressiveOutput` field

### Notes

- The `forceProgressiveOutput` setting only appears in settings.json files
  that were created or modified after updating to 1.2.0
- Older settings files remain compatible and work without this field

---

## 3D OS 1.1.x and Earlier

### Baseline Format Versions

| File | Version | Notes |
|------|---------|-------|
| library.db | v1.0 (0x00010000) | Initial release format |
| labels.db | v2.0 (0x00020000) | Initial release format |
| controller_pak.img | - | 32KB raw N64 Controller Pak dump |
| settings.json | - | JSON with 8 hardware settings |

### Original Hardware Settings

- virtualExpansionPak
- region
- disableDeblur
- enable32BitColor
- disableTextureFiltering
- disableAntialiasing
- forceOriginalHardware
- overclock
