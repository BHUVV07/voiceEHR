import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPng(width, height, getPixel) {
  // CRC32 calculation table
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c;
  }

  function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  }

  function writeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(4 + 4 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const typeAndData = buf.subarray(4, 8 + len);
    buf.writeUInt32BE(crc32(typeAndData), 8 + len);
    return buf;
  }

  // Header: 8 bytes
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // Color type: RGBA
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  // Raw image data with 0 filter byte before each line
  const rawData = Buffer.alloc((width * 4 + 1) * height);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    rawData[pos++] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      rawData[pos++] = r;
      rawData[pos++] = g;
      rawData[pos++] = b;
      rawData[pos++] = a;
    }
  }

  const idatData = zlib.deflateSync(rawData);

  const chunks = [
    signature,
    writeChunk('IHDR', ihdr),
    writeChunk('IDAT', idatData),
    writeChunk('IEND', Buffer.alloc(0)),
  ];

  return Buffer.concat(chunks);
}

// Generate an emerald-teal rounded icon with a microphone shape
function getVoiceFlowPixel(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const r = w * 0.46; // Outer radius

  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Background rounded square or circle
  if (dist > r) {
    // Outside boundary with slight antialiasing
    if (dist < r + 1) {
      const alpha = Math.max(0, Math.min(255, Math.round((1 - (dist - r)) * 255)));
      return [16, 185, 129, alpha];
    }
    return [0, 0, 0, 0];
  }

  // Base emerald to teal gradient: #10b981 (16, 185, 129) -> #06b6d4 (6, 182, 212)
  const t = (x + y) / (w + h);
  let bgR = Math.round(16 + (6 - 16) * t);
  let bgG = Math.round(185 + (182 - 185) * t);
  let bgB = Math.round(129 + (212 - 129) * t);

  // Render white microphone symbol in center
  // Mic head: capsule centered at (cx, cy - h*0.08)
  const micW = w * 0.18;
  const micH = h * 0.28;
  const micHeadY = cy - h * 0.08;

  // Check if inside mic capsule
  const inMicHead = Math.abs(x - cx) <= micW && y >= micHeadY - micH / 2 && y <= micHeadY + micH / 2;
  // Check rounded caps of mic head
  const topDist = Math.sqrt((x - cx) ** 2 + (y - (micHeadY - micH / 2)) ** 2);
  const botDist = Math.sqrt((x - cx) ** 2 + (y - (micHeadY + micH / 2)) ** 2);

  if ((inMicHead && (y >= micHeadY - micH / 2 && y <= micHeadY + micH / 2)) || topDist <= micW || botDist <= micW) {
    return [255, 255, 255, 255];
  }

  // Mic stand base line
  if (Math.abs(x - cx) <= w * 0.16 && Math.abs(y - (cy + h * 0.26)) <= Math.max(1, h * 0.03)) {
    return [255, 255, 255, 255];
  }

  // Mic vertical stem
  if (Math.abs(x - cx) <= Math.max(1, w * 0.035) && y >= cy + h * 0.15 && y <= cy + h * 0.26) {
    return [255, 255, 255, 255];
  }

  return [bgR, bgG, bgB, 255];
}

const iconsDir = path.resolve('public/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 32, 48, 128].forEach((size) => {
  const pngBuf = createPng(size, size, getVoiceFlowPixel);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, pngBuf);
  console.log(`Generated icon${size}.png (${size}x${size})`);
});
