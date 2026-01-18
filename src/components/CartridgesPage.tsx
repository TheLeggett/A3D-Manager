import { useState } from 'react';
import { useSDCard } from '../App';
import { LabelsBrowser } from './LabelsBrowser';
import { CartridgeDetailPanel } from './CartridgeDetailPanel';
import { trackCartridgeOpened } from '../lib/analytics';

export function CartridgesPage() {
  const { selectedSDCard } = useSDCard();
  const [selectedCartridge, setSelectedCartridge] = useState<{ cartId: string; name?: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      <LabelsBrowser
        sdCardPath={selectedSDCard?.path}
        onSelectLabel={(cartId, name) => {
          trackCartridgeOpened(cartId, !!name);
          setSelectedCartridge({ cartId, name });
        }}
        refreshKey={refreshKey}
      />
      {selectedCartridge && (
        <CartridgeDetailPanel
          key={selectedCartridge.cartId}
          cartId={selectedCartridge.cartId}
          gameName={selectedCartridge.name}
          sdCardPath={selectedSDCard?.path}
          onClose={() => setSelectedCartridge(null)}
          onUpdate={() => {
            setRefreshKey(k => k + 1);
          }}
          onDelete={() => {
            setRefreshKey(k => k + 1);
            setSelectedCartridge(null);
          }}
        />
      )}
    </>
  );
}
