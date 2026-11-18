// ---------- utils ----------
const $ = (s) => document.querySelector(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }

// ---------- IndexedDB (figurinhas próprias) ----------
const idb = new Promise((res, rej) => {
  const r = indexedDB.open('figs', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('own', { keyPath: 'oid', autoIncrement: true });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
async function idbAll() { const db = await idb; return new Promise((res) => { const q = db.transaction('own').objectStore('own').getAll(); q.onsuccess = () => res(q.result); }); }
async function idbPut(blob) { const db = await idb; return new Promise((res) => { const q = db.transaction('own', 'readwrite').objectStore('own').add({ blob, t: Date.now() }); q.onsuccess = () => res(q.result); }); }
async function idbDel(oid) { const db = await idb; return new Promise((res) => { const tx = db.transaction('own', 'readwrite'); tx.objectStore('own').delete(oid); tx.oncomplete = res; }); }
const ownUrls = new Map();

// ---------- modelo ----------
// sticker ref: {src:'sig',id,key,s} | {src:'tg',f} | {src:'own',oid}
const refKey = (r) => r.src === 'sig' ? `sig:${r.id}:${r.s}` : r.src === 'tg' ? `tg:${r.f}` : r.src === 'stly' ? `stly:${r.u}` : `own:${r.oid}`;
function stickerUrl(r) {
  if (r.src === 'sig') return `/api/sticker?id=${r.id}&key=${r.key}&s=${r.s}`;
  if (r.src === 'tg') return `/api/tgfile?f=${encodeURIComponent(r.f)}`;
  if (r.src === 'stly') return `/api/stfile?u=${encodeURIComponent(r.u)}`;
  return ownUrls.get(r.oid) || '';
}

let INDEX = [];
const rowById = (id) => id && INDEX.find((r) => r[0] === id);
const manifests = new Map(); // id -> Promise<pack>
function getManifest(id, key) {
  if (!manifests.has(id)) {
    const p = fetch(`/api/pack?id=${id}&key=${key}`).then((r) => { if (!r.ok) throw new Error('pack'); return r.json(); });
    p.catch(() => manifests.delete(id));
    manifests.set(id, p);
  }
  return manifests.get(id);
}

// fila simples p/ não disparar 30 requests de uma vez
const queue = []; let running = 0;
function enqueue(fn) { return new Promise((res, rej) => { queue.push([fn, res, rej]); pump(); }); }
function pump() { while (running < 6 && queue.length) { const [fn, res, rej] = queue.shift(); running++; fn().then(res, rej).finally(() => { running--; pump(); }); } }

// ---------- explorar ----------
const CHIPS = [
  ['Para você', '@foryou'], ['Surpresa', '@random'], ['Destaques', '*'], ['Memes', 'meme'], ['Gatos', 'cat'], ['Cachorros', 'dog'], ['Anime', 'anime'],
  ['Fofos', 'cute'], ['Amor', 'love'], ['Animais', 'animal'], ['Games', 'game'], ['Pokémon', 'pokemon'],
  ['Desenhos', 'cartoon'], ['Frases', 'text'], ['Comida', 'food'], ['Pixel', 'pixel'], ['Animadas', '@anim'],
];
let current = []; let shown = 0; let activeChip = '@foryou';
const PAGE = 30;

// ---------- recomendação ----------
// gostos base + o que você abre/salva/favorita/copia (aprende sozinho, fica só no aparelho)
const tokens = (row) => row[2].toLowerCase().split(/[\s,]+/).filter(Boolean);
const CATS = {
  anime: [3, 'anime manga kawaii chibi otaku waifu japan japanese аниме'],
  funny: [3, 'funny meme memes lol humor reaction pepe sadpepe troll doge mood мем мемы смешные юмор'],
  animals: [2.5, 'animal animals животные cat cats кот коты кошка dog dogs собака собаки fox лиса bear медведь rabbit bunny panda pig duck frog hamster capybara owl'],
  cute: [1, 'cute милота emotions эмоции'],
  avoid: [-4, 'hk hong kong hkg hongkong'],
};
const CAT_SETS = Object.fromEntries(Object.entries(CATS).map(([k, [w, words]]) => [k, [w, new Set(words.split(' '))]]));
const catsOf = (row) => { const t = tokens(row); return Object.keys(CAT_SETS).filter((c) => t.some((x) => CAT_SETS[c][1].has(x))); };
function learn(row, w) {
  if (!row) return;
  const t = store.get('taste', {});
  for (const k of new Set(tokens(row))) t[k] = Math.min(12, (t[k] || 0) + w);
  store.set('taste', t);
  const seen = store.get('seen', []); if (!seen.includes(row[0])) { seen.push(row[0]); store.set('seen', seen.slice(-800)); }
}
function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
const today = () => new Date().toISOString().slice(0, 10);
function shuffled(rows, seed) {
  const r = rng(seed), a = rows.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function forYou() {
  const taste = store.get('taste', {}), seen = new Set(store.get('seen', [])), r = rng('fy' + today());
  const scored = INDEX.map((row) => {
    let sc = 0;
    for (const c of catsOf(row)) sc += CAT_SETS[c][0];
    let learned = 0; for (const k of new Set(tokens(row))) learned += taste[k] || 0;
    sc += Math.min(6, learned * 0.4);
    if (row[3] & 2) sc += 1;            // escolha dos editores
    if (seen.has(row[0])) sc -= 4;      // prioriza pacotes que você ainda não viu
    return [sc + r() * 3, row];         // pitada de aleatório: muda todo dia
  });
  scored.sort((a, b) => b[0] - a[0]);
  // diversidade: evita 3 pacotes seguidos do mesmo "tema principal"
  const out = [], hold = [];
  const theme = (row) => catsOf(row).find((c) => c !== 'cute' && c !== 'avoid') || 'x';
  for (const [, row] of scored) {
    const n = out.length;
    if (n >= 2 && theme(out[n - 1]) === theme(row) && theme(out[n - 2]) === theme(row)) hold.push(row);
    else { out.push(row); if (hold.length && theme(hold[0]) !== theme(row)) out.push(hold.shift()); }
  }
  return out.concat(hold);
}
let surpriseN = 0;

function filterIndex(q) {
  if (q === '@foryou') return forYou();
  if (q === '@random') return shuffled(INDEX, 'rnd' + Date.now() + (surpriseN++));
  if (q === '*' || !q) return INDEX;
  if (q === '@anim') return INDEX.filter((r) => r[3] & 1);
  const terms = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
  return INDEX.filter((r) => {
    const hay = (r[2] + ' ' + (r._t || '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return terms.every((t) => hay.includes(t));
  });
}

function renderChips() {
  const c = $('#chips'); c.innerHTML = '';
  for (const [label, q] of CHIPS) {
    const b = el('button', 'chip' + (q === activeChip ? ' on' : ''), label);
    b.onclick = () => { activeChip = q; $('#q').value = ''; renderChips(); runList(filterIndex(q), label); };
    c.append(b);
  }
}

function runList(rows, label) {
  current = rows; shown = 0; $('#packs').innerHTML = '';
  $('#exploreMeta').textContent = `${rows.length.toLocaleString('pt-BR')} pacotes${label ? ' · ' + label : ''}`;
  more();
}
function more() {
  const box = $('#packs');
  for (const row of current.slice(shown, shown + PAGE)) box.append(packCard({ src: 'sig', id: row[0], key: row[1], anim: row[3] & 1, row }));
  shown += PAGE;
}

const io = new IntersectionObserver((ents) => {
  for (const e of ents) if (e.isIntersecting) { io.unobserve(e.target); e.target._load?.(); }
}, { rootMargin: '400px' });

function packCard(p) {
  const card = el('button', 'pack');
  const cov = el('div', 'cov sk'); const img = el('img'); img.alt = ''; cov.append(img);
  const t = el('div', 't', p.title || ' '); const s = el('div', 's', ' ');
  card.append(cov, t, s);
  const fill = (title, count, coverUrl) => {
    t.textContent = title || 'Sem título';
    s.textContent = '';
    if (p.anim) s.append(el('span', 'badge', 'ANIM'));
    s.append(`${count} figurinhas`);
    img.onload = () => { img.classList.add('ok'); cov.classList.remove('sk'); };
    img.onerror = () => cov.classList.remove('sk');
    img.src = coverUrl;
  };
  if (p.src === 'sig') {
    card._load = () => enqueue(() => getManifest(p.id, p.key)).then((m) => {
      if (p.row) p.row._t = m.title + ' ' + m.author;
      fill(m.title, m.stickers.length, stickerUrl({ src: 'sig', id: p.id, key: p.key, s: m.cover?.id ?? 0 }));
    }).catch(() => { t.textContent = 'Indisponível'; cov.classList.remove('sk'); });
    io.observe(card);
  } else if (p.src === 'tg' || p.src === 'stly') {
    fill(p.title, p.stickers.length, stickerUrl(refOf(p, p.stickers[0] || {})));
  }
  card.onclick = () => openPack(p);
  return card;
}

// ---------- pacote ----------
let viewPack = null;
async function openPack(p) {
  viewPack = p; learn(p.row || rowById(p.id), 1);
  const v = $('#packView'); v.hidden = false; v.scrollTop = 0;
  $('#pvTitle').textContent = p.title || 'Carregando…'; $('#pvSub').textContent = '';
  const grid = $('#pvGrid'); grid.innerHTML = ''; $('#pvAdd').innerHTML = '';
  syncSaveBtn();
  history.pushState({ v: 'pack' }, '');
  let refs = [];
  try {
    if (p.src === 'sig') {
      const m = await getManifest(p.id, p.key);
      p.title = m.title; $('#pvTitle').textContent = m.title || 'Sem título';
      $('#pvSub').textContent = `${m.stickers.length} figurinhas${m.author ? ' · ' + m.author : ''}`;
      refs = m.stickers.map((s) => ({ src: 'sig', id: p.id, key: p.key, s: s.id, emoji: s.emoji }));
      p.coverS = m.cover?.id ?? 0;
    } else {
      $('#pvTitle').textContent = p.title;
      $('#pvSub').textContent = `${p.stickers.length} figurinhas · ${p.src === 'stly' ? 'Sticker.ly' : 'Telegram'}`;
      refs = p.stickers.map((s) => refOf(p, s));
    }
  } catch { $('#pvSub').textContent = 'Não consegui carregar este pacote.'; return; }
  if (viewPack !== p) return;
  renderAddBar(p, refs);
  for (const r of refs) grid.append(stickerCell(r, refs));
}

// ---------- adicionar pacote inteiro (só no app iOS) ----------
const NATIVE = !!(window.FIG_NATIVE && window.webkit?.messageHandlers?.wa);
function waUrl(r, tray) {
  const q = r.src === 'sig' ? `src=sig&id=${r.id}&key=${r.key}&s=${r.s}` : r.src === 'stly' ? `src=stly&u=${encodeURIComponent(r.u)}` : `src=tg&f=${encodeURIComponent(r.f)}`;
  return `${location.origin}/api/wa?${q}${tray ? '&tray=1' : ''}`;
}
function splitParts(list) {
  const n = Math.ceil(list.length / 30), size = Math.ceil(list.length / n), out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
function renderAddBar(p, refs) {
  const bar = $('#pvAdd'); bar.innerHTML = '';
  if (refs.length < 3) { bar.append(el('p', 'hint', 'O WhatsApp exige pelo menos 3 figurinhas por pacote.')); return; }
  if (!NATIVE) { bar.append(el('p', 'hint', 'Para adicionar o pacote inteiro de uma vez, use o app Figurinhas para iPhone. Aqui no Safari: toque numa figurinha → Copiar.')); return; }
  const parts = splitParts(refs);
  const baseId = p.src === 'sig' ? 'sig_' + p.id : p.src + '_' + p.name;
  parts.forEach((part, i) => {
    const label = parts.length > 1 ? `Adicionar ao WhatsApp · parte ${i + 1}/${parts.length}` : 'Adicionar ao WhatsApp';
    const b = el('button', 'addwa', label);
    b.onclick = () => {
      const cover = refs.find((r) => r.src === 'sig' && r.s === p.coverS) || part[0];
      const name = (p.title || 'Figurinhas') + (parts.length > 1 ? ` (${i + 1}/${parts.length})` : '');
      window.webkit.messageHandlers.wa.postMessage({
        identifier: `${baseId}_${i + 1}`.slice(0, 120),
        name: name.slice(0, 120),
        publisher: 'Figurinhas',
        tray: waUrl(cover, true),
        stickers: part.map((r) => ({ url: waUrl(r), emojis: r.emoji ? [...new Intl.Segmenter().segment(r.emoji)].map((x) => x.segment).slice(0, 3) : [] })),
      });
      learn(p.row || rowById(p.id), 3);
      b.disabled = true; b.textContent = 'Preparando figurinhas…';
      setTimeout(() => { b.disabled = false; b.textContent = label; }, 8000);
    };
    bar.append(b);
  });
}
window.__waStatus = (ok, msg) => toast(msg);
function closePack() { $('#packView').hidden = true; viewPack = null; }
$('#backBtn').onclick = () => history.back();

function packId(p) { return p.src === 'sig' ? 'sig:' + p.id : p.src + ':' + p.name; }
const refOf = (p, s) => p.src === 'stly' ? { src: 'stly', u: s.u, emoji: s.emoji } : { src: 'tg', f: s.f, emoji: s.emoji };
function syncSaveBtn() {
  const saved = store.get('packs', []).some((x) => packId(x) === packId(viewPack));
  const b = $('#pvSave'); b.textContent = saved ? 'Salvo ✓' : 'Salvar'; b.classList.toggle('on', saved);
}
$('#pvSave').onclick = () => {
  const p = viewPack; if (!p) return;
  let list = store.get('packs', []);
  if (list.some((x) => packId(x) === packId(p))) list = list.filter((x) => packId(x) !== packId(p));
  else list.unshift(p.src === 'sig' ? { src: 'sig', id: p.id, key: p.key, anim: p.anim, title: p.title } : { src: p.src, name: p.name, title: p.title, stickers: p.stickers });
  store.set('packs', list); syncSaveBtn(); renderSaved();
  learn(p.row || rowById(p.id), 3);
};

function stickerCell(r) {
  const c = el('button', 'cell'); const img = el('img'); img.alt = r.emoji || ''; img.loading = 'lazy'; img.decoding = 'async';
  img.src = stickerUrl(r); c.append(img);
  c.onclick = () => openSheet(r);
  return c;
}

// ---------- sheet / copiar ----------
let sheetRef = null; let pngPromise = null;

async function toPng(url) {
  const blob = await (await fetch(url)).blob();
  if (blob.type === 'image/png') return blob;
  const bmpUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = bmpUrl; });
    const c = document.createElement('canvas'); c.width = img.naturalWidth || 512; c.height = img.naturalHeight || 512;
    c.getContext('2d').drawImage(img, 0, 0);
    return await new Promise((res) => c.toBlob(res, 'image/png'));
  } finally { URL.revokeObjectURL(bmpUrl); }
}

function openSheet(r) {
  sheetRef = r;
  $('#shImg').src = stickerUrl(r);
  pngPromise = toPng(stickerUrl(r)); pngPromise.catch(() => {});
  syncFav();
  $('#shDel').hidden = r.src !== 'own';
  $('#sheet').hidden = false; $('#sheetBg').hidden = false;
}
function closeSheet() { $('#sheet').hidden = true; $('#sheetBg').hidden = true; sheetRef = null; }
$('#sheetBg').onclick = closeSheet;

$('#shCopy').onclick = async () => {
  if (!sheetRef) return;
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('noclip');
    // Safari exige que o ClipboardItem seja criado dentro do toque, com Promise
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngPromise })]);
    toast('Copiada! Cole no chat do WhatsApp');
    learn(rowById(sheetRef.id), 1);
  } catch (e) {
    if (e.message === 'noclip') return share();
    toast('Não deu pra copiar — tente Compartilhar');
  }
};
async function share() {
  try {
    const blob = await pngPromise;
    const file = new File([blob], 'figurinha.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
    else { const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'figurinha.png'; a.click(); }
  } catch {}
}
$('#shShare').onclick = share;

function favList() { return store.get('favs', []); }
function syncFav() { const on = favList().some((x) => refKey(x) === refKey(sheetRef)); $('#shFav').textContent = on ? '★ Favorita' : '☆ Favoritar'; }
$('#shFav').onclick = () => {
  let l = favList(); const k = refKey(sheetRef);
  if (l.some((x) => refKey(x) === k)) l = l.filter((x) => refKey(x) !== k); else l.unshift(sheetRef);
  store.set('favs', l); syncFav(); renderSaved();
  learn(rowById(sheetRef?.id), 2);
};
$('#shDel').onclick = async () => {
  if (sheetRef?.src !== 'own') return;
  await idbDel(sheetRef.oid);
  store.set('favs', favList().filter((x) => refKey(x) !== refKey(sheetRef)));
  closeSheet(); renderOwn(); renderSaved();
};

// ---------- salvos ----------
function renderSaved() {
  const favs = favList(); const g = $('#favGrid'); g.innerHTML = '';
  for (const r of favs) if (r.src !== 'own' || ownUrls.has(r.oid)) g.append(stickerCell(r));
  $('#favEmpty').hidden = favs.length > 0;
  const packs = store.get('packs', []); const b = $('#savedPacks'); b.innerHTML = '';
  for (const p of packs) b.append(packCard({ ...p }));
  $('#savedEmpty').hidden = packs.length > 0;
}

// ---------- criar ----------
async function renderOwn() {
  const rows = await idbAll();
  for (const r of rows) if (!ownUrls.has(r.oid)) ownUrls.set(r.oid, URL.createObjectURL(r.blob));
  const g = $('#ownGrid'); g.innerHTML = '';
  for (const r of rows.reverse()) g.append(stickerCell({ src: 'own', oid: r.oid }));
}
async function toSticker512(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const pad = 16, max = 512 - pad * 2;
    const sc = Math.min(max / img.naturalWidth, max / img.naturalHeight);
    const w = img.naturalWidth * sc, h = img.naturalHeight * sc;
    c.getContext('2d').drawImage(img, (512 - w) / 2, (512 - h) / 2, w, h);
    return await new Promise((res) => c.toBlob(res, 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
$('#upload').onchange = async (e) => {
  const files = [...e.target.files]; e.target.value = '';
  let n = 0;
  for (const f of files) { try { await idbPut(await toSticker512(f)); n++; } catch {} }
  await renderOwn(); toast(`${n} figurinha(s) criada(s)`);
};

async function importLink(v) {
  const msg = $('#tgMsg'); msg.textContent = 'Buscando…';
  const isStly = /sticker\.ly/i.test(v);
  try {
    const r = await fetch((isStly ? '/api/stly?link=' : '/api/tg?name=') + encodeURIComponent(v)); const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    if (!j.stickers.length) throw new Error('Esse pacote só tem figurinhas animadas/vídeo (ainda não suportado).');
    msg.textContent = `“${j.title}”: ${j.stickers.length} figurinhas` + (j.skipped ? ` (${j.skipped} animadas ignoradas)` : '');
    const p = { src: isStly ? 'stly' : 'tg', name: j.name, title: j.title, stickers: j.stickers };
    const list = store.get('packs', []).filter((x) => packId(x) !== packId(p)); list.unshift(p); store.set('packs', list);
    renderSaved(); openPack(p); $('#tgInput').value = '';
    toast('Pacote importado e salvo');
  } catch (err) { msg.textContent = err.message || 'Erro'; toast(err.message || 'Erro ao importar'); }
}
$('#tgForm').onsubmit = (e) => { e.preventDefault(); const v = $('#tgInput').value.trim(); if (v) importLink(v); };

// ---------- busca ----------
let qT;
$('#q').addEventListener('input', () => {
  clearTimeout(qT);
  qT = setTimeout(() => {
    const q = $('#q').value.trim();
    if (/sticker\.ly\/s\/|t\.me\/addstickers\//i.test(q)) { $('#q').value = ''; importLink(q); return; }
    switchTab('explore');
    activeChip = q ? null : '@foryou'; renderChips();
    runList(filterIndex(q || '@foryou'), q ? `“${q}”` : 'Para você');
  }, 220);
});
$('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

// ---------- navegação ----------
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
}
document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => { switchTab(b.dataset.tab); window.scrollTo(0, 0); }));
window.addEventListener('popstate', () => { if (!$('#sheet').hidden) closeSheet(); if (!$('#packView').hidden) closePack(); });

new IntersectionObserver((e) => { if (e[0].isIntersecting && shown < current.length) more(); }, { rootMargin: '600px' }).observe($('#sentinel'));

// instalação
const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
if (!standalone && !store.get('installDismissed', false)) $('#install').hidden = false;
document.querySelector('[data-close-install]').onclick = () => { $('#install').hidden = true; store.set('installDismissed', true); };

// ---------- boot ----------
renderChips();
fetch('/index.json').then((r) => r.json()).then((rows) => { INDEX = rows; runList(forYou(), 'Para você'); });
renderOwn().then(renderSaved);
