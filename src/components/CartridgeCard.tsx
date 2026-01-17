import { useState, useEffect } from 'react';
import { CartridgeSprite } from './CartridgeSprite';
import './CartridgeCard.css';

interface CartridgeCardProps {
  cartId: string;
  name?: string;
  gridIndex: number;
  hasLabel: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  imageCacheBuster?: number;
  imageUrl?: string; // Optional override for static mode
  isStaticMode?: boolean; // Whether we're in browser-only mode
  onClick: () => void;
}

export function CartridgeCard({
  cartId,
  name,
  gridIndex,
  hasLabel,
  selectionMode,
  isSelected,
  imageCacheBuster,
  imageUrl: imageUrlProp,
  isStaticMode: isStaticModeProp,
  onClick,
}: CartridgeCardProps) {
  // Track whether the image has loaded (for fade-in effect)
  const [imageLoaded, setImageLoaded] = useState(false);

  // Determine the image URL to use
  // In static mode: use provided URL or placeholder (never API)
  // In server mode: use API URL
  let imageUrl: string;
  if (isStaticModeProp) {
    // Static mode: use blob URL if provided, otherwise placeholder
    imageUrl = imageUrlProp || '/cart-placeholder.png';
  } else if (imageUrlProp) {
    // Server mode with override
    imageUrl = imageUrlProp;
  } else {
    // Server mode: use API URL
    imageUrl = hasLabel
      ? `/api/labels/${cartId}${imageCacheBuster ? `?v=${imageCacheBuster}` : ''}`
      : '/cart-placeholder.png';
  }

  // Reset loaded state when image URL changes
  useEffect(() => {
    if (imageUrlProp) {
      setImageLoaded(false);
      // Preload image to detect when it's ready
      const img = new Image();
      img.onload = () => setImageLoaded(true);
      img.src = imageUrlProp;
    }
  }, [imageUrlProp]);

  // Show loading state when:
  // 1. In static mode and waiting for blob URL (hasLabel but no imageUrlProp)
  // 2. In static mode and blob URL provided but image not yet loaded
  const showLoading = isStaticModeProp && hasLabel && (!imageUrlProp || !imageLoaded);

  return (
    <div
      className={`cartridge-card ${name ? 'has-name' : ''} ${selectionMode ? 'selectable' : ''} ${isSelected ? 'selected' : ''}`}
      style={{ '--tile-index': gridIndex } as React.CSSProperties}
      onClick={onClick}
    >
      {selectionMode && <div className="selection-checkbox" />}
      <div className="cart-sprite-wrapper">
        <CartridgeSprite
          artworkUrl={imageUrl}
          alt={name || cartId}
          color="dark"
          size="large"
          loading={showLoading}
          className="cart-sprite-base"
        />
        <CartridgeSprite
          artworkUrl={imageUrl}
          alt={name || cartId}
          color="black"
          size="large"
          loading={showLoading}
          className="cart-sprite-hover"
        />
      </div>
      <div className="cartridge-card-info">
        <span className={`cartridge-card-name ${!name ? 'unknown' : ''}`}>
          {name || 'Unknown Cartridge'}
        </span>
        <span className="cartridge-card-id text-pixel">{cartId}</span>
      </div>
    </div>
  );
}
