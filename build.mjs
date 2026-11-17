// Gera public/index.json a partir do diretório público signalstickers (CC BY-NC-SA 4.0)
import { readFile, writeFile } from 'node:fs/promises';

const SRC = 'https://raw.githubusercontent.com/signalstickers/stickers/master/src/stickers.yml';

export function parse(yml) {
  const packs = []; let cur = null; let inTags = false;
  const unq = (s) => s.trim().replace(/^['"]|['"]$/g, '').replace(/''/g, "'");
  for (const line of yml.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^([0-9a-f]{32}):\s*$/))) { cur = { id: m[1], tags: [] }; packs.push(cur); inTags = false; continue; }
    if (!cur) continue;
    if ((m = line.match(/^ {1,4}([a-z_]+):\s*(.*)$/))) {
      const [, k, v] = m; inTags = k === 'tags' && v === '';
      if (k === 'tags' && v.startsWith('[')) cur.tags = v.slice(1, -1).split(',').map(unq).filter(Boolean);
      else if (k !== 'tags') cur[k] = unq(v);
      continue;
    }
    if (inTags && (m = line.match(/^ {1,8}- (.*)$/))) cur.tags.push(unq(m[1]));
  }
  const ec = [], rest = [];
  for (const p of packs) {
    if (p.nsfw === 'true' || !/^[0-9a-f]{64}$/.test(p.key || '')) continue;
    const f = (p.animated === 'true' ? 1 : 0) | (p.editorschoice === 'true' ? 2 : 0);
    (f & 2 ? ec : rest).push([p.id, p.key, p.tags.join(' '), f]);
  }
  return [...ec, ...rest];
}

const local = process.argv[2];
const yml = local ? await readFile(local, 'utf8') : await (await fetch(SRC)).text();
const rows = parse(yml);
if (rows.length < 100) throw new Error('índice suspeito: ' + rows.length);
await writeFile(new URL('./public/index.json', import.meta.url), JSON.stringify(rows));
console.log('index.json:', rows.length, 'pacotes');
