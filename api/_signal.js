import crypto from 'node:crypto';

const CDNS = ['https://cdn.signal.org', 'https://cdn-ca.signal.org'];
const HEX32 = /^[0-9a-f]{32}$/;
const HEX64 = /^[0-9a-f]{64}$/;

export function validIds(id, key) {
  return HEX32.test(id || '') && HEX64.test(key || '');
}

function deriveKeys(packKeyHex) {
  const okm = Buffer.from(
    crypto.hkdfSync('sha256', Buffer.from(packKeyHex, 'hex'), Buffer.alloc(32), Buffer.from('Sticker Pack'), 64)
  );
  return { aesKey: okm.subarray(0, 32), macKey: okm.subarray(32, 64) };
}

export function decrypt(blob, packKeyHex) {
  const { aesKey, macKey } = deriveKeys(packKeyHex);
  if (blob.length < 16 + 16 + 32) throw new Error('blob too short');
  const iv = blob.subarray(0, 16);
  const ct = blob.subarray(16, blob.length - 32);
  const mac = blob.subarray(blob.length - 32);
  const expected = crypto.createHmac('sha256', macKey).update(blob.subarray(0, blob.length - 32)).digest();
  if (!crypto.timingSafeEqual(mac, expected)) throw new Error('bad mac');
  const d = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  return Buffer.concat([d.update(ct), d.final()]);
}

async function fetchCdn(path) {
  let lastErr;
  for (const base of CDNS) {
    try {
      const r = await fetch(base + path, { headers: { 'User-Agent': 'Signal-Desktop/7.0.0' } });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      lastErr = new Error('cdn ' + r.status);
      if (r.status === 404 || r.status === 403) break;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// --- minimal protobuf reader ---
function readVarint(buf, pos) {
  let result = 0, shift = 0, b;
  do {
    b = buf[pos++];
    result += (b & 0x7f) * 2 ** shift;
    shift += 7;
  } while (b & 0x80);
  return [result, pos];
}

function parseMessage(buf) {
  const fields = [];
  let pos = 0;
  while (pos < buf.length) {
    let tag;
    [tag, pos] = readVarint(buf, pos);
    const field = Math.floor(tag / 8), wire = tag & 7;
    if (wire === 0) {
      let v; [v, pos] = readVarint(buf, pos); fields.push([field, v]);
    } else if (wire === 2) {
      let len; [len, pos] = readVarint(buf, pos);
      fields.push([field, buf.subarray(pos, pos + len)]); pos += len;
    } else if (wire === 1) { pos += 8; }
    else if (wire === 5) { pos += 4; }
    else throw new Error('bad wire type');
  }
  return fields;
}

function parseSticker(buf) {
  const s = { id: 0, emoji: '' };
  for (const [f, v] of parseMessage(buf)) {
    if (f === 1) s.id = v;
    else if (f === 2) s.emoji = v.toString('utf8');
  }
  return s;
}

export async function getPack(id, key) {
  const manifest = decrypt(await fetchCdn(`/stickers/${id}/manifest.proto`), key);
  const pack = { title: '', author: '', cover: null, stickers: [] };
  for (const [f, v] of parseMessage(manifest)) {
    if (f === 1) pack.title = v.toString('utf8');
    else if (f === 2) pack.author = v.toString('utf8');
    else if (f === 3) pack.cover = parseSticker(v);
    else if (f === 4) pack.stickers.push(parseSticker(v));
  }
  if (!pack.cover && pack.stickers.length) pack.cover = pack.stickers[0];
  return pack;
}

export async function getSticker(id, key, stickerId) {
  return decrypt(await fetchCdn(`/stickers/${id}/full/${stickerId}`), key);
}

export function sniffType(buf) {
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
  return 'application/octet-stream';
}
