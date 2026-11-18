// Converte figurinha de vídeo do Telegram (WEBM VP9 com transparência) para o formato animado do WhatsApp
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const MAX_ANIM = 500 * 1024;

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg: ' + err.slice(-400)))));
  });
}

async function withTmp(buf, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'fig-'));
  const input = join(dir, 'in.webm');
  await writeFile(input, buf);
  try { return await fn(input, dir); } finally { rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

// libvpx-vp9 como decodificador preserva o canal alfa (o decodificador nativo descarta)
async function decodeArgs(input) { return ['-c:v', 'libvpx-vp9', '-i', input]; }

const FIT = 'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0';

export async function videoToWaWebp(buf) {
  return withTmp(buf, async (input, dir) => {
    const out = join(dir, 'out.webp');
    let last;
    for (const [fps, q] of [[20, 70], [15, 55], [12, 40], [10, 25]]) {
      const run = (dec) => ffmpeg([...dec, '-t', '10', '-an', '-vf', `fps=${fps},${FIT}`,
        '-c:v', 'libwebp_anim', '-lossless', '0', '-q:v', String(q), '-compression_level', '4', '-loop', '0', out]);
      try { await run(await decodeArgs(input)); } catch { await run(['-i', input]); }
      last = await readFile(out);
      if (last.length <= MAX_ANIM) return last;
    }
    return last;
  });
}

export async function videoFirstFrame(buf) {
  return withTmp(buf, async (input, dir) => {
    const out = join(dir, 'f.png');
    const run = (dec) => ffmpeg([...dec, '-frames:v', '1', '-vf', FIT, out]);
    try { await run(await decodeArgs(input)); } catch { await run(['-i', input]); }
    return readFile(out);
  });
}
