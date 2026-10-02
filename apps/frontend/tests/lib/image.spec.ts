import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AVATAR_SIZE,
  AttachmentTooLargeError,
  ImageDecodeError,
  blobToDataUrl,
  dataUrlToBlob,
  resizeAttachment,
  resizeAvatar,
} from '../../src/lib/image';

// happy-dom implements neither decoding nor drawing, so stub the browser APIs resizeAvatar uses.
function stubCanvas(supportedTypes: string[], sizeFor: (quality: unknown) => number = () => 6) {
  const ctx = {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    imageSmoothingQuality: 'low',
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
  };
  const encoded: { type: string; quality: unknown; width: number; height: number }[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
    quality?: unknown,
  ) {
    encoded.push({ type: type ?? '', quality, width: this.width, height: this.height });
    // Browsers fall back to PNG for types they cannot encode instead of failing.
    const outType = type && supportedTypes.includes(type) ? type : 'image/png';
    callback(new Blob([new Uint8Array(sizeFor(quality))], { type: outType }));
  });
  return { ctx, encoded };
}

function stubBitmap(width: number, height: number) {
  const bitmap = { width, height, close: vi.fn() };
  const create = vi.fn(() => Promise.resolve(bitmap));
  vi.stubGlobal('createImageBitmap', create);
  return { bitmap, create };
}

describe('resizeAvatar', () => {
  const source = new Blob(['source'], { type: 'image/jpeg' });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('center-crops a landscape image to a 128x128 WebP', async () => {
    const { ctx, encoded } = stubCanvas(['image/webp', 'image/jpeg']);
    const { bitmap, create } = stubBitmap(400, 200);

    const result = await resizeAvatar(source);

    expect(AVATAR_SIZE).toBe(128);
    expect(create).toHaveBeenCalledWith(source, { imageOrientation: 'from-image' });
    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 100, 0, 200, 200, 0, 0, 128, 128);
    expect(bitmap.close).toHaveBeenCalled();
    expect(encoded).toEqual([{ type: 'image/webp', quality: 0.85, width: 128, height: 128 }]);
    expect(result.type).toBe('image/webp');
  });

  it('center-crops a portrait image on the vertical axis', async () => {
    const { ctx } = stubCanvas(['image/webp']);
    const { bitmap } = stubBitmap(300, 900);

    await resizeAvatar(source);

    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 300, 300, 300, 0, 0, 128, 128);
  });

  it('falls back to JPEG on a white background when WebP encoding is unsupported', async () => {
    const { ctx, encoded } = stubCanvas(['image/jpeg']);
    stubBitmap(128, 128);

    const result = await resizeAvatar(source);

    expect(encoded.map((e) => [e.type, e.quality])).toEqual([
      ['image/webp', 0.85],
      ['image/jpeg', 0.85],
    ]);
    expect(ctx.globalCompositeOperation).toBe('destination-over');
    expect(ctx.fillStyle).toBe('#fff');
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 128, 128);
    expect(result.type).toBe('image/jpeg');
  });

  it('throws ImageDecodeError when neither WebP nor JPEG can be encoded', async () => {
    stubCanvas([]);
    stubBitmap(128, 128);

    await expect(resizeAvatar(source)).rejects.toBeInstanceOf(ImageDecodeError);
  });

  it('throws ImageDecodeError when the image cannot be decoded', async () => {
    const { ctx } = stubCanvas(['image/webp']);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new DOMException('bad image', 'InvalidStateError'))),
    );

    await expect(resizeAvatar(source)).rejects.toBeInstanceOf(ImageDecodeError);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('closes the bitmap even when drawing throws', async () => {
    const { ctx } = stubCanvas(['image/webp']);
    const { bitmap } = stubBitmap(128, 128);
    ctx.drawImage.mockImplementation(() => {
      throw new Error('draw failed');
    });

    await expect(resizeAvatar(source)).rejects.toThrow('draw failed');
    expect(bitmap.close).toHaveBeenCalled();
  });
});

describe('resizeAttachment', () => {
  const source = new Blob(['source'], { type: 'image/png' });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('scales the long side down to 1000px and encodes WebP at 0.8', async () => {
    const { ctx, encoded } = stubCanvas(['image/webp']);
    const { bitmap, create } = stubBitmap(2000, 1000);

    const result = await resizeAttachment(source);

    expect(create).toHaveBeenCalledWith(source, { imageOrientation: 'from-image' });
    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1000, 500);
    expect(bitmap.close).toHaveBeenCalled();
    expect(encoded).toEqual([{ type: 'image/webp', quality: 0.8, width: 1000, height: 500 }]);
    expect(result.type).toBe('image/webp');
  });

  it('re-encodes a small image at its own size', async () => {
    const { encoded } = stubCanvas(['image/webp']);
    stubBitmap(300, 900);

    await resizeAttachment(source);

    expect(encoded.map((e) => [e.width, e.height])).toEqual([[300, 900]]);
  });

  it('falls back to JPEG on white and remembers it for lower qualities', async () => {
    const { ctx, encoded } = stubCanvas(['image/jpeg'], (q) => (q === 0.8 ? 600_000 : 400_000));
    stubBitmap(800, 600);

    const result = await resizeAttachment(source);

    expect(encoded.map((e) => [e.type, e.quality])).toEqual([
      ['image/webp', 0.8],
      ['image/jpeg', 0.8],
      ['image/jpeg', 0.7],
    ]);
    expect(ctx.fillStyle).toBe('#fff');
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(result.type).toBe('image/jpeg');
    expect(result.size).toBe(400_000);
  });

  it('lowers the quality down to 0.6 and then gives up', async () => {
    const { encoded } = stubCanvas(['image/webp'], () => 512_001);
    stubBitmap(1000, 1000);

    await expect(resizeAttachment(source)).rejects.toBeInstanceOf(AttachmentTooLargeError);
    expect(encoded.map((e) => e.quality)).toEqual([0.8, 0.7, 0.6]);
  });

  it('throws ImageDecodeError when the image cannot be decoded', async () => {
    stubCanvas(['image/webp']);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new Error('bad'))),
    );

    await expect(resizeAttachment(source)).rejects.toBeInstanceOf(ImageDecodeError);
  });
});

describe('data URL conversion', () => {
  it('round-trips a blob through a data URL', async () => {
    const blob = new Blob([new Uint8Array([0, 1, 254, 255])], { type: 'image/webp' });

    const url = await blobToDataUrl(blob);
    expect(url).toBe('data:image/webp;base64,AAH+/w==');

    const back = dataUrlToBlob(url);
    expect(back.type).toBe('image/webp');
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(new Uint8Array([0, 1, 254, 255]));
  });

  it('rejects a malformed data URL', () => {
    expect(() => dataUrlToBlob('https://example.com/a.png')).toThrow(ImageDecodeError);
  });
});
