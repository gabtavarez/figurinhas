// Importa pacote do Telegram (opcional: requer TELEGRAM_BOT_TOKEN)
const NAME = /^[A-Za-z0-9_]{1,64}$/;

export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(501).json({ error: 'Importação do Telegram desativada (falta TELEGRAM_BOT_TOKEN).' });
  const name = String(req.query.name || '').replace(/^.*addstickers\//, '').replace(/[/?#].*$/, '');
  if (!NAME.test(name)) return res.status(400).json({ error: 'Nome de pacote inválido' });
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getStickerSet?name=${name}`);
    const j = await r.json();
    if (!j.ok) return res.status(404).json({ error: 'Pacote não encontrado' });
    const all = j.result.stickers;
    const stickers = all
      .filter((s) => !s.is_animated && !s.is_video)
      .map((s) => ({ f: s.file_id, emoji: s.emoji || '' }));
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json({ name, title: j.result.title, stickers, skipped: all.length - stickers.length });
  } catch (e) {
    res.status(502).json({ error: 'Falha ao falar com o Telegram' });
  }
}
