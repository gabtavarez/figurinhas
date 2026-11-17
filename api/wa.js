// Entrega figurinha no formato exigido pelo WhatsApp:
// sticker = WebP 512x512 <= 100 KB | tray=1 -> PNG 96x96 <= 50 KB
import sharp from 'sharp';
import { validIds, getSticker } from './_signal.js';
import { validFileId, getTgFile } from './_tg.js';

const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const MAX_STICKER = 100 * 1024;
const MAX_TRAY = 50 * 1024;

async function loadSource(q) {
  if (q.src === 'tg') {
    if (!validFileId(q.f)) throw Object.assign(new Error('bad'), { status: 400 });
    return getTgFile(q.f);
  }
  if (!validIds(q.id, q.key) || !/^\d{1,4}$/.test(q.s || '')) throw Object.assign(new Error('bad'), { status: 400 });
  return getSticker(q.id, q.key, q.s);
}

export async function toWaSticker(buf) {
  const meta = await sharp(buf, { animated: true }).metadata();
  const pages = meta.pages || 1;
  if (meta.format === 'webp' && meta.width === 512 && (meta.pageHeight || meta.height) === 512 && pages === 1 && buf.length <= MAX_STICKER) return buf;
  const base = sharp(buf, { animated: false }).resize(512, 512, { fit: 'contain', background: CLEAR });
  let out;
  for (const quality of [90, 80, 70, 60, 50, 40, 30]) {
    out = await base.clone().webp({ quality, alphaQuality: 90, effort: 4 }).toBuffer();
    if (out.length <= MAX_STICKER) return out;
  }
  return out;
}

export async function toWaTray(buf) {
  const base = sharp(buf, { animated: false }).resize(96, 96, { fit: 'contain', background: CLEAR });
  let out = await base.clone().png({ compressionLevel: 9 }).toBuffer();
  if (out.length > MAX_TRAY) out = await base.clone().png({ compressionLevel: 9, palette: true, colors: 128 }).toBuffer();
  return out;
}

export default async function handler(req, res) {
  try {
    const src = await loadSource(req.query);
    const tray = req.query.tray === '1';
    const out = tray ? await toWaTray(src) : await toWaSticker(src);
    res.setHeader('Content-Type', tray ? 'image/png' : 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    res.status(200).send(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(e.status || 502).send(e.status ? 'bad request' : 'upstream error');
  }
}
