// Importação de um pacote do Sticker.ly a partir do link de compartilhamento (uso pessoal, um pacote por vez)
const CODE = /^[A-Za-z0-9]{4,12}$/;
const IMG = /^https:\/\/stickerly\.pstatic\.net\/sticker_pack\/[A-Za-z0-9_-]+\/[A-Za-z0-9]+\/\d+\/[A-Za-z0-9_-]+\.(webp|png)$/;
const UA = 'FigurinhasApp/1.0 (+https://figurinhas-gabtavarez.vercel.app)';

export function parseCode(input) {
  const s = String(input || '').trim();
  const m = s.match(/sticker\.ly\/s\/([A-Za-z0-9]+)/i);
  const code = m ? m[1] : s;
  return CODE.test(code) ? code : null;
}
export const validImg = (u) => IMG.test(u || '');

const decode = (t) => t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export async function getStlyPack(code) {
  const r = await fetch(`https://sticker.ly/s/${code}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9' } });
  if (!r.ok) throw Object.assign(new Error('not found'), { status: 404 });
  const html = await r.text();
  const title = decode((html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)/i) || [])[1] || code).trim();
  const re = new RegExp(`https://stickerly\\.pstatic\\.net/sticker_pack/[A-Za-z0-9_-]+/${code}/\\d+/[A-Za-z0-9_-]+\\.webp`, 'g');
  const urls = [...new Set(html.match(re) || [])];
  if (!urls.length) throw Object.assign(new Error('empty'), { status: 404 });
  return { name: code, title, stickers: urls.map((u) => ({ u, emoji: '' })) };
}
