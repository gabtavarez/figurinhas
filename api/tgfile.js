import { validFileId, getTgFile } from './_tg.js';

export default async function handler(req, res) {
  const f = String(req.query.f || '');
  if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(501).send('disabled');
  if (!validFileId(f)) return res.status(400).send('bad request');
  try {
    const buf = await getTgFile(f);
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    res.status(200).send(buf);
  } catch {
    res.status(502).send('upstream error');
  }
}
