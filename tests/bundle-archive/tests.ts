/**
 * Bundle Archive Tests
 *
 * Tests for the bundle export/import functionality
 */

import { test, assert, assertEqual, TestSuite } from '../utils.js';
import { existsSync } from 'fs';
import { mkdir, writeFile, rm, readdir } from 'fs/promises';
import path from 'path';
import AdmZip from 'adm-zip';

// We need to dynamically import the bundle-archive module since it uses .js extension
const bundleArchiveModule = await import('../../server/lib/bundle-archive.js');
const { createBundle, parseBundle } = bundleArchiveModule;

// Test paths
const TEST_OUTPUT_DIR = path.join(process.cwd(), 'tests', 'bundle-archive', 'output');
const TEST_LOCAL_DIR = path.join(process.cwd(), '.local');
const TEST_GAMES_DIR = path.join(TEST_LOCAL_DIR, 'Library', 'N64', 'Games');

export async function cleanOutput(): Promise<void> {
  if (existsSync(TEST_OUTPUT_DIR)) {
    await rm(TEST_OUTPUT_DIR, { recursive: true });
  }
  await mkdir(TEST_OUTPUT_DIR, { recursive: true });
}

// Check if we have the local games directory (only exists in development)
const hasLocalGames = existsSync(TEST_GAMES_DIR);

export const bundleArchiveSuite: TestSuite = {
  name: 'Bundle Archive',
  tests: hasLocalGames ? [
    test('should export settings for selected cart IDs', async () => {
      // This test verifies that when we export with specific cartIds,
      // the settings from matching game folders are included

      // First check what game folders exist
      if (!existsSync(TEST_GAMES_DIR)) {
        throw new Error(`Games directory doesn't exist: ${TEST_GAMES_DIR}`);
      }

      const folders = await readdir(TEST_GAMES_DIR);
      console.log(`    Found ${folders.length} game folders`);

      // Find a folder with settings
      let testCartId: string | null = null;
      for (const folder of folders) {
        const match = folder.match(/([0-9a-fA-F]{8})$/);
        if (match) {
          const settingsPath = path.join(TEST_GAMES_DIR, folder, 'settings.json');
          if (existsSync(settingsPath)) {
            testCartId = match[1].toLowerCase();
            console.log(`    Using cart ID: ${testCartId} (${folder})`);
            break;
          }
        }
      }

      if (!testCartId) {
        throw new Error('No game folder with settings.json found for testing');
      }

      // Create bundle with this cart ID
      const bundle = await createBundle({
        includeLabels: false,
        includeOwnership: false,
        includeSettings: true,
        includeGamePaks: false,
        cartIds: [testCartId],
      });

      assert(bundle.length > 0, 'Bundle should not be empty');

      // Parse the bundle and check contents
      const parsed = await parseBundle(bundle);

      console.log(`    Manifest: settingsCount=${parsed.manifest.contents.settingsCount}`);
      console.log(`    Settings map size: ${parsed.settings.size}`);

      assertEqual(parsed.settings.size, 1, 'Should have exactly 1 settings entry');
      assert(parsed.settings.has(testCartId), `Settings should contain cart ID: ${testCartId}`);

      // Write bundle to file for inspection
      const outputPath = path.join(TEST_OUTPUT_DIR, 'test-export.a3d');
      await writeFile(outputPath, bundle);
      console.log(`    Bundle written to: ${outputPath}`);
    }),

    test('should export settings with uppercase cart IDs', async () => {
      // Test that uppercase cart IDs work (normalization)
      if (!existsSync(TEST_GAMES_DIR)) {
        throw new Error(`Games directory doesn't exist: ${TEST_GAMES_DIR}`);
      }

      const folders = await readdir(TEST_GAMES_DIR);

      // Find a folder with settings
      let testCartId: string | null = null;
      for (const folder of folders) {
        const match = folder.match(/([0-9a-fA-F]{8})$/);
        if (match) {
          const settingsPath = path.join(TEST_GAMES_DIR, folder, 'settings.json');
          if (existsSync(settingsPath)) {
            testCartId = match[1].toUpperCase(); // Use uppercase
            console.log(`    Using uppercase cart ID: ${testCartId}`);
            break;
          }
        }
      }

      if (!testCartId) {
        throw new Error('No game folder with settings.json found for testing');
      }

      // Create bundle with uppercase cart ID
      const bundle = await createBundle({
        includeLabels: false,
        includeOwnership: false,
        includeSettings: true,
        includeGamePaks: false,
        cartIds: [testCartId],
      });

      const parsed = await parseBundle(bundle);

      assertEqual(parsed.settings.size, 1, 'Should have exactly 1 settings entry with uppercase ID');
    }),

    test('bundle manifest should have correct counts', async () => {
      if (!existsSync(TEST_GAMES_DIR)) {
        throw new Error(`Games directory doesn't exist: ${TEST_GAMES_DIR}`);
      }

      const folders = await readdir(TEST_GAMES_DIR);
      const cartIds: string[] = [];

      // Find folders with settings
      for (const folder of folders) {
        const match = folder.match(/([0-9a-fA-F]{8})$/);
        if (match) {
          const settingsPath = path.join(TEST_GAMES_DIR, folder, 'settings.json');
          if (existsSync(settingsPath)) {
            cartIds.push(match[1].toLowerCase());
          }
        }
      }

      console.log(`    Found ${cartIds.length} carts with settings`);

      if (cartIds.length === 0) {
        throw new Error('No game folders with settings.json found');
      }

      // Create bundle with multiple cart IDs
      const bundle = await createBundle({
        includeLabels: false,
        includeOwnership: false,
        includeSettings: true,
        includeGamePaks: false,
        cartIds: cartIds.slice(0, 3), // Test with up to 3 carts
      });

      const parsed = await parseBundle(bundle);

      assertEqual(
        parsed.manifest.contents.settingsCount,
        parsed.settings.size,
        'Manifest settingsCount should match actual settings'
      );
    }),

    test('bundle should include settings files in correct path', async () => {
      if (!existsSync(TEST_GAMES_DIR)) {
        throw new Error(`Games directory doesn't exist: ${TEST_GAMES_DIR}`);
      }

      const folders = await readdir(TEST_GAMES_DIR);
      let testCartId: string | null = null;

      for (const folder of folders) {
        const match = folder.match(/([0-9a-fA-F]{8})$/);
        if (match) {
          const settingsPath = path.join(TEST_GAMES_DIR, folder, 'settings.json');
          if (existsSync(settingsPath)) {
            testCartId = match[1].toLowerCase();
            break;
          }
        }
      }

      if (!testCartId) {
        throw new Error('No game folder with settings.json found');
      }

      const bundle = await createBundle({
        includeLabels: false,
        includeOwnership: false,
        includeSettings: true,
        includeGamePaks: false,
        cartIds: [testCartId],
      });

      // Use AdmZip to inspect raw contents
      const zip = new AdmZip(bundle);
      const entries = zip.getEntries();
      const entryNames = entries.map(e => e.entryName);

      console.log(`    Zip entries: ${entryNames.join(', ')}`);

      const expectedPath = `settings/${testCartId}/settings.json`;
      assert(
        entryNames.includes(expectedPath),
        `Bundle should contain ${expectedPath}, found: ${entryNames.join(', ')}`
      );
    }),
  ] : [
    // Skip tests in CI - these require local game data
    test('skipped: no local game data (CI environment)', async () => {
      console.log('    Bundle archive tests require local game data in .local/Library/N64/Games');
      console.log('    These tests are skipped in CI and run only in development');
    }),
  ],
};
