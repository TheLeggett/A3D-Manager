import { useState } from 'react';
import { OptionSelector, ToggleSwitch } from './controls';
import { CartridgeSprite } from './CartridgeSprite';
import type { CartridgeSpriteColor, CartridgeSpriteSize } from './CartridgeSprite';
import './ComponentTestPage.css';

export function ComponentTestPage() {
  // Option Selector states
  const [displayMode, setDisplayMode] = useState('BVM');
  const [colorProfile, setColorProfile] = useState('Professional');
  const [colorMode, setColorMode] = useState('Professional');
  const [bitColor, setBitColor] = useState('Auto');

  // Toggle states
  const [deBlur, setDeBlur] = useState(true);
  const [disableTextureFiltering, setDisableTextureFiltering] = useState(false);
  const [disableAntialiasing, setDisableAntialiasing] = useState(false);

  const displayModeOptions = ['CRT', 'BVM', 'LCD', 'OLED'];
  const colorProfileOptions = ['Standard', 'Professional', 'Vivid', 'Natural'];
  const bitColorOptions = ['Off', 'Auto', 'On'];

  const typographySamples = [
    { class: 'text-page-title', sample: 'Cartridges' },
    { class: 'text-section-header', sample: 'Display Settings' },
    { class: 'text-subsection-header', sample: 'Video Output' },
    { class: 'text-body', sample: 'The quick brown fox jumps over the lazy dog.' },
    { class: 'text-body-small', sample: 'The quick brown fox jumps over the lazy dog.' },
    { class: 'text-label', sample: 'Cart ID' },
    { class: 'text-pixel', sample: 'N64-ZELDA' },
    { class: 'text-pixel-small', sample: 'N64-ZELDA' },
    { class: 'text-pixel-large', sample: 'N64-ZELDA' },
    { class: 'text-mono', sample: 'const value = 0x1234ABCD;' },
    { class: 'text-mono-small', sample: 'const value = 0x1234ABCD;' },
    { class: 'text-caption', sample: 'Last modified: Dec 24, 2025' },
  ];

  const colorModifiers = [
    { class: 'text-muted', label: 'Muted' },
    { class: 'text-subtle', label: 'Subtle' },
    { class: 'text-accent', label: 'Accent' },
    { class: 'text-success', label: 'Success' },
    { class: 'text-warning', label: 'Warning' },
    { class: 'text-error', label: 'Error' },
  ];

  return (
    <div className="component-test-page">
      <div className="page-header">
        <h2 className="text-page-title">Component Test</h2>
      </div>

      {/* Typography Section */}
      <section className="test-section">
        <h2 className="test-section-header text-section-header">Typography Styles</h2>

        <div className="typography-samples">
          {typographySamples.map(({ class: className, sample }) => (
            <div key={className} className="typography-sample">
              <code className="typography-sample-label text-mono-small text-muted">.{className}</code>
              <span className={`typography-sample-preview ${className}`}>{sample}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Color Modifiers Section */}
      <section className="test-section">
        <h2 className="test-section-header text-section-header">Color Modifiers</h2>

        <div className="color-swatches">
          {colorModifiers.map(({ class: className, label }) => (
            <div key={className} className="color-swatch">
              <span className={`text-body ${className}`}>{label}</span>
              <code className="text-mono-small text-muted">.{className}</code>
            </div>
          ))}
        </div>
      </section>

      {/* Cartridge Sprite Section */}
      <section className="test-section">
        <h2 className="test-section-header text-section-header">Cartridge Sprites</h2>

        <div className="sprite-grid">
          {(['dark', 'black'] as CartridgeSpriteColor[]).map((color) => (
            <div key={color} className={`sprite-column sprite-column--${color}`}>
              <h3 className="text-label">{color}</h3>
              <div className="sprite-sizes">
                {(['large', 'medium', 'small'] as CartridgeSpriteSize[]).map((size) => (
                  <div key={size} className="sprite-item">
                    <CartridgeSprite
                      artworkUrl="/cart-placeholder.png"
                      color={color}
                      size={size}
                    />
                    <code className="text-mono-small text-muted">{size}</code>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Display Settings Section */}
      <section className="test-section settings-section">
        <h2 className="test-section-header text-section-header">Option Selectors</h2>

        <OptionSelector
          label="Display Mode"
          options={displayModeOptions}
          value={displayMode}
          onChange={setDisplayMode}
        />

        <OptionSelector
          label="Color Profile"
          options={colorProfileOptions}
          value={colorProfile}
          onChange={setColorProfile}
        />

        <OptionSelector
          label="Color Mode"
          options={colorProfileOptions}
          value={colorMode}
          onChange={setColorMode}
        />
      </section>

      {/* Advanced Video Processing Section */}
      <section className="test-section settings-section">
        <h2 className="test-section-header text-section-header">Toggle Switches</h2>

        <ToggleSwitch
          label="De-Blur"
          checked={deBlur}
          onChange={setDeBlur}
        />

        <OptionSelector
          label="32bit Color"
          options={bitColorOptions}
          value={bitColor}
          onChange={setBitColor}
        />

        <ToggleSwitch
          label="Disable Texture Filtering"
          checked={disableTextureFiltering}
          onChange={setDisableTextureFiltering}
        />

        <ToggleSwitch
          label="Disable Antialiasing"
          checked={disableAntialiasing}
          onChange={setDisableAntialiasing}
        />
      </section>

      {/* Current State Debug */}
      <section className="test-section debug-section">
        <h2 className="test-section-header text-section-header">Current State</h2>
        <pre className="debug-output">
{JSON.stringify({
  displayMode,
  colorProfile,
  colorMode,
  bitColor,
  deBlur,
  disableTextureFiltering,
  disableAntialiasing,
}, null, 2)}
        </pre>
      </section>
    </div>
  );
}
