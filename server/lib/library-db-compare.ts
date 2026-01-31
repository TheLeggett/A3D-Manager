/**
 * library-db-compare.ts
 *
 * Comparison utilities for local vs SD card library.db files.
 * Used to determine which version is newer and what differences exist.
 */

import {
  parseLibraryDb,
  verifyHeader,
  cartIdToHex,
  getLocalLibraryDbInfo,
  getSDLibraryDbInfo,
  readLocalLibraryDb,
  readSDLibraryDb,
} from './library-db-core';
import type { LibraryEntry } from './library-db-core';

// =============================================================================
// Types
// =============================================================================

/**
 * Status of local vs SD card library.db
 */
export interface LibrarySyncStatus {
  local: {
    exists: boolean;
    entryCount: number;
    fileSize: number;
    lastModified?: Date;
  };
  sd: {
    exists: boolean;
    entryCount: number;
    fileSize: number;
    lastModified?: Date;
  };
  newerVersion: 'local' | 'sd' | 'same' | 'unknown';
}

/**
 * Detailed comparison of two library.db files
 */
export interface LibraryComparisonResult {
  /** Entries only in the local version */
  onlyInLocal: LibraryEntry[];
  /** Entries only in the SD version */
  onlyInSD: LibraryEntry[];
  /** Entries in both with different stats */
  different: {
    cartId: number;
    cartIdHex: string;
    local: LibraryEntry;
    sd: LibraryEntry;
  }[];
  /** Entries that are identical */
  identical: LibraryEntry[];
  /** Summary of differences */
  summary: {
    totalLocal: number;
    totalSD: number;
    onlyInLocal: number;
    onlyInSD: number;
    different: number;
    identical: number;
  };
}

// =============================================================================
// Quick Comparison
// =============================================================================

/**
 * Quick comparison based on file size, entry count, and modification time.
 * Use this for initial status display before a detailed comparison.
 */
export function compareQuick(sdCardPath: string): LibrarySyncStatus {
  const localInfo = getLocalLibraryDbInfo();
  const sdInfo = getSDLibraryDbInfo(sdCardPath);

  const local = {
    exists: localInfo?.exists ?? false,
    entryCount: localInfo?.entryCount ?? 0,
    fileSize: localInfo?.fileSize ?? 0,
    lastModified: localInfo?.lastModified,
  };

  const sd = {
    exists: sdInfo?.exists ?? false,
    entryCount: sdInfo?.entryCount ?? 0,
    fileSize: sdInfo?.fileSize ?? 0,
    lastModified: sdInfo?.lastModified,
  };

  // Determine which is newer
  let newerVersion: 'local' | 'sd' | 'same' | 'unknown' = 'unknown';

  if (!local.exists && !sd.exists) {
    newerVersion = 'same';
  } else if (!local.exists && sd.exists) {
    newerVersion = 'sd';
  } else if (local.exists && !sd.exists) {
    newerVersion = 'local';
  } else if (local.lastModified && sd.lastModified) {
    // Both exist, compare modification times
    const localTime = local.lastModified.getTime();
    const sdTime = sd.lastModified.getTime();

    if (localTime > sdTime) {
      newerVersion = 'local';
    } else if (sdTime > localTime) {
      newerVersion = 'sd';
    } else if (
      local.fileSize === sd.fileSize &&
      local.entryCount === sd.entryCount
    ) {
      newerVersion = 'same';
    } else {
      // Same time but different content - need detailed comparison
      newerVersion = 'unknown';
    }
  } else {
    // Can't determine based on timestamps
    if (
      local.fileSize === sd.fileSize &&
      local.entryCount === sd.entryCount
    ) {
      newerVersion = 'same';
    }
  }

  return { local, sd, newerVersion };
}

/**
 * Compare two buffers directly (for browser use)
 */
