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

export function CartridgeSprite({
  artworkUrl,
  alt = 'Cartridge artwork',
  color = 'dark',
  size = 'large',
  className = '',
}: CartridgeSpriteProps) {
  const overlayImage = color === 'black' ? '/n64-cart-black.png' : '/n64-cart-dark.png';

  return (
    <div className={`cartridge-sprite cartridge-sprite--${size} ${className}`}>
      <img
        className="cartridge-sprite__artwork"
        src={artworkUrl}
        alt={alt}
        loading="lazy"
      />
      <img
        className="cartridge-sprite__overlay"
        src={overlayImage}
        alt=""
      />
    </div>
  );
}
