const FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;

export function validFileId(f) { return FILE_ID.test(f || ''); }

export async function getTgFile(fileId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('disabled');
  const meta = await (await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`)).json();
  if (!meta.ok) throw new Error('not found');
  const r = await fetch(`https://api.telegram.org/file/bot${token}/${meta.result.file_path}`);
  if (!r.ok) throw new Error('tg ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}
