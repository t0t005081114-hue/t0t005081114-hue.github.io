// 60 fps × 3 subframes (t, t+1/180, t+2/180) → ffmpeg tmix per triplet → H.264 → mux with soundtrack.wav
const fs = require('fs'), path = require('path'), { spawn, spawnSync } = require('child_process');
const { openShowreel } = require('./page.cjs');
const [htmlPath, outMp4, wavPath, f0s, f1s] = process.argv.slice(2);
const FPS = 60, SUB = 3, F0 = +(f0s || 0), F1 = +(f1s || 900);
(async () => {
  const dir = path.join(path.dirname(path.resolve(htmlPath)), 'frames');   // on local disk, inside the project folder
  fs.mkdirSync(dir, { recursive: true });
  const tmpVideo = path.join(dir, 'video_only.mp4');
  const { browser, page, errors, fontOK } = await openShowreel(htmlPath);
  console.log('font verified:', JSON.stringify(fontOK));
  const enc = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '1920x1080', '-r', String(FPS), '-i', '-',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-tune', 'animation',
    '-profile:v', 'high', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-r', String(FPS), tmpVideo], { stdio: ['pipe', 'inherit', 'inherit'] });
  const write = buf => new Promise(res => (enc.stdin.write(buf) ? res() : enc.stdin.once('drain', res)));
  const t0 = Date.now(); let maxOnDisk = 0;
  for (let f = F0; f < F1; f++) {
    const subs = [];
    for (let s = 0; s < SUB; s++) {
      const t = f / FPS + s / (FPS * SUB);
      await page.evaluate(x => window.seek(x), t);
      const file = path.join(dir, `sub_${s}.png`);
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
      subs.push(file);
    }
    maxOnDisk = Math.max(maxOnDisk, fs.readdirSync(dir).filter(n => n.startsWith('sub_')).length);
    const r = spawnSync('ffmpeg', ['-v', 'error', '-framerate', String(SUB), '-i', path.join(dir, 'sub_%d.png'),
      '-vf', "tmix=frames=3:weights='1 1 1',select='eq(n\\,2)'", '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
    if (r.status !== 0 || r.stdout.length !== 1920 * 1080 * 3) throw new Error('tmix failed at frame ' + f + ': ' + r.stderr);
    subs.forEach(x => fs.unlinkSync(x));                     // delete the triplet right after blending
    await write(r.stdout);
    if (f % 60 === 59 || f === F1 - 1) { const el = (Date.now() - t0) / 1000; console.log(`frame ${f + 1}/${F1}  ${el.toFixed(0)}s elapsed, ~${(el / (f + 1 - F0) * (F1 - f - 1)).toFixed(0)}s left`); }
  }
  await browser.close();
  enc.stdin.end(); await new Promise(res => enc.on('close', res));
  console.log('max subframes on disk at once:', maxOnDisk);
  const mux = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', tmpVideo, '-i', wavPath, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-t', String((F1 - F0) / FPS), '-movflags', '+faststart', outMp4]);
  if (mux.status !== 0) throw new Error('mux failed: ' + mux.stderr);
  fs.unlinkSync(tmpVideo);
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
  console.log('wrote', outMp4, ((Date.now() - t0) / 1000).toFixed(0) + 's total');
})().catch(e => { console.error(e); process.exit(1); });
