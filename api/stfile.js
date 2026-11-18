import { getStlyImage } from './_stly.js';
import { sniffType } from './_signal.js';

export default async function handler(req, res) {
  try {
    const buf = await getStlyImage(String(req.query.u || ''));
    res.setHeader('Content-Type', sniffType(buf));
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    res.status(200).send(buf);
  } catch (e) {
    res.status(e.status || 502).send(e.status ? 'bad request' : 'upstream error');
  }
}
