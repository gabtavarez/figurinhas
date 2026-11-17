import { validIds, getSticker, sniffType } from './_signal.js';

export default async function handler(req, res) {
  const { id, key, s } = req.query;
  if (!validIds(id, key) || !/^\d{1,4}$/.test(s || '')) return res.status(400).send('bad request');
  try {
    const buf = await getSticker(id, key, s);
    res.setHeader('Content-Type', sniffType(buf));
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    res.status(200).send(buf);
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=600');
    res.status(502).send('upstream error');
  }
}
