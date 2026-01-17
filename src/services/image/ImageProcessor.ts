/**
 * Image Processor Service (Browser)
 *
 * Uses Pica library for high-quality image resizing in the browser.
 * Replaces Node.js Sharp library functionality.
 *
 * This service handles:
 * - Resizing images to 74x86 for labels.db
 * - Converting between image formats (PNG, JPEG, etc.)
 * - Converting RGBA to BGRA for labels.db format
 */

import Pica from 'pica';
import { IMAGE_WIDTH, IMAGE_HEIGHT, IMAGE_DATA_SIZE, rgbaToBgra } from '../labels/LabelsDbService';

// Create a single pica instance for reuse
const pica = new Pica();

/**
 * Load an image from a File or Blob into an HTMLImageElement
 */
export async function loadImage(source: File | Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));

    if (typeof source === 'string') {
      // URL or data URL
      img.src = source;
    } else {
      // File or Blob
      img.src = URL.createObjectURL(source);
    }
  });
}

/**
 * Get image dimensions from a File or Blob
 */
export async function getImageDimensions(source: File | Blob): Promise<{ width: number; height: number }> {
  const img = await loadImage(source);
  const { width, height } = img;

  // Clean up object URL if we created one
  if (img.src.startsWith('blob:')) {
    URL.revokeObjectURL(img.src);
  }

  return { width, height };
}

/**
 * Resize an image to the target dimensions using pica
 * Uses 'cover' fit mode and center positioning (like Sharp)
 */
export async function resizeImage(
  source: File | Blob | HTMLImageElement,
  targetWidth: number,
  targetHeight: number
): Promise<HTMLCanvasElement> {
  // Load image if needed
  const img = source instanceof HTMLImageElement ? source : await loadImage(source);

  // Calculate crop area for 'cover' fit
  const srcRatio = img.width / img.height;
  const dstRatio = targetWidth / targetHeight;

  let srcX = 0;
  let srcY = 0;
  let srcWidth = img.width;
  let srcHeight = img.height;

  if (srcRatio > dstRatio) {
    // Image is wider than target ratio - crop horizontally
    srcWidth = Math.round(img.height * dstRatio);
    srcX = Math.round((img.width - srcWidth) / 2);
  } else if (srcRatio < dstRatio) {
    // Image is taller than target ratio - crop vertically
    srcHeight = Math.round(img.width / dstRatio);
    srcY = Math.round((img.height - srcHeight) / 2);
  }

  // Create source canvas with cropped region
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcWidth;
  srcCanvas.height = srcHeight;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) {
    throw new Error('Could not get source canvas context');
  }

  // Draw cropped region to source canvas
  srcCtx.drawImage(img, srcX, srcY, srcWidth, srcHeight, 0, 0, srcWidth, srcHeight);

  // Create destination canvas
  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = targetWidth;
  dstCanvas.height = targetHeight;

  // Use pica for high-quality resize
  await pica.resize(srcCanvas, dstCanvas, {
    quality: 3, // Highest quality
  });

  // Clean up object URL if we created one
  if (!(source instanceof HTMLImageElement) && img.src.startsWith('blob:')) {
    URL.revokeObjectURL(img.src);
  }

  return dstCanvas;
}

/**
 * Get raw RGBA pixel data from a canvas
 */
export function getCanvasRgba(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return new Uint8Array(imageData.data);
}

/**
 * Prepare an image for storage in labels.db
 * Resizes to 74x86 and converts to BGRA format
 *
 * @param source - Image file, blob, or HTMLImageElement
 * @returns BGRA pixel data ready for labels.db
 */
export async function prepareImageForLabelsDb(source: File | Blob | HTMLImageElement): Promise<Uint8Array> {
  // Resize to 74x86
  const resizedCanvas = await resizeImage(source, IMAGE_WIDTH, IMAGE_HEIGHT);

  // Get RGBA data
  const rgba = getCanvasRgba(resizedCanvas);

  if (rgba.length !== IMAGE_DATA_SIZE) {
    throw new Error(`Unexpected image size: ${rgba.length}, expected ${IMAGE_DATA_SIZE}`);
  }

  // Convert RGBA to BGRA
  return rgbaToBgra(rgba);
}

/**
 * Convert a canvas to PNG blob
 */
export async function canvasToPng(canvas: HTMLCanvasElement, quality = 1): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to PNG blob'));
        }
      },
      'image/png',
      quality
    );
  });
}

/**
 * Convert a canvas to JPEG blob
 */
export async function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to JPEG blob'));
        }
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Resize an image and convert to PNG blob
 */
export async function resizeImageToPng(
  source: File | Blob | HTMLImageElement,
  targetWidth: number,
  targetHeight: number
): Promise<Blob> {
  const canvas = await resizeImage(source, targetWidth, targetHeight);
  return canvasToPng(canvas);
}

/**
 * Generate a thumbnail from an image
 */
export async function generateThumbnail(
  source: File | Blob | HTMLImageElement,
  maxSize: number = 128
): Promise<Blob> {
  const img = source instanceof HTMLImageElement ? source : await loadImage(source);

  // Calculate thumbnail dimensions maintaining aspect ratio
  let width = img.width;
  let height = img.height;

  if (width > height) {
    if (width > maxSize) {
      height = Math.round((height * maxSize) / width);
      width = maxSize;
    }
  } else {
    if (height > maxSize) {
      width = Math.round((width * maxSize) / height);
      height = maxSize;
    }
  }

  // Create thumbnail canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  // Create source canvas
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = img.width;
  srcCanvas.height = img.height;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) {
    throw new Error('Could not get source canvas context');
  }
  srcCtx.drawImage(img, 0, 0);

  // Use pica for quality resize
  await pica.resize(srcCanvas, canvas, {
    quality: 2,
  });

  // Clean up object URL if we created one
  if (!(source instanceof HTMLImageElement) && img.src.startsWith('blob:')) {
    URL.revokeObjectURL(img.src);
  }

  return canvasToPng(canvas);
}

/**
 * Read a File or Blob as ArrayBuffer
 */
export async function readFileAsArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Read a File or Blob as data URL
 */
export async function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Convert ArrayBuffer to Blob
 */
export function arrayBufferToBlob(buffer: ArrayBuffer, type: string): Blob {
  return new Blob([buffer], { type });
}

/**
 * Convert Blob to ArrayBuffer
 */
export async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return readFileAsArrayBuffer(blob);
}

/**
 * Create a download link for a Blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Create a download link for an ArrayBuffer
 */
export function downloadArrayBuffer(buffer: ArrayBuffer, filename: string, type: string): void {
  const blob = arrayBufferToBlob(buffer, type);
  downloadBlob(blob, filename);
}
