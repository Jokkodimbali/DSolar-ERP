import { deflateSync, inflateSync } from 'node:zlib';

export interface PdfImage {
  width: number;
  height: number;
  colors: 1 | 3;
  filter: 'DCTDecode' | 'FlateDecode';
  data: Buffer;
  alpha?: Buffer;
}

function invalid(): never {
  throw new Error('Logo invalide ou format d’image non compatible avec le PDF.');
}

function dimensions(width: number, height: number) {
  if (width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 4194304) invalid();
}

function jpeg(data: Buffer): PdfImage {
  let i = 2;
  while (i + 4 < data.length && data[i] === 255) {
    while (i < data.length && data[i] === 255) i++;
    const marker = data[i++];
    if (marker === 0xda || marker === 0xd9 || i + 2 > data.length) break;
    const length = data.readUInt16BE(i);
    if (length < 2 || i + length > data.length) invalid();
    if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
      const height = data.readUInt16BE(i + 3);
      const width = data.readUInt16BE(i + 5);
      const colors = data[i + 7];
      dimensions(width, height);
      if (data[i + 2] !== 8 || (colors !== 1 && colors !== 3)) invalid();
      return { width, height, colors, filter: 'DCTDecode', data };
    }
    i += length;
  }
  return invalid();
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a),
    pb = Math.abs(p - b),
    pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function png(data: Buffer): PdfImage {
  if (data.length < 45 || !data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) invalid();
  const width = data.readUInt32BE(16),
    height = data.readUInt32BE(20);
  dimensions(width, height);
  const depth = data[24],
    type = data[25];
  if (depth !== 8 || ![0, 2, 3, 4, 6].includes(type) || data[26] !== 0 || data[27] !== 0 || data[28] !== 0)
    throw new Error(
      'Le logo PNG doit être non entrelacé, en 8 bits par canal. Utilisez un PNG standard ou un JPEG.',
    );
  const channels = type === 0 || type === 3 ? 1 : type === 2 ? 3 : type === 4 ? 2 : 4;
  const idat: Buffer[] = [];
  let palette: Buffer | undefined, transparency: Buffer | undefined;
  let pos = 8,
    ended = false;
  while (pos + 12 <= data.length) {
    const length = data.readUInt32BE(pos);
    if (length > data.length - pos - 12) invalid();
    const name = data.toString('ascii', pos + 4, pos + 8);
    const body = data.subarray(pos + 8, pos + 8 + length);
    if (name === 'IDAT') idat.push(body);
    if (name === 'PLTE') palette = body;
    if (name === 'tRNS') transparency = body;
    pos += length + 12;
    if (name === 'IEND') {
      ended = true;
      break;
    }
  }
  if (!ended || pos !== data.length || !idat.length || (type === 3 && (!palette || palette.length % 3 !== 0)))
    invalid();
  const stride = width * channels;
  const expected = (stride + 1) * height;
  const raw = inflateSync(Buffer.concat(idat), { maxOutputLength: expected });
  if (raw.length !== expected) invalid();
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const mode = raw[y * (stride + 1)];
    if (mode > 4) invalid();
    for (let x = 0; x < stride; x++) {
      const target = y * stride + x;
      const a = x >= channels ? pixels[target - channels] : 0;
      const b = y ? pixels[target - stride] : 0;
      const c = y && x >= channels ? pixels[target - stride - channels] : 0;
      const predictor =
        mode === 0
          ? 0
          : mode === 1
            ? a
            : mode === 2
              ? b
              : mode === 3
                ? Math.floor((a + b) / 2)
                : paeth(a, b, c);
      pixels[target] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  const colors = type === 0 || type === 4 ? 1 : 3;
  const color = Buffer.alloc(width * height * colors);
  const alpha = Buffer.alloc(width * height, 255);
  for (let i = 0; i < width * height; i++) {
    const offset = i * channels;
    if (type === 3) {
      const index = pixels[offset];
      if (!palette || index * 3 + 2 >= palette.length) invalid();
      palette.copy(color, i * 3, index * 3, index * 3 + 3);
      alpha[i] = transparency?.[index] ?? 255;
    } else {
      pixels.copy(color, i * colors, offset, offset + colors);
      if (type === 4 || type === 6) alpha[i] = pixels[offset + colors];
      else if (type === 0 && transparency?.length === 2 && transparency.readUInt16BE(0) === pixels[offset])
        alpha[i] = 0;
      else if (
        type === 2 &&
        transparency?.length === 6 &&
        [0, 1, 2].every((c) => transparency.readUInt16BE(c * 2) === pixels[offset + c])
      )
        alpha[i] = 0;
    }
  }
  return {
    width,
    height,
    colors,
    filter: 'FlateDecode',
    data: deflateSync(color),
    ...(alpha.some((value) => value !== 255) ? { alpha: deflateSync(alpha) } : {}),
  };
}

export function preparePdfImage(data: Uint8Array, mime: string): PdfImage {
  const buffer = Buffer.from(data);
  if (buffer.length > 2 * 1024 * 1024) invalid();
  if (mime === 'image/jpeg') {
    if (
      buffer.length < 20 ||
      buffer[0] !== 255 ||
      buffer[1] !== 216 ||
      buffer.at(-2) !== 255 ||
      buffer.at(-1) !== 217
    )
      invalid();
    return jpeg(buffer);
  }
  if (mime === 'image/png') return png(buffer);
  return invalid();
}
