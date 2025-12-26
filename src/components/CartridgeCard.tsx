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
  onClick,
}: CartridgeCardProps) {
  const imageUrl = hasLabel
    ? `/api/labels/${cartId}${imageCacheBuster ? `?v=${imageCacheBuster}` : ''}`
    : '/cart-placeholder.png';

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
          className="cart-sprite-base"
        />
        <CartridgeSprite
          artworkUrl={imageUrl}
          alt={name || cartId}
          color="black"
          size="large"
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
