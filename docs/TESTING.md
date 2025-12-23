# Testing

This document describes the testing infrastructure for A3D Manager.

## Running All Tests

From the project root:

```bash
# Run all test suites
npx tsx tests/labels-db/test-suite.ts
```

## Test Structure

```
tests/
└── labels-db/              # labels.db file format tests
    ├── test-suite.ts       # Main test suite
    ├── scripts/            # Helper scripts
    ├── fixtures/           # Test data
    └── output/             # Generated output (gitignored)

server/lib/
└── labels-db-core.ts       # Core library (used by tests and application)
```

Each test directory follows a similar pattern:
- `test-suite.ts` - Main test runner
- `scripts/` - Helper scripts for fixtures and utilities
- `fixtures/` - Static test data (images, JSON configs)
- `output/` - Generated files during tests (automatically cleaned)

Shared libraries live in `server/lib/` and are imported by both tests and application code.

## Output Directories

All `output/` directories are automatically cleaned at the start of each test run to prevent stale data from affecting results. Only `.gitignore` files are preserved.

---

## labels.db Tests

Tests for the labels.db file format specification. See [LABELS_DB_SPECIFICATION.md](./LABELS_DB_SPECIFICATION.md) for the format documentation.

### Running

```bash
# Run the full test suite (34 tests)
npx tsx tests/labels-db/test-suite.ts

# Verify fixtures are present and valid
npx tsx tests/labels-db/scripts/create-fixtures.ts

# Build a test database from fixtures
npx tsx tests/labels-db/scripts/build-test-db.ts
```

### Test Categories

| Category | Tests | Description |
|----------|-------|-------------|
| Constants | 4 | Verifies 74×86 dimensions, 25,456 byte image size, 144 byte padding |
| Header Operations | 5 | Tests header creation, validation, and rejection of invalid headers |
| Color Conversion | 3 | Tests BGRA↔RGBA conversion and round-trip preservation |
| Empty Database | 2 | Tests edge case of empty labels.db with zero entries |
| Round-Trip Storage | 4 | Pixel-perfect verification of write/read cycle |
| CRUD Operations | 10 | Create, Read, Update, Delete with sorted insertion |
| Image Slot Structure | 3 | Verifies 144-byte 0xFF padding at end of each slot |
| Binary Format | 2 | Little-endian ID storage and file size formula |

### Key Validations

**Pixel-Perfect Round-Trip**: Creates a database, extracts the image, and compares raw RGBA buffers byte-by-byte.

**Binary Format Compliance**: Verifies little-endian cart IDs, file size formula `0x4100 + (N × 25,600)`, and 144-byte slot padding.

**Sorted ID Table**: Entries are automatically sorted by cart ID when creating or adding to a database.

### Fixtures

| File | Description |
|------|-------------|
| `sample-label.png` | Generic 74×86 test image |
| `cart-ids.json` | Test cart ID mappings |

### Reference Implementation

The `tests/labels-db/lib/labels-db.ts` file contains a clean reference implementation of the labels.db format. This serves as:
1. A testable implementation of the specification
2. Documentation through code
3. A potential replacement for existing ad-hoc implementations
