export const AVATAR_SIZE = 128;
export const ATTACHMENT_MAX_SIDE = 1600;
export const ATTACHMENT_MAX_BYTES = 512000;

const AVATAR_QUALITY = 0.85;
const ATTACHMENT_QUALITIES = [0.8, 0.7, 0.6];

export class ImageDecodeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ImageDecodeError';
  }
}

export class AttachmentTooLargeError extends Error {
  constructor() {
    super('Image is still too large after compression');
    this.name = 'AttachmentTooLargeError';
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function createContext(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable');
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    throw new ImageDecodeError('Failed to decode image', { cause: e });
  }
}

async function render(
  file: Blob,
  size: (bitmap: ImageBitmap) => { width: number; height: number },
  paint: (
    ctx: CanvasRenderingContext2D,
    bitmap: ImageBitmap,
    width: number,
    height: number,
  ) => void,
) {
  const bitmap = await decode(file);
  try {
    const { width, height } = size(bitmap);
    const target = createContext(width, height);
    paint(target.ctx, bitmap, width, height);
    return target;
  } finally {
    bitmap.close();
  }
}

// Browsers without WebP encoding (e.g. Safari) silently return PNG; JPEG has no alpha,
// so paint white behind transparent pixels instead of letting them turn black.
async function encodeWebpOrJpeg(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  quality: number,
  tryWebp: boolean,
): Promise<Blob> {
  if (tryWebp) {
    const webp = await encode(canvas, 'image/webp', quality);
    if (webp?.type === 'image/webp') return webp;
  }
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const jpeg = await encode(canvas, 'image/jpeg', quality);
  if (jpeg?.type === 'image/jpeg') return jpeg;
  throw new ImageDecodeError('Failed to encode image');
}

export async function resizeAvatar(file: Blob): Promise<Blob> {
  const { canvas, ctx } = await render(
    file,
    () => ({ width: AVATAR_SIZE, height: AVATAR_SIZE }),
    (ctx, bitmap) => {
      const side = Math.min(bitmap.width, bitmap.height);
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
    },
  );
  return encodeWebpOrJpeg(canvas, ctx, AVATAR_QUALITY, true);
}

export async function resizeAttachment(file: Blob): Promise<Blob> {
  const { canvas, ctx } = await render(
    file,
    (bitmap) => {
      const scale = Math.min(1, ATTACHMENT_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      return {
        width: Math.max(1, Math.round(bitmap.width * scale)),
        height: Math.max(1, Math.round(bitmap.height * scale)),
      };
    },
    (ctx, bitmap, width, height) => ctx.drawImage(bitmap, 0, 0, width, height),
  );
  let tryWebp = true;
  for (const quality of ATTACHMENT_QUALITIES) {
    const blob = await encodeWebpOrJpeg(canvas, ctx, quality, tryWebp);
    if (blob.size <= ATTACHMENT_MAX_BYTES) return blob;
    tryWebp = blob.type === 'image/webp';
  }
  throw new AttachmentTooLargeError();
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('FileReader did not return a data URL'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)((?:;[^;,]+)*?)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new ImageDecodeError('Malformed data URL');
  const [, type = '', , base64, payload = ''] = match;
  if (!base64) return new Blob([decodeURIComponent(payload)], { type });
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
