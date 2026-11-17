import { validIds, getPack } from './_signal.js';

export default async function handler(req, res) {
  const { id, key } = req.query;
  if (!validIds(id, key)) return res.status(400).json({ error: 'id/key inválidos' });
  try {
    const pack = await getPack(id, key);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=2592000');
    res.status(200).json(pack);
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    res.status(502).json({ error: String(e.message || e) });
  }
}
