import { useState, useEffect } from 'react';
import { PixelLoader } from './PixelLoader';
import './CartridgeSprite.css';

export type CartridgeSpriteColor = 'dark' | 'black';
export type CartridgeSpriteSize = 'large' | 'medium' | 'small';

interface CartridgeSpriteProps {
  /** The artwork image URL */
  artworkUrl: string;
  /** Alt text for the artwork */
  alt?: string;
  /** Cart shell color variant */
  color?: CartridgeSpriteColor;
  /** Size of the sprite */
  size?: CartridgeSpriteSize;
  /** Show loading placeholder instead of artwork */
  loading?: boolean;
  /** Optional className for additional styling */
  className?: string;
}

// Artwork dimensions for each size
const ARTWORK_SIZES: Record<CartridgeSpriteSize, { width: number; height: number }> = {
  large: { width: 74, height: 86 },
  medium: { width: 55, height: 64 },
  small: { width: 37, height: 43 },
};

const PLACEHOLDER_URL = '/cart-placeholder.png';

export function CartridgeSprite({
  artworkUrl,
  alt = 'Cartridge artwork',
  color = 'dark',
  size = 'large',
  loading = false,
  className = '',
}: CartridgeSpriteProps) {
  const [imgSrc, setImgSrc] = useState(artworkUrl || PLACEHOLDER_URL);
  const overlayImage = color === 'black' ? '/n64-cart-black.png' : '/n64-cart-dark.png';
  const artworkSize = ARTWORK_SIZES[size];

  // Update imgSrc when artworkUrl prop changes
  useEffect(() => {
    setImgSrc(artworkUrl || PLACEHOLDER_URL);
  }, [artworkUrl]);

  const handleError = () => {
    if (imgSrc !== PLACEHOLDER_URL) {
      setImgSrc(PLACEHOLDER_URL);
    }
  };

  return (
    <div className={`cartridge-sprite cartridge-sprite--${size} ${className}`}>
      {/* Loader - shows when loading, fades out when done */}
      <PixelLoader
        variant="scanline"
        width={artworkSize.width}
        height={artworkSize.height}
        className={`cartridge-sprite__loader ${loading ? 'visible' : ''}`}
      />
      {/* Artwork - always rendered, fades in when not loading */}
      <img
        className={`cartridge-sprite__artwork ${!loading ? 'visible' : ''}`}
        src={imgSrc}
        alt={alt}
        loading="lazy"
        onError={handleError}
      />
      <img
        className="cartridge-sprite__overlay"
        src={overlayImage}
        alt=""
      />
    </div>
  );
}
