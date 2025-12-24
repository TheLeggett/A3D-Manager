import sharp from 'sharp';
import { readFile, writeFile } from 'fs/promises';

// Target dimensions for Analogue 3D artwork
const TARGET_WIDTH = 3340;
const TARGET_HEIGHT = 3854;

/**
 * TGA file header structure for 16-bit RGBA
 */
function createTgaHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(18);

  header[0] = 0; // ID length
  header[1] = 0; // Color map type (no color map)
  header[2] = 2; // Image type (uncompressed true-color)

  // Color map specification (5 bytes, all zeros for no color map)
  header[3] = 0;
  header[4] = 0;
  header[5] = 0;
  header[6] = 0;
  header[7] = 0;

  // Image specification
  header.writeUInt16LE(0, 8); // X-origin
  header.writeUInt16LE(0, 10); // Y-origin
  header.writeUInt16LE(width, 12); // Width
  header.writeUInt16LE(height, 14); // Height
  header[16] = 16; // Pixel depth (16 bits)
  header[17] = 0x21; // Image descriptor (origin top-left, 1-bit alpha)

  return header;
}

/**
 * Convert RGBA8888 to RGBA5551 (16-bit with 1-bit alpha)
 */
function convertToRgba5551(rgbaBuffer: Buffer): Buffer {
  const pixelCount = rgbaBuffer.length / 4;
  const output = Buffer.alloc(pixelCount * 2);

  for (let i = 0; i < pixelCount; i++) {
    const r = rgbaBuffer[i * 4];
    const g = rgbaBuffer[i * 4 + 1];
    const b = rgbaBuffer[i * 4 + 2];
    const a = rgbaBuffer[i * 4 + 3];

    // Convert 8-bit channels to 5-bit (or 1-bit for alpha)
    const r5 = (r >> 3) & 0x1f;
    const g5 = (g >> 3) & 0x1f;
    const b5 = (b >> 3) & 0x1f;
    const a1 = a > 127 ? 1 : 0;

    // Pack into 16-bit value (ARRRRRGG GGGBBBBB format for TGA)
    // TGA uses GGGBBBBB ARRRRRGG (little-endian)
    const pixel = (a1 << 15) | (r5 << 10) | (g5 << 5) | b5;
    output.writeUInt16LE(pixel, i * 2);
  }

  return output;
}

/**
 * Convert an image file (PNG, JPG, etc.) to TGA format suitable for Analogue 3D
 */
export async function convertToTga(
  inputPath: string,
  outputPath: string
): Promise<void> {
  // Load and resize image to target dimensions
  const image = sharp(inputPath);

  // Resize to target dimensions, maintaining aspect ratio and filling
  const resizedBuffer = await image
    .resize(TARGET_WIDTH, TARGET_HEIGHT, {
      fit: 'cover',
      position: 'center',
    })
    .ensureAlpha()
    .raw()
    .toBuffer();

  // Convert to 16-bit RGBA5551
  const pixelData = convertToRgba5551(resizedBuffer);

  // Create TGA header
  const header = createTgaHeader(TARGET_WIDTH, TARGET_HEIGHT);

  // Combine header and pixel data
  const tgaBuffer = Buffer.concat([header, pixelData]);

  await writeFile(outputPath, tgaBuffer);
}

/**
 * Convert an image buffer to TGA format
 */
export async function bufferToTga(inputBuffer: Buffer): Promise<Buffer> {
  // Load and resize image to target dimensions
  const resizedBuffer = await sharp(inputBuffer)
    .resize(TARGET_WIDTH, TARGET_HEIGHT, {
      fit: 'cover',
      position: 'center',
    })
    .ensureAlpha()
    .raw()
    .toBuffer();

  // Convert to 16-bit RGBA5551
  const pixelData = convertToRgba5551(resizedBuffer);

  // Create TGA header
  const header = createTgaHeader(TARGET_WIDTH, TARGET_HEIGHT);

  // Combine header and pixel data
  return Buffer.concat([header, pixelData]);
}

/**
 * Read a TGA file and convert to PNG buffer for display
 */
export async function tgaToPng(tgaPath: string): Promise<Buffer> {
  const tgaBuffer = await readFile(tgaPath);
  return tgaBufferToPng(tgaBuffer);
}

/**
 * Convert TGA buffer to PNG buffer for display
 */
export async function tgaBufferToPng(tgaBuffer: Buffer): Promise<Buffer> {
  // Parse TGA header
  const width = tgaBuffer.readUInt16LE(12);
  const height = tgaBuffer.readUInt16LE(14);
  const bitDepth = tgaBuffer[16];

  if (bitDepth !== 16) {
    throw new Error(`Unsupported TGA bit depth: ${bitDepth}`);
  }

  // Skip header (18 bytes)
  const pixelData = tgaBuffer.subarray(18);
  const pixelCount = width * height;

  // Convert RGBA5551 to RGBA8888
  const rgbaBuffer = Buffer.alloc(pixelCount * 4);

  for (let i = 0; i < pixelCount; i++) {
    const pixel = pixelData.readUInt16LE(i * 2);

    const a1 = (pixel >> 15) & 0x1;
    const r5 = (pixel >> 10) & 0x1f;
    const g5 = (pixel >> 5) & 0x1f;
    const b5 = pixel & 0x1f;

    // Expand to 8-bit
    rgbaBuffer[i * 4] = (r5 << 3) | (r5 >> 2);
    rgbaBuffer[i * 4 + 1] = (g5 << 3) | (g5 >> 2);
    rgbaBuffer[i * 4 + 2] = (b5 << 3) | (b5 >> 2);
    rgbaBuffer[i * 4 + 3] = a1 ? 255 : 0;
  }

  // Convert raw RGBA to PNG
  return sharp(rgbaBuffer, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}
