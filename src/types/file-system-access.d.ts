/**
 * Type declarations for File System Access API
 *
 * These types are for the Chrome-only File System Access API
 * that allows direct access to the file system from the browser.
 */

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemDirectoryHandle {
  readonly kind: 'directory';
  readonly name: string;

  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;

  // Iterator methods
  keys(): AsyncIterableIterator<string>;
  values(): AsyncIterableIterator<FileSystemHandle>;
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]>;

  // Permission methods (Chrome-specific)
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface FileSystemFileHandle {
  readonly kind: 'file';
  readonly name: string;

  getFile(): Promise<File>;
  createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;

  // Permission methods (Chrome-specific)
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

type FileSystemHandle = FileSystemFileHandle | FileSystemDirectoryHandle;

interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string | WriteParams): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
  close(): Promise<void>;
}

interface WriteParams {
  type: 'write' | 'seek' | 'truncate';
  size?: number;
  position?: number;
  data?: BufferSource | Blob | string;
}

interface ShowDirectoryPickerOptions {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | FileSystemHandle;
}

interface ShowOpenFilePickerOptions {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: FilePickerAcceptType[];
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | FileSystemHandle;
}

interface ShowSaveFilePickerOptions {
  excludeAcceptAllOption?: boolean;
  suggestedName?: string;
  types?: FilePickerAcceptType[];
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | FileSystemHandle;
}

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string | string[]>;
}

interface Window {
  showDirectoryPicker(options?: ShowDirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
  showOpenFilePicker(options?: ShowOpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker(options?: ShowSaveFilePickerOptions): Promise<FileSystemFileHandle>;
}
