import { useState } from 'react';
import { useSDCard } from '../App';
import { LabelsBrowser } from './LabelsBrowser';
import { CartridgeDetailPanel } from './CartridgeDetailPanel';
import './CartridgesPage.css';

export function CartridgesPage() {
  const { selectedSDCard } = useSDCard();
  const [selectedCartridge, setSelectedCartridge] = useState<{ cartId: string; name?: string } | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <>
      {notification && <div className="notification">{notification}</div>}
      <LabelsBrowser
        sdCardPath={selectedSDCard?.path}
        onSelectLabel={(cartId, name) => setSelectedCartridge({ cartId, name })}
        refreshKey={refreshKey}
      />
      {selectedCartridge && (
        <CartridgeDetailPanel
          cartId={selectedCartridge.cartId}
          gameName={selectedCartridge.name}
          sdCardPath={selectedSDCard?.path}
          onClose={() => setSelectedCartridge(null)}
          onUpdate={() => {
            showNotification('Updated successfully!');
            setRefreshKey(k => k + 1);
          }}
          onDelete={() => {
            showNotification('Cartridge deleted');
            setRefreshKey(k => k + 1);
            setSelectedCartridge(null);
          }}
        />
      )}
    </>
  );
}
