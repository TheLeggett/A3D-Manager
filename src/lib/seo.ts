import { useEffect } from 'react';

const SITE_NAME = 'A3D Manager';
const DEFAULT_TITLE = 'A3D Manager - Analogue 3D Cartridge Label Manager';

/**
 * Custom hook to set page title for SEO
 * @param title - The page-specific title (will be appended with site name)
 * @param includeBaseName - Whether to append the site name (default: true)
 */
export function usePageTitle(title?: string, includeBaseName = true) {
  useEffect(() => {
    if (!title) {
      document.title = DEFAULT_TITLE;
    } else if (includeBaseName) {
      document.title = `${title} | ${SITE_NAME}`;
    } else {
      document.title = title;
    }

    return () => {
      // Reset to default on unmount
      document.title = DEFAULT_TITLE;
    };
  }, [title, includeBaseName]);
}

/**
 * SEO metadata for each page
 */
export const SEO_TITLES = {
  cartridges: 'Cartridges',
  settings: 'Settings',
  help: 'Help & Support',
} as const;
