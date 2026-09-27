export interface ImageDimensions {
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, prefix: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + prefix.length) return false;
  return prefix.every((byte, i) => bytes[offset + i] === byte);
}

function ascii(text: string): number[] {
  return Array.from(text, (ch) => ch.charCodeAt(0));
}

function nonEmpty(width: number, height: number): ImageDimensions | null {
  return width > 0 && height > 0 ? { width, height } : null;
}

function readPng(bytes: Uint8Array, view: DataView): ImageDimensions | null {
  if (bytes.length < 24 || !startsWith(bytes, ascii('IHDR'), 12)) return null;
  return nonEmpty(view.getUint32(16), view.getUint32(20));
}

function isSofMarker(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function readJpeg(bytes: Uint8Array, view: DataView): ImageDimensions | null {
  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // SOF must precede the scan data; past SOS or EOI there is no frame header to find.
    if (marker === 0xd9 || marker === 0xda) return null;
    if (offset + 4 > bytes.length) return null;
    const length = view.getUint16(offset + 2);
    if (length < 2) return null;
    if (isSofMarker(marker)) {
      if (offset + 9 > bytes.length) return null;
      return nonEmpty(view.getUint16(offset + 7), view.getUint16(offset + 5));
    }
    offset += 2 + length;
  }
  return null;
}

function readWebp(bytes: Uint8Array, view: DataView): ImageDimensions | null {
  if (!startsWith(bytes, ascii('WEBP'), 8)) return null;
  if (startsWith(bytes, ascii('VP8 '), 12)) {
    if (bytes.length < 30 || !startsWith(bytes, [0x9d, 0x01, 0x2a], 23)) return null;
    return nonEmpty(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
  }
  if (startsWith(bytes, ascii('VP8L'), 12)) {
    if (bytes.length < 25 || bytes[20] !== 0x2f) return null;
    const bits = view.getUint32(21, true);
    return nonEmpty((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (startsWith(bytes, ascii('VP8X'), 12)) {
    if (bytes.length < 30) return null;
    const uint24 = (at: number) => view.getUint16(at, true) | ((bytes[at + 2] ?? 0) << 16);
    return nonEmpty(uint24(24) + 1, uint24(27) + 1);
  }
  return null;
}

export function readImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (startsWith(bytes, PNG_SIGNATURE)) return readPng(bytes, view);
  if (startsWith(bytes, [0xff, 0xd8])) return readJpeg(bytes, view);
  if (startsWith(bytes, ascii('RIFF'))) return readWebp(bytes, view);
  return null;
}
