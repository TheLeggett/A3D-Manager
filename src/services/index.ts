/**
 * Services Index
 *
 * Central export point for all browser services.
 */

// Storage
export * as storage from './storage/IndexedDbStorage';
export type {
  OwnedCartridge,
  StoredSettings,
  StoredGamePak,
  GamePakBackup,
  UserCart,
  AppPreferences,
} from './storage/IndexedDbStorage';

// Labels Database
export * as labelsDb from './labels/LabelsDbService';
export type {
  LabelEntry,
  LabelsDatabase,
  LabelImage,
} from './labels/LabelsDbService';

// Image Processing
export * as imageProcessor from './image/ImageProcessor';

// SD Card
export * as sdCard from './sd-card/SdCardService';
export type {
  BrowserSDCard,
  GameFolder,
  ProgressCallback,
} from './sd-card/SdCardService';

// Settings
export * as settings from './settings/SettingsService';
export type {
  SettingsInfo,
  SettingsSyncStatus,
  CartridgeSettings,
} from './settings/SettingsService';

// Game Pak
export * as gamePak from './game-pak/GamePakService';
export type {
  GamePakSaveDetails,
  GamePakInfo,
  GamePakSyncStatus,
  GamePakBackup as GamePakBackupInfo,
} from './game-pak/GamePakService';

// Bundle
export * as bundle from './bundle/BundleService';
export type {
  BundleManifest,
  BundleContents,
  MergeStrategy,
  ImportOptions,
  ImportResult,
} from './bundle/BundleService';

// Browser Check
export * as browserCheck from './browser/BrowserCheck';
export type {
  BrowserInfo,
  SupportLevel,
  CompatibilityResult,
} from './browser/BrowserCheck';
