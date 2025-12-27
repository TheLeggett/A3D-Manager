import { useState, useEffect, useRef } from 'react';
import { OptionSelector, ToggleSwitch } from './controls';
import { CartridgeSprite } from './CartridgeSprite';
import type { CartridgeSpriteColor, CartridgeSpriteSize } from './CartridgeSprite';
import { ProgressBar } from './ProgressBar';
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

  // Simulated upload state
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadBytes, setUploadBytes] = useState(0);
  const uploadIntervalRef = useRef<number | null>(null);
  const totalBytes = 22 * 1024 * 1024; // 22 MB

  useEffect(() => {
    // Simulate file upload progress
    uploadIntervalRef.current = window.setInterval(() => {
      setUploadBytes((prev) => {
        const speed = 500000 + Math.random() * 300000; // 500-800 KB/s
        const newBytes = Math.min(prev + speed / 10, totalBytes);
        setUploadProgress(Math.round((newBytes / totalBytes) * 100));
        // Reset when complete
        if (newBytes >= totalBytes) {
          return 0;
        }
        return newBytes;
      });
    }, 100);

    return () => {
      if (uploadIntervalRef.current) {
        clearInterval(uploadIntervalRef.current);
      }
    };
  }, [totalBytes]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getUploadSpeed = () => {
    // eslint-disable-next-line react-hooks/purity
    const baseSpeed = 500 + Math.random() * 300;
    return `${baseSpeed.toFixed(1)} KB/s`;
  };

  const getEta = () => {
    const remaining = totalBytes - uploadBytes;
    const speed = 600 * 1024; // ~600 KB/s average
    const seconds = remaining / speed;
    return `${seconds.toFixed(1)}s`;
  };

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
    { class: 'text-code', sample: 'labels.db' },
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

      {/* Progress Bar Section */}
      <section className="test-section">
        <h2 className="test-section-header text-section-header">Progress Bars</h2>

        <div className="progress-demos">
          <div className="progress-demo">
            <h3 className="text-label">Indeterminate (no progress value)</h3>
            <ProgressBar />
          </div>

          <div className="progress-demo">
            <h3 className="text-label">Simple progress (45%)</h3>
            <ProgressBar progress={45} />
          </div>

          <div className="progress-demo">
            <h3 className="text-label">With percentage display</h3>
            <ProgressBar progress={67} showPercentage />
          </div>

          <div className="progress-demo">
            <h3 className="text-label">With percentage and label</h3>
            <ProgressBar progress={33} showPercentage label="labels.db" />
          </div>

          <div className="progress-demo">
            <h3 className="text-label">Simulated file upload (live)</h3>
            <ProgressBar
              progress={uploadProgress}
              showPercentage
              label="labels.db"
              transferDetails={{
                bytesWritten: formatBytes(uploadBytes),
                totalBytes: formatBytes(totalBytes),
                speed: getUploadSpeed(),
                eta: getEta(),
              }}
            />
          </div>

          <div className="progress-demo">
            <h3 className="text-label">Complete (100%)</h3>
            <ProgressBar progress={100} showPercentage label="Done!" />
          </div>
        </div>
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
