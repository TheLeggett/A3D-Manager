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
  /** Whether we're in a secure context (HTTPS or localhost) */
  isSecureContext: boolean;
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
 * Check if the browser is Brave
 * Brave exposes navigator.brave which has an isBrave() method
 */
async function isBraveBrowser(): Promise<boolean> {
  try {
    // @ts-expect-error - navigator.brave is Brave-specific
    if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
      // @ts-expect-error - navigator.brave is Brave-specific
      return await navigator.brave.isBrave();
    }
  } catch {
    // Not Brave or error checking
  }
  return false;
}

/**
 * Synchronous check for Brave (for initial detection)
 * Less reliable than async version but works for immediate checks
 */
function isBraveBrowserSync(): boolean {
  // @ts-expect-error - navigator.brave is Brave-specific
  return !!(navigator.brave && typeof navigator.brave.isBrave === 'function');
}

/**
 * Parse user agent to get browser name and version
 */
function parseUserAgent(): { name: string; version: string } {
  const ua = navigator.userAgent;

  // Check for Brave first using its API (Brave doesn't identify itself in UA)
  if (isBraveBrowserSync()) {
    const match = ua.match(/Chrome\/(\d+[\d.]*)/);
    return { name: 'Brave', version: match?.[1] || 'unknown' };
  }

  // Check specific browsers in order of specificity
  if (ua.includes('Arc/')) {
    const match = ua.match(/Arc\/(\d+[\d.]*)/);
    return { name: 'Arc', version: match?.[1] || 'unknown' };
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

// Export for use in async contexts
export { isBraveBrowser };

/**
 * Check if the browser is Chromium-based
 */
export function isChromiumBased(): boolean {
  const ua = navigator.userAgent;

  // Check for Brave first (Brave is Chromium-based)
  if (isBraveBrowserSync()) {
    return true;
  }

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
 * Check if we're in a secure context (HTTPS or localhost)
 * File System Access API only works in secure contexts
 */
export function isSecureContext(): boolean {
  // Use the built-in isSecureContext property (available in all modern browsers)
  if (typeof window.isSecureContext === 'boolean') {
    return window.isSecureContext;
  }

  // Fallback: check protocol manually
  const loc = window.location;
  const protocol = loc.protocol;
  const hostname = loc.hostname;

  // HTTPS is always secure
  if (protocol === 'https:') {
    return true;
  }

  // Localhost variants are considered secure
  if (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]')) {
    return true;
  }

  // file:// protocol is NOT a secure context for File System Access API
  return false;
}

/**
 * Check if File System Access API is available
 * Uses multiple detection methods for reliability across browsers
 */
export function hasFileSystemAccessAPI(): boolean {
  try {
    // First check: must be in a secure context
    // File System Access API is only available in secure contexts
    if (!isSecureContext()) {
      console.log('[BrowserCheck] Not in secure context');
      return false;
    }

    // For Chromium-based browsers in a secure context, the API should be available
    // Trust the browser detection over feature detection since some privacy features
    // can affect how 'in' operator works
    if (isChromiumBased()) {
      console.log('[BrowserCheck] Chromium detected in secure context, assuming File System Access API is available');
      return true;
    }

    // Primary check: showDirectoryPicker on window
    if ('showDirectoryPicker' in window) {
      return true;
    }

    // Secondary check: Check if the function exists on the window object
    // @ts-expect-error - showDirectoryPicker may not be in Window type in all TS versions
    if (typeof window.showDirectoryPicker === 'function') {
      return true;
    }

    // Tertiary check: Check for FileSystemDirectoryHandle
    if ('FileSystemDirectoryHandle' in window) {
      return true;
    }

    console.log('[BrowserCheck] File System Access API not detected');
    return false;
  } catch (err) {
    console.error('[BrowserCheck] Error checking File System Access API:', err);
    return false;
  }
}

/**
 * Check if browser would support File System Access API in a secure context
 * Used to determine if the issue is the browser or the context
 */
export function wouldSupportFileSystemAccessInSecureContext(): boolean {
  // Chromium-based browsers support File System Access API
  if (isChromiumBased()) {
    return true;
  }

  // Check for the presence of related APIs that would indicate support
  if ('FileSystemDirectoryHandle' in window || 'FileSystemFileHandle' in window) {
    return true;
  }

  return false;
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
  const secureContext = isSecureContext();
  const hasFileSystemAccess = hasFileSystemAccessAPI();
  const hasIndexedDB = hasIndexedDBSupport();
  const hasServiceWorker = hasServiceWorkerSupport();

  const missingFeatures: string[] = [];

  if (!hasFileSystemAccess) {
    // Check if the issue is secure context vs browser support
    if (!secureContext && wouldSupportFileSystemAccessInSecureContext()) {
      missingFeatures.push('File System Access API (requires HTTPS or localhost - please access via secure URL)');
    } else {
      missingFeatures.push('File System Access API (required for SD card access)');
    }
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
    isSecureContext: secureContext,
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
    // Check if the issue is secure context
    if (!browser.isSecureContext && browser.isChromium) {
      level = 'partial';
      message = `${browser.name} supports all required features, but you need to access this app via HTTPS or localhost for SD card sync to work. You can still browse and manage your collection.`;
      showWarning = true;
    } else if (browser.isChromium) {
      // Chromium browser but still no File System Access - might be disabled or very old version
      level = 'partial';
      message = `${browser.name} should support SD card sync, but the File System Access API is not available. This may be due to browser settings or an older version. You can still browse and manage your collection.`;
      showWarning = true;
    } else {
      level = 'partial';
      message = `${browser.name} does not support the File System Access API. You can browse and manage your collection, but you won't be able to sync with your SD card. For full functionality, please use Chrome, Edge, Brave, or Arc.`;
      showWarning = true;
    }
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
