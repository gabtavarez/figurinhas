// Gera os ícones PNG do app sem dependências
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };

function shade(x, y, full) { // coords 0..1
  const BG = [11, 20, 26], G = [0, 168, 132], D = [4, 34, 27];
  const r = 0.18, m = 0.17, ax = Math.max(Math.abs(x - 0.5) - (0.5 - m - r), 0), ay = Math.max(Math.abs(y - 0.5) - (0.5 - m - r), 0);
  if (!full && Math.hypot(ax, ay) > r) return BG;
  const eye = (cx) => ((x - cx) / 0.035) ** 2 + ((y - 0.41) / 0.05) ** 2 <= 1;
  if (eye(0.385) || eye(0.615)) return D;
  const d = Math.hypot(x - 0.5, y - 0.5);
  if (y > 0.52 && d > 0.15 && d < 0.195) return D;
  return G;
}
export function png(n, full = false) {
  const raw = Buffer.alloc((n * 3 + 1) * n); const S = 4;
  for (let y = 0; y < n; y++) {
    raw[y * (n * 3 + 1)] = 0;
    for (let x = 0; x < n; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) { const c = shade((x + (sx + 0.5) / S) / n, (y + (sy + 0.5) / S) / n, full); acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; }
      const o = y * (n * 3 + 1) + 1 + x * 3; raw[o] = acc[0] / 16; raw[o + 1] = acc[1] / 16; raw[o + 2] = acc[2] / 16;
    }
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(n, 0); ih.writeUInt32BE(n, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
if (process.argv[2] === 'ios') {
  writeFileSync(new URL('./ios/Figurinhas/Assets.xcassets/AppIcon.appiconset/icon-1024.png', import.meta.url), png(1024, true));
} else {
  for (const n of [180, 192, 512]) writeFileSync(new URL(`./public/icon-${n}.png`, import.meta.url), png(n));
}
console.log('ícones ok');
