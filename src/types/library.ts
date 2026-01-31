/**
 * library.ts
 *
 * TypeScript interfaces for library.db data structures.
 */

/**
 * Represents a single entry in the library database
 */
export interface LibraryEntry {
  /** Cart ID (unique identifier from cart header) */
  cartId: number;
  /** Cart ID as 8-character hex string */
  cartIdHex: string;
  /** Index in the library (0-4095) */
  index: number;
  /** Time added (seconds since custom epoch) */
  addedTime: number;
  /** Total play time in seconds */
  playTime: number;
  /** Number of play sessions */
  sessions: number;
}

/**
 * Entry with additional formatted/enriched fields
 */
export interface EnrichedLibraryEntry extends LibraryEntry {
  /** Game name from lookup */
  name?: string;
  /** Converted addedTime to ISO string */
  addedDate?: string;
  /** Formatted play time (e.g., "5h 21m") */
  playTimeFormatted?: string;
}

/**
 * Represents the parsed library database
 */
export interface LibraryDatabase {
  /** Number of valid entries */
  entryCount: number;
  /** All valid entries */
  entries: LibraryEntry[];
  /** Map from cart ID to index for fast lookup */
  idToIndex: Map<number, number>;
}

/**
 * Status of local vs SD card library.db
 */
export interface LibrarySyncStatus {
  local: {
    exists: boolean;
    entryCount: number;
    fileSize: number;
    fileSizeFormatted?: string;
    lastModified?: string;
  };
  sd: {
    exists: boolean;
    entryCount: number;
    fileSize: number;
    fileSizeFormatted?: string;
    lastModified?: string;
  };
  newerVersion: 'local' | 'sd' | 'same' | 'unknown';
}

/**
 * Response from the /api/library/status endpoint
 */
export interface LibraryStatusResponse {
  exists: boolean;
  entryCount: number;
  fileSize: number;
  lastModified?: string;
}

/**
 * Response from the /api/library/entries endpoint
 */
export interface LibraryEntriesResponse {
  exists: boolean;
  entries: EnrichedLibraryEntry[];
  entryCount: number;
}

/**
 * Response from the /api/library/entry/:cartId endpoint
 */
export interface LibraryEntryResponse {
  exists: boolean;
  entry: EnrichedLibraryEntry | null;
}

/**
 * Request body for PUT /api/library/entry/:cartId
 */
export interface LibraryEntryUpdateRequest {
  addedTime?: number;
  addedDate?: string;
  playTime?: number;
  sessions?: number;
}

/**
 * Progress event from SSE sync streams
 */
export interface LibrarySyncProgress {
  type: 'start' | 'progress' | 'complete' | 'error';
  direction?: 'upload' | 'download';
  entryCount?: number;
  totalBytes?: number;
  bytesWritten?: number;
  percentage?: number;
  speed?: string;
  eta?: string;
  bytesWrittenFormatted?: string;
  totalBytesFormatted?: string;
  success?: boolean;
  fileSize?: number;
  error?: string;
}

/**
 * Library stats for a single cartridge (used in UI)
 */
export interface CartridgeLibraryStats {
  hasStats: boolean;
  addedTime?: number;
  addedDate?: Date;
  playTime?: number;
  playTimeFormatted?: string;
  sessions?: number;
}
