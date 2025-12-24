# Design Guidelines

This document contains design rules and guidelines for the Analogue 3D Cart Art application. Follow these guidelines to ensure visual consistency across all features.

---

## Design Philosophy

The visual language is inspired by **Analogue OS** — clean, dark, minimalist with retro accents. The design combines modern UI patterns with pixel-art styling to honor the N64/retro gaming aesthetic while maintaining usability.

Key principles:
- **Dark-first**: Pure black background with subtle surface elevation
- **Gold accent**: Yellow/gold as the primary action color
- **Retro touches**: Pixel font for labels, IDs, and navigation
- **High contrast**: White text on dark backgrounds for readability
- **Subtle interactions**: Smooth transitions, understated hover states

---

## Typography

### Font Families

| Variable | Font Stack | Usage |
|----------|------------|-------|
| `--font-pixel` | `'Habbo', monospace` | Nav tabs, labels, IDs, badges, section headers |
| `--font-body` | `'DM Sans', system-ui, -apple-system, sans-serif` | Body text, descriptions, form inputs |

### Pixel Font (`--font-pixel`)

The Habbo pixel font is used for retro-styled UI elements. It provides the distinctive "retro gaming" feel.

**Critical:** The pixel font must always be used at **16px font size**. Using other sizes causes bitmap scaling artifacts.