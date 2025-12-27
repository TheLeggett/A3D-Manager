/**
 * SD Card Configuration Tests
 *
 * Tests for SD card detection and volume path configuration.
 */

import { test, assertEqual, TestSuite } from '../utils.js';
import { getVolumesPath } from '../../server/lib/sd-card.js';

export const sdCardSuite: TestSuite = {
  name: 'SD Card Configuration',
  tests: [
    // =========================================================================
    // Volumes Path Configuration
    // =========================================================================

    test('getVolumesPath returns default /Volumes/ANALOGUE 3D when env var not set', () => {
      const original = process.env.SD_VOLUMES_PATH;
      delete process.env.SD_VOLUMES_PATH;

      try {
        assertEqual(getVolumesPath(), '/Volumes/ANALOGUE 3D');
      } finally {
        // Restore original value
        if (original !== undefined) {
          process.env.SD_VOLUMES_PATH = original;
        }
      }
    }),

    test('getVolumesPath returns custom path from SD_VOLUMES_PATH env var', () => {
      const original = process.env.SD_VOLUMES_PATH;
      process.env.SD_VOLUMES_PATH = '/media';

      try {
        assertEqual(getVolumesPath(), '/media');
      } finally {
        // Restore original value
        if (original !== undefined) {
          process.env.SD_VOLUMES_PATH = original;
        } else {
          delete process.env.SD_VOLUMES_PATH;
        }
      }
    }),

    test('getVolumesPath supports specific SD card path', () => {
      const original = process.env.SD_VOLUMES_PATH;
      process.env.SD_VOLUMES_PATH = '/Volumes/ANALOGUE3D';

      try {
        assertEqual(getVolumesPath(), '/Volumes/ANALOGUE3D');
      } finally {
        // Restore original value
        if (original !== undefined) {
          process.env.SD_VOLUMES_PATH = original;
        } else {
          delete process.env.SD_VOLUMES_PATH;
        }
      }
    }),

    test('getVolumesPath supports Linux media paths', () => {
      const original = process.env.SD_VOLUMES_PATH;
      process.env.SD_VOLUMES_PATH = '/run/media/user';

      try {
        assertEqual(getVolumesPath(), '/run/media/user');
      } finally {
        // Restore original value
        if (original !== undefined) {
          process.env.SD_VOLUMES_PATH = original;
        } else {
          delete process.env.SD_VOLUMES_PATH;
        }
      }
    }),
  ],
};
