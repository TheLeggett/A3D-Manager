import { CartridgeSprite } from './CartridgeSprite';
import './CartridgeCard.css';

interface CartridgeCardProps {
  cartId: string;
  name?: string;
  color: string;
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
  color,
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
          color={ color }
          size="large"
          className="cart-sprite-base"
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
