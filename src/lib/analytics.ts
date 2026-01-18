/**
 * Google Analytics Event Tracking
 *
 * Provides type-safe event tracking for user interactions.
 * Uses GA4 gtag() function.
 */

// Extend Window interface for gtag
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Track a custom event in Google Analytics
 */
export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>
): void {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, params);
  }
}

// ============================================================================
// SD Card Events
// ============================================================================

export function trackSDCardConnected(method: 'analogue-3d' | 'sd-reader'): void {
  trackEvent('sd_card_connected', {
    connection_method: method,
  });
}

export function trackSDCardDisconnected(): void {
  trackEvent('sd_card_disconnected');
}

// ============================================================================
// Label Events
// ============================================================================

export function trackLabelUploaded(cartId: string): void {
  trackEvent('label_uploaded', {
    cart_id: cartId,
  });
}

export function trackLabelDeleted(cartId: string): void {
  trackEvent('label_deleted', {
    cart_id: cartId,
  });
}

export function trackLabelsImported(count: number, source: 'file' | 'sd-card'): void {
  trackEvent('labels_imported', {
    count,
    source,
  });
}

export function trackLabelsSynced(count: number): void {
  trackEvent('labels_synced', {
    count,
  });
}

// ============================================================================
// Settings Events
// ============================================================================

export function trackSettingsChanged(cartId: string, settingType: string): void {
  trackEvent('settings_changed', {
    cart_id: cartId,
    setting_type: settingType,
  });
}

export function trackSettingsCopied(cartId: string): void {
  trackEvent('settings_copied', {
    cart_id: cartId,
  });
}

export function trackSettingsPasted(targetCount: number): void {
  trackEvent('settings_pasted', {
    target_count: targetCount,
  });
}

// ============================================================================
// Export/Import Events
// ============================================================================

export function trackBundleExported(includeLabels: boolean, includeSettings: boolean, includeSaves: boolean): void {
  trackEvent('bundle_exported', {
    include_labels: includeLabels,
    include_settings: includeSettings,
    include_saves: includeSaves,
  });
}

export function trackBundleImported(): void {
  trackEvent('bundle_imported');
}

// ============================================================================
// Navigation & Filter Events
// ============================================================================

export function trackPageView(pageName: string): void {
  trackEvent('page_view', {
    page_name: pageName,
  });
}

export function trackFilterUsed(filterType: string, value: string): void {
  trackEvent('filter_used', {
    filter_type: filterType,
    filter_value: value,
  });
}

export function trackSearch(query: string): void {
  trackEvent('search', {
    search_term: query,
  });
}

// ============================================================================
// Cartridge Events
// ============================================================================

export function trackCartridgeOpened(cartId: string, hasLabel: boolean): void {
  trackEvent('cartridge_opened', {
    cart_id: cartId,
    has_label: hasLabel,
  });
}

export function trackCartridgeMarkedOwned(cartId: string, owned: boolean): void {
  trackEvent('cartridge_ownership_changed', {
    cart_id: cartId,
    owned,
  });
}

// ============================================================================
// Onboarding Events
// ============================================================================

export function trackOnboardingStarted(): void {
  trackEvent('onboarding_started');
}

export function trackOnboardingCompleted(method: 'analogue-3d' | 'sd-reader' | 'offline'): void {
  trackEvent('onboarding_completed', {
    connection_method: method,
  });
}

export function trackDataSafetyAcknowledged(): void {
  trackEvent('data_safety_acknowledged');
}

// ============================================================================
// PWA Events
// ============================================================================

export function trackPWAInstallPromptShown(): void {
  trackEvent('pwa_install_prompt_shown');
}

export function trackPWAInstalled(): void {
  trackEvent('pwa_installed');
}

export function trackPWAInstallDismissed(): void {
  trackEvent('pwa_install_dismissed');
}
