export interface GameSettings {
  title: string;
  display: {
    odm: 'bvm' | 'pvm' | 'crt' | 'scanlines' | 'clean';
    catalog: {
      bvm: DisplaySettings;
      pvm: DisplaySettings;
      crt: DisplaySettings;
      scanlines: DisplaySettings;
      clean: CleanDisplaySettings;
    };
  };
  hardware: HardwareSettings;
}

export interface DisplaySettings {
  horizontalBeamConvergence: 'Off' | 'Consumer' | 'Professional';
  verticalBeamConvergence: 'Off' | 'Consumer' | 'Professional';
  enableEdgeOvershoot: boolean;
  enableEdgeHardness: boolean;
  imageSize: 'Fill' | 'Fit';
  imageFit: 'Original' | 'Stretch';
}

export interface CleanDisplaySettings {
  interpolationAlg: string;
  gammaTransferFunction: string;
  sharpness: 'Low' | 'Medium' | 'High';
  imageSize: 'Fill' | 'Fit';
  imageFit: 'Original' | 'Stretch';
}

export interface HardwareSettings {
  virtualExpansionPak: boolean;
  region: 'Auto' | 'NTSC' | 'PAL';
  disableDeblur: boolean;
  enable32BitColor: boolean;
  disableTextureFiltering: boolean;
  disableAntialiasing: boolean;
  forceOriginalHardware: boolean;
  overclock: 'Auto' | 'Enhanced' | 'Unleashed';
}

export interface Game {
  id: string;
  title: string;
  folderName: string;
  hasArtwork: boolean;
  settings: GameSettings;
}

export interface SDCard {
  name: string;
  path: string;
  gamesPath: string;
  libraryDbPath: string;
  labelsDbPath: string;
}

export interface SyncDiff {
  onlyLocal: { id: string; title: string }[];
  onlySD: { id: string; title: string }[];
  modified: { id: string; localTitle: string; sdTitle: string }[];
  same: { id: string; title: string }[];
}
