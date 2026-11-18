import { parseCode, getStlyPack } from './_stly.js';

export default async function handler(req, res) {
  const code = parseCode(req.query.link);
  if (!code) return res.status(400).json({ error: 'Link do Sticker.ly inválido' });
  try {
    const pack = await getStlyPack(code);
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json(pack);
  } catch (e) {
    res.status(e.status || 502).json({ error: e.status === 404 ? 'Pacote não encontrado' : 'Falha ao acessar o Sticker.ly' });
  }
}
