import { CartridgeSprite } from './CartridgeSprite';
import './CartridgeCard.css';

interface CartridgeCardProps {
  cartId: string;
  name?: string;
  index: number;
  selectionMode: boolean;
  isSelected: boolean;
  imageCacheBuster?: number;
  onClick: () => void;
}

export function CartridgeCard({
  cartId,
  name,
  index,
  selectionMode,
  isSelected,
  imageCacheBuster,
  onClick,
}: CartridgeCardProps) {
  const imageUrl = `/api/labels/${cartId}${imageCacheBuster ? `?v=${imageCacheBuster}` : ''}`;

  return (
    <div
      className={`cartridge-card ${name ? 'has-name' : ''} ${selectionMode ? 'selectable' : ''} ${isSelected ? 'selected' : ''}`}
      style={{ '--tile-index': index } as React.CSSProperties}
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
          {name || 'Title Unknown'}
        </span>
        <span className="cartridge-card-id text-pixel">{cartId}</span>
      </div>
    </div>
  );
}
