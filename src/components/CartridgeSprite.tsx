import { useState, useEffect } from 'react';
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
  /** Optional className for additional styling */
  className?: string;
}

const PLACEHOLDER_URL = '/cart-placeholder.png';

export function CartridgeSprite({
  artworkUrl,
  alt = 'Cartridge artwork',
  color = 'dark',
  size = 'large',
  className = '',
}: CartridgeSpriteProps) {
  const [imgSrc, setImgSrc] = useState(artworkUrl);
  const overlayImage = color === 'black' ? '/n64-cart-black.png' : '/n64-cart-dark.png';

  // Update imgSrc when artworkUrl prop changes
  useEffect(() => {
    setImgSrc(artworkUrl);
  }, [artworkUrl]);

  const handleError = () => {
    if (imgSrc !== PLACEHOLDER_URL) {
      setImgSrc(PLACEHOLDER_URL);
    }
  };

  return (
    <div className={`cartridge-sprite cartridge-sprite--${size} ${className}`}>
      <img
        className="cartridge-sprite__artwork"
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
