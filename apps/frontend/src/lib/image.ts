export const AVATAR_SIZE = 128;

const QUALITY = 0.85;

export class ImageDecodeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ImageDecodeError';
  }
}

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

export async function resizeAvatar(file: Blob): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    throw new ImageDecodeError('Failed to decode image', { cause: e });
  }

  try {
    const side = Math.min(bitmap.width, bitmap.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    );
  } finally {
    bitmap.close();
  }

  const webp = await encode(canvas, 'image/webp');
  if (webp?.type === 'image/webp') return webp;

  // Browsers without WebP encoding (e.g. Safari) silently return PNG; JPEG has no alpha,
  // so paint white behind transparent pixels instead of letting them turn black.
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  const jpeg = await encode(canvas, 'image/jpeg');
  if (jpeg?.type === 'image/jpeg') return jpeg;
  throw new ImageDecodeError('Failed to encode image');
}
