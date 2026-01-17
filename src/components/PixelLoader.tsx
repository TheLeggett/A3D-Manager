/**
 * PixelLoader - 8-bit style loading animation
 *
 * A retro-styled loading placeholder with pixelated animation effects.
 */

import './PixelLoader.css';

interface PixelLoaderProps {
  /** Width of the loader */
  width?: number | string;
  /** Height of the loader */
  height?: number | string;
  /** Animation variant */
  variant?: 'scanline' | 'blocks' | 'pulse';
  /** Additional class name */
  className?: string;
}

export function PixelLoader({
  width = 80,
  height = 112,
  variant = 'scanline',
  className = '',
}: PixelLoaderProps) {
  return (
    <div
      className={`pixel-loader pixel-loader--${variant} ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    >
      {variant === 'blocks' && (
        <div className="pixel-loader__blocks">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="pixel-loader__block" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      )}
      {variant === 'scanline' && (
        <div className="pixel-loader__scanline" />
      )}
      {variant === 'pulse' && (
        <div className="pixel-loader__pulse-grid">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="pixel-loader__pulse-cell" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      )}
    </div>
  );
}
