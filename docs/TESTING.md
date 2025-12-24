# Testing

This document describes the testing infrastructure for A3D Manager.

## Running Tests

From the project root:

```bash
# Run all tests
npx tsx tests/run.ts

# Run with verbose output (writes test artifacts)
npx tsx tests/run.ts --verbose
```

## Test Structure

```
tests/
├── run.ts                  # Unified test runner
├── utils.ts                # Shared test utilities
├── labels-db/
│   ├── tests.ts            # Labels database tests
│   ├── fixtures/           # Test images and data
│   └── output/             # Generated output (gitignored)
└── file-transfer/
    ├── tests.ts            # File transfer tests
    └── output/             # Generated output (gitignored)

server/lib/
├── labels-db-core.ts       # Labels database operations
└── file-transfer.ts        # Progress-enabled file operations
```

## Adding New Tests

1. Create a new directory under `tests/` (e.g., `tests/my-feature/`)
2. Create `tests.ts` that exports a `TestSuite`:

```typescript
import { test, assert, assertEqual, TestSuite } from '../utils.js';

export const myFeatureSuite: TestSuite = {
  name: 'My Feature',
  tests: [
    test('does something', () => {
      assertEqual(1 + 1, 2);
    }),
  ],
};
```

3. Import and add the suite to `tests/run.ts`

## Test Utilities

The shared `utils.ts` provides:

- `test(name, fn)` - Create a test function
- `assert(condition, message)` - Assert a condition is true
- `assertEqual(actual, expected, message)` - Assert equality
- `assertBuffersEqual(actual, expected, message)` - Compare buffers
- `runSuite(suite)` - Run a test suite and collect results
- `printSummary(results)` - Print final summary

---

## Labels Database Tests (34 tests)

Tests for the labels.db file format. See [LABELS_DB_SPECIFICATION.md](./LABELS_DB_SPECIFICATION.md).

| Category | Tests | Description |
|----------|-------|-------------|
| Constants | 4 | Verifies 74x86 dimensions, 25,456 byte image size, 144 byte padding |
| Header | 5 | Header creation, validation, and rejection of invalid headers |
| Color Conversion | 3 | BGRA/RGBA conversion and round-trip preservation |
| Empty Database | 2 | Edge case of empty labels.db with zero entries |
| Round-Trip | 4 | Pixel-perfect verification of write/read cycle |
| CRUD | 10 | Create, Read, Update, Delete with sorted insertion |
| Image Slots | 3 | 144-byte 0xFF padding at end of each slot |
| Binary Format | 2 | Little-endian ID storage and file size formula |

---

## File Transfer Tests (20 tests)

Tests for the progress-enabled file transfer library used by SD card sync.

| Category | Tests | Description |
|----------|-------|-------------|
| Format Helpers | 11 | formatBytes, formatTime, formatSpeed, createProgressBar |
| Single File Copy | 4 | File copying, progress callbacks, speed/ETA, directory creation |
| Directory Copy | 3 | Structure copying, batch progress, byte tracking |
| Edge Cases | 2 | Empty files and empty directories |
