/**
 * Browser Compatibility Check Service
 *
 * Detects browser capabilities and provides compatibility information.
 * Used to show users whether their browser supports all features.
 */

// =============================================================================
// Types
// =============================================================================

export interface BrowserInfo {
  /** Browser name */
  name: string;
  /** Browser version */
  version: string;
  /** Whether this is a Chromium-based browser */
  isChromium: boolean;
  /** Whether File System Access API is supported */
  hasFileSystemAccess: boolean;
  /** Whether IndexedDB is supported */
  hasIndexedDB: boolean;
  /** Whether service workers are supported (for PWA) */
  hasServiceWorker: boolean;
  /** Whether the browser fully supports the app */
  isFullySupported: boolean;
  /** List of missing features */
  missingFeatures: string[];
}

export type SupportLevel = 'full' | 'partial' | 'unsupported';

export interface CompatibilityResult {
  /** Overall support level */
  level: SupportLevel;
  /** Browser information */
  browser: BrowserInfo;
  /** Human-readable message about compatibility */
  message: string;
  /** Whether to show the compatibility warning */
  showWarning: boolean;
}

// =============================================================================
// Browser Detection
// =============================================================================

/**
 * Parse user agent to get browser name and version
 */
function parseUserAgent(): { name: string; version: string } {
  const ua = navigator.userAgent;

  // Check specific browsers in order of specificity
  if (ua.includes('Arc/')) {
    const match = ua.match(/Arc\/(\d+[\d.]*)/);
    return { name: 'Arc', version: match?.[1] || 'unknown' };
  }

  if (ua.includes('Brave/')) {
    // Brave doesn't always identify itself in UA
    // Check for Brave-specific feature
    const match = ua.match(/Chrome\/(\d+[\d.]*)/);
    return { name: 'Brave', version: match?.[1] || 'unknown' };
  }

  if (ua.includes('Edg/')) {
    const match = ua.match(/Edg\/(\d+[\d.]*)/);
    return { name: 'Edge', version: match?.[1] || 'unknown' };
  }

  if (ua.includes('OPR/') || ua.includes('Opera/')) {
    const match = ua.match(/(?:OPR|Opera)\/(\d+[\d.]*)/);
    return { name: 'Opera', version: match?.[1] || 'unknown' };
  }

  if (ua.includes('Chrome/')) {
    const match = ua.match(/Chrome\/(\d+[\d.]*)/);
    return { name: 'Chrome', version: match?.[1] || 'unknown' };
  }

  if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    const match = ua.match(/Version\/(\d+[\d.]*)/);
    return { name: 'Safari', version: match?.[1] || 'unknown' };
  }

  if (ua.includes('Firefox/')) {
    const match = ua.match(/Firefox\/(\d+[\d.]*)/);
    return { name: 'Firefox', version: match?.[1] || 'unknown' };
  }

  return { name: 'Unknown', version: 'unknown' };
}

/**
 * Check if the browser is Chromium-based
 */
export function isChromiumBased(): boolean {
  const ua = navigator.userAgent;

  // Check for Chromium signature in user agent
  if (ua.includes('Chrome/') || ua.includes('Chromium/')) {
    // Exclude Safari which sometimes has Chrome in UA
    if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
      return false;
    }
    return true;
  }

  // Additional check via feature detection
  // @ts-expect-error - chrome is not in standard Window type
  if (window.chrome !== undefined) {
    return true;
  }

  return false;
}

/**
 * Check if File System Access API is available
 */
export function hasFileSystemAccessAPI(): boolean {
  return (
    'showDirectoryPicker' in window &&
    typeof window.showDirectoryPicker === 'function'
  );
}

/**
 * Check if IndexedDB is available
 */
export function hasIndexedDBSupport(): boolean {
  return 'indexedDB' in window && window.indexedDB !== null;
}

/**
 * Check if service workers are available
 */
export function hasServiceWorkerSupport(): boolean {
  return 'serviceWorker' in navigator;
}