export function compareQuickFromBuffers(
  localData: Buffer | null,
  sdData: Buffer | null,
  localLastModified?: Date,
  sdLastModified?: Date
): LibrarySyncStatus {
  const local = {
    exists: localData !== null,
    entryCount: 0,
    fileSize: localData?.length ?? 0,
    lastModified: localLastModified,
  };

  const sd = {
    exists: sdData !== null,
    entryCount: 0,
    fileSize: sdData?.length ?? 0,
    lastModified: sdLastModified,
  };

  // Try to get entry counts
  if (localData) {
    try {
      const verification = verifyHeader(localData);
      if (verification.valid) {
        const library = parseLibraryDb(localData);
        local.entryCount = library.entryCount;
      }
    } catch {
      // Ignore parsing errors
    }
  }

  if (sdData) {
    try {
      const verification = verifyHeader(sdData);
      if (verification.valid) {
        const library = parseLibraryDb(sdData);
        sd.entryCount = library.entryCount;
      }
    } catch {
      // Ignore parsing errors
    }
  }

  // Determine which is newer
  let newerVersion: 'local' | 'sd' | 'same' | 'unknown' = 'unknown';

  if (!local.exists && !sd.exists) {
    newerVersion = 'same';
  } else if (!local.exists && sd.exists) {
    newerVersion = 'sd';
  } else if (local.exists && !sd.exists) {
    newerVersion = 'local';
  } else if (local.lastModified && sd.lastModified) {
    const localTime = local.lastModified.getTime();
    const sdTime = sd.lastModified.getTime();

    if (localTime > sdTime) {
      newerVersion = 'local';
    } else if (sdTime > localTime) {
      newerVersion = 'sd';
    } else if (
      local.fileSize === sd.fileSize &&
      local.entryCount === sd.entryCount
    ) {
      newerVersion = 'same';
    } else {
      newerVersion = 'unknown';
    }
  } else {
    if (
      local.fileSize === sd.fileSize &&
      local.entryCount === sd.entryCount
    ) {
      newerVersion = 'same';
    }
  }

  return { local, sd, newerVersion };
}

// =============================================================================
// Detailed Comparison
// =============================================================================

/**
 * Detailed entry-level comparison of local vs SD library.db.
 * This reads and parses both files to find exact differences.
 */
export function compareDetailed(
  sdCardPath: string
): LibraryComparisonResult | null {
  const localData = readLocalLibraryDb();
  const sdData = readSDLibraryDb(sdCardPath);

  if (!localData && !sdData) {
    return null;
  }

  return compareDetailedFromBuffers(localData, sdData);
}

/**
 * Compare two buffers directly (for browser use)
 */
export function compareDetailedFromBuffers(
  localData: Buffer | null,
  sdData: Buffer | null
): LibraryComparisonResult | null {
  if (!localData && !sdData) {
    return null;
  }

  // Parse both libraries
  let localEntries: Map<number, LibraryEntry> = new Map();
  let sdEntries: Map<number, LibraryEntry> = new Map();

  if (localData) {
    try {
      const library = parseLibraryDb(localData);
      for (const entry of library.entries) {
        localEntries.set(entry.cartId, entry);
      }
    } catch {
      // Invalid local data
    }
  }

  if (sdData) {
    try {
      const library = parseLibraryDb(sdData);
      for (const entry of library.entries) {
        sdEntries.set(entry.cartId, entry);
      }
    } catch {
      // Invalid SD data
    }
  }

  // Find differences
  const onlyInLocal: LibraryEntry[] = [];
  const onlyInSD: LibraryEntry[] = [];
  const different: {
    cartId: number;
    cartIdHex: string;
    local: LibraryEntry;
    sd: LibraryEntry;
  }[] = [];
  const identical: LibraryEntry[] = [];

  // Check all local entries
  for (const [cartId, localEntry] of localEntries) {
    const sdEntry = sdEntries.get(cartId);

    if (!sdEntry) {
      onlyInLocal.push(localEntry);
    } else if (entriesEqual(localEntry, sdEntry)) {
      identical.push(localEntry);
    } else {
      different.push({
        cartId,
        cartIdHex: cartIdToHex(cartId),
        local: localEntry,
        sd: sdEntry,
      });
    }
  }

  // Check for entries only in SD
  for (const [cartId, sdEntry] of sdEntries) {
    if (!localEntries.has(cartId)) {
      onlyInSD.push(sdEntry);
    }
  }

  return {
    onlyInLocal,
    onlyInSD,
    different,
    identical,
    summary: {
      totalLocal: localEntries.size,
      totalSD: sdEntries.size,
      onlyInLocal: onlyInLocal.length,
      onlyInSD: onlyInSD.length,
      different: different.length,
      identical: identical.length,
    },
  };
}

/**
 * Check if two entries have identical stats
 */
function entriesEqual(a: LibraryEntry, b: LibraryEntry): boolean {
  return (
    a.cartId === b.cartId &&
    a.addedTime === b.addedTime &&
    a.playTime === b.playTime &&
    a.sessions === b.sessions
  );
}
