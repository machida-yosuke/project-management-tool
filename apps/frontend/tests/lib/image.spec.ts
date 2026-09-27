import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AVATAR_SIZE, ImageDecodeError, resizeAvatar } from '../../src/lib/image';

// happy-dom implements neither decoding nor drawing, so stub the browser APIs resizeAvatar uses.
function stubCanvas(supportedTypes: string[]) {
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
    callback(new Blob(['pixels'], { type: outType }));
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