// =============================================================================
// Main API
// =============================================================================

/**
 * Get complete browser information
 */
export function getBrowserInfo(): BrowserInfo {
  const { name, version } = parseUserAgent();
  const isChromium = isChromiumBased();
  const hasFileSystemAccess = hasFileSystemAccessAPI();
  const hasIndexedDB = hasIndexedDBSupport();
  const hasServiceWorker = hasServiceWorkerSupport();

  const missingFeatures: string[] = [];

  if (!hasFileSystemAccess) {
    missingFeatures.push('File System Access API (required for SD card access)');
  }

  if (!hasIndexedDB) {
    missingFeatures.push('IndexedDB (required for data storage)');
  }

  if (!hasServiceWorker) {
    missingFeatures.push('Service Workers (required for offline support)');
  }

  // Full support requires File System Access and IndexedDB
  // Service workers are nice to have but not critical
  const isFullySupported = hasFileSystemAccess && hasIndexedDB;

  return {
    name,
    version,
    isChromium,
    hasFileSystemAccess,
    hasIndexedDB,
    hasServiceWorker,
    isFullySupported,
    missingFeatures,
  };
}

/**
 * Check browser compatibility and return result
 */
export function checkBrowserCompatibility(): CompatibilityResult {
  const browser = getBrowserInfo();

  // Determine support level
  let level: SupportLevel;
  let message: string;
  let showWarning: boolean;

  if (browser.isFullySupported) {
    level = 'full';
    message = `${browser.name} ${browser.version} is fully supported.`;
    showWarning = false;
  } else if (browser.hasIndexedDB && !browser.hasFileSystemAccess) {
    level = 'partial';
    message = `${browser.name} does not support the File System Access API. You can browse and manage your collection, but you won't be able to sync with your SD card. For full functionality, please use Chrome, Edge, Brave, or Arc.`;
    showWarning = true;
  } else {
    level = 'unsupported';
    message = `${browser.name} is not supported. Please use Chrome, Edge, Brave, or Arc for the best experience.`;
    showWarning = true;
  }

  return {
    level,
    browser,
    message,
    showWarning,
  };
}

/**
 * Get a short description of the browser's support status
 */
export function getSupportStatusText(level: SupportLevel): string {
  switch (level) {
    case 'full':
      return 'Fully supported';
    case 'partial':
      return 'Limited support (no SD card access)';
    case 'unsupported':
      return 'Not supported';
  }
}

/**
 * Get recommended browsers list
 */
export function getRecommendedBrowsers(): Array<{ name: string; url: string; icon: string }> {
  return [
    {
      name: 'Google Chrome',
      url: 'https://www.google.com/chrome/',
      icon: 'chrome',
    },
    {
      name: 'Microsoft Edge',
      url: 'https://www.microsoft.com/edge',
      icon: 'edge',
    },
    {
      name: 'Brave',
      url: 'https://brave.com/',
      icon: 'brave',
    },
    {
      name: 'Arc',
      url: 'https://arc.net/',
      icon: 'arc',
    },
  ];
}

// =============================================================================
// LocalStorage for "Don't show again" preference
// =============================================================================

const COMPATIBILITY_DISMISSED_KEY = 'a3d-compatibility-dismissed';

/**
 * Check if user has dismissed the compatibility warning
 */
export function isCompatibilityWarningDismissed(): boolean {
  try {
    return localStorage.getItem(COMPATIBILITY_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Dismiss the compatibility warning (don't show again)
 */
export function dismissCompatibilityWarning(): void {
  try {
    localStorage.setItem(COMPATIBILITY_DISMISSED_KEY, 'true');
  } catch {
    // localStorage not available
  }
}

/**
 * Reset the compatibility warning (show again)
 */
export function resetCompatibilityWarning(): void {
  try {
    localStorage.removeItem(COMPATIBILITY_DISMISSED_KEY);
  } catch {
    // localStorage not available
  }
}
