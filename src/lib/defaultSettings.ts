/**
 * Default Settings for Cartridge Configuration
 *
 * Defines the default values for all cartridge settings including
 * display modes and hardware configuration.
 */

// Settings types matching backend and settings.md
export type BeamConvergence = 'Off' | 'Consumer' | 'Professional';
export type ImageSize = 'Fill' | 'Integer' | 'Integer+';
export type ImageFit = 'Original' | 'Stretch' | 'Cinema Zoom';
export type Sharpness = 'Very Soft' | 'Soft' | 'Medium' | 'Sharp' | 'Very Sharp';
export type Region = 'Auto' | 'NTSC' | 'PAL';
export type Overclock = 'Auto' | 'Enhanced' | 'Enhanced+' | 'Unleashed';
export type DisplayMode = 'bvm' | 'pvm' | 'crt' | 'scanlines' | 'clean';
export type InterpolationAlg = 'BC Spline' | 'Bilinear' | 'Blackman Harris' | 'Lanczos2';
export type GammaTransfer = 'Tube' | 'Modern' | 'Professional';

export interface CRTModeSettings {
  horizontalBeamConvergence: BeamConvergence;
  verticalBeamConvergence: BeamConvergence;
  enableEdgeOvershoot: boolean;
  enableEdgeHardness: boolean;
  imageSize: ImageSize;
  imageFit: ImageFit;
}

export interface CleanModeSettings {
  interpolationAlg: InterpolationAlg;
  gammaTransferFunction: GammaTransfer;
  sharpness: Sharpness;
  imageSize: ImageSize;
  imageFit: ImageFit;
}

export interface DisplayCatalog {
  bvm: CRTModeSettings;
  pvm: CRTModeSettings;
  crt: CRTModeSettings;
  scanlines: CRTModeSettings;
  clean: CleanModeSettings;
}

export interface DisplaySettings {
  odm: DisplayMode;
  catalog: DisplayCatalog;
}

export interface HardwareSettings {
  virtualExpansionPak: boolean;
  region: Region;
  disableDeblur: boolean;
  enable32BitColor: boolean;
  forceProgressiveOutput: boolean;
  disableTextureFiltering: boolean;
  disableAntialiasing: boolean;
  forceOriginalHardware: boolean;
  overclock: Overclock;
}

export interface CartridgeSettings {
  title: string;
  display: DisplaySettings;
  hardware: HardwareSettings;
}

/**
 * Creates default settings for a cartridge.
 * These defaults match the Analogue 3D's factory settings.
 */
export function createDefaultSettings(title: string = 'Unknown Cartridge'): CartridgeSettings {
  const defaultCRTSettings: CRTModeSettings = {
    horizontalBeamConvergence: 'Professional',
    verticalBeamConvergence: 'Professional',
    enableEdgeOvershoot: false,
    enableEdgeHardness: false,
    imageSize: 'Fill',
    imageFit: 'Original',
  };

  return {
    title,
    display: {
      odm: 'bvm',
      catalog: {
        bvm: { ...defaultCRTSettings },
        pvm: { ...defaultCRTSettings, enableEdgeOvershoot: true },
        crt: { ...defaultCRTSettings, enableEdgeOvershoot: true, horizontalBeamConvergence: 'Consumer', verticalBeamConvergence: 'Consumer' },
        scanlines: { ...defaultCRTSettings, horizontalBeamConvergence: 'Off', verticalBeamConvergence: 'Off' },
        clean: {
          interpolationAlg: 'BC Spline',
          gammaTransferFunction: 'Tube',
          sharpness: 'Medium',
          imageSize: 'Fill',
          imageFit: 'Original',
        },
      },
    },
    hardware: {
      virtualExpansionPak: true,
      region: 'Auto',
      disableDeblur: false,
      enable32BitColor: true,
      forceProgressiveOutput: false,
      disableTextureFiltering: false,
      disableAntialiasing: false,
      forceOriginalHardware: false,
      overclock: 'Auto',
    },
  };
}
