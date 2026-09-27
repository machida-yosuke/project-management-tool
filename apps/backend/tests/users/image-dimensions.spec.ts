import { describe, expect, it } from 'vitest';
import { readImageDimensions } from '../../src/users/image-dimensions';
import { jpeg, png, webpExtended, webpLossless, webpLossy } from './images';

describe('readImageDimensions', () => {
  it.each([
    ['PNG', png(128, 64)],
    ['JPEG SOF0', jpeg(128, 64)],
    ['JPEG SOF2 (progressive)', jpeg(128, 64, 0xc2)],
    ['WebP VP8', webpLossy(128, 64)],
    ['WebP VP8L', webpLossless(128, 64)],
    ['WebP VP8X', webpExtended(128, 64)],
  ])('reads %s', (_label, bytes) => {
    expect(readImageDimensions(bytes)).toEqual({ width: 128, height: 64 });
  });

  it('reads sizes beyond 16 bits from PNG and VP8X', () => {
    expect(readImageDimensions(png(70000, 1))).toEqual({ width: 70000, height: 1 });
    expect(readImageDimensions(webpExtended(70000, 2))).toEqual({ width: 70000, height: 2 });
  });

  it('reads the maximum 14-bit VP8L size', () => {
    expect(readImageDimensions(webpLossless(16384, 16384))).toEqual({
      width: 16384,
      height: 16384,
    });
  });

  it('reads from a view with a non-zero byte offset', () => {
    const source = png(10, 20);
    const buffer = new Uint8Array(source.length + 3);
    buffer.set(source, 3);
    expect(readImageDimensions(buffer.subarray(3))).toEqual({ width: 10, height: 20 });
  });

  it.each([0xc4, 0xc8, 0xcc])('does not treat marker %s as a frame header', (marker) => {
    expect(readImageDimensions(jpeg(10, 10, marker))).toBeNull();
  });

  it.each([
    ['empty', new Uint8Array()],
    ['text', new TextEncoder().encode('not an image at all')],
    ['GIF', new TextEncoder().encode('GIF89a\x10\x00\x10\x00')],
    ['truncated PNG', png(10, 10).subarray(0, 20)],
    ['PNG with zero width', png(0, 10)],
    ['JPEG without SOF', new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
    ['truncated JPEG', jpeg(10, 10).subarray(0, 24)],
    ['RIFF that is not WebP', new TextEncoder().encode('RIFF\0\0\0\0WAVEfmt ')],
    ['VP8 without start code', webpLossy(10, 10).fill(0, 23, 26)],
    ['truncated VP8L', webpLossless(10, 10).subarray(0, 22)],
  ])('returns null for %s', (_label, bytes) => {
    expect(readImageDimensions(bytes)).toBeNull();
  });
});
