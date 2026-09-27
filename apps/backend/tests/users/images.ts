function ascii(text: string): number[] {
  return Array.from(text, (ch) => ch.charCodeAt(0));
}

function uint16be(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function uint32be(value: number): number[] {
  return [...uint16be(value >>> 16), ...uint16be(value & 0xffff)];
}

function uint16le(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function uint24le(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
}

function uint32le(value: number): number[] {
  return [...uint16le(value & 0xffff), ...uint16le(value >>> 16)];
}

export function png(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...uint32be(13),
    ...ascii('IHDR'),
    ...uint32be(width),
    ...uint32be(height),
    8,
    6,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
}

export function jpeg(width: number, height: number, sofMarker = 0xc0): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    ...uint16be(16),
    ...ascii('JFIF'),
    0,
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
    0xff,
    sofMarker,
    ...uint16be(11),
    8,
    ...uint16be(height),
    ...uint16be(width),
    1,
    1,
    0x11,
    0,
    0xff,
    0xd9,
  ]);
}

function riff(chunk: string, payload: number[]): Uint8Array {
  return new Uint8Array([
    ...ascii('RIFF'),
    ...uint32le(4 + 8 + payload.length),
    ...ascii('WEBP'),
    ...ascii(chunk),
    ...uint32le(payload.length),
    ...payload,
  ]);
}

export function webpLossless(width: number, height: number): Uint8Array {
  return riff('VP8L', [0x2f, ...uint32le((width - 1) | ((height - 1) << 14)), 0]);
}

export function webpLossy(width: number, height: number): Uint8Array {
  return riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...uint16le(width), ...uint16le(height)]);
}

export function webpExtended(width: number, height: number): Uint8Array {
  return riff('VP8X', [0, 0, 0, 0, ...uint24le(width - 1), ...uint24le(height - 1)]);
}

export function padTo(bytes: Uint8Array, size: number): Uint8Array {
  const padded = new Uint8Array(size);
  padded.set(bytes);
  return padded;
}
